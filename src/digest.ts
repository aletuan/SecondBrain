import fs from 'node:fs/promises';
import path from 'node:path';
import OpenAI from 'openai';
import { utcDigestWeekId } from './digest/isoWeek.js';
import type { OpenAIClientLike } from './llm/enrich.js';
import { getCaptureFiles, getSlugFromDir } from './vault/writer.js';

function parseSinceDurationMs(since: string): number {
  const m = /^(\d+)d$/.exec(since.trim());
  if (!m) throw new Error('digest: expected --since like 7d');
  return Number(m[1]) * 86_400_000;
}

function parseIngestedAt(noteRaw: string): number | null {
  const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(noteRaw);
  if (!block) return null;
  for (const line of block[1].split(/\r?\n/)) {
    const m = /^\s*ingested_at:\s*(.+)$/.exec(line);
    if (!m) continue;
    let v = m[1].trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    const t = Date.parse(v);
    if (!Number.isNaN(t)) return t;
  }
  return null;
}

export type DigestItem = { wikilink: string; title: string; excerpt: string };

export async function collectDigestItems(
  vaultRoot: string,
  sinceMs: number,
  now: Date,
): Promise<DigestItem[]> {
  const base = path.join(vaultRoot, 'Captures');
  const out: DigestItem[] = [];
  let entries;
  try {
    entries = await fs.readdir(base, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const folder = path.join(base, String(e.name));
    const { notePath } = await getCaptureFiles(folder);
    let raw: string;
    try {
      raw = await fs.readFile(notePath, 'utf8');
    } catch {
      continue;
    }
    const ing = parseIngestedAt(raw);
    if (ing === null) continue;
    if (now.getTime() - ing > sinceMs) continue;
    const titleLine = raw.match(/^#\s+(.+)$/m);
    const title = titleLine?.[1]?.trim() ?? String(e.name);
    const body = raw.replace(/^---[\s\S]*?---\s*/, '');
    const excerpt = body.replace(/^#\s+.+\r?\n+/, '').trim().slice(0, 400);
    const slug = getSlugFromDir(String(e.name));
    out.push({
      wikilink: `Captures/${String(e.name)}/${slug}.note`,
      title,
      excerpt,
    });
  }
  return out;
}

/**
 * Digest markdown already has `## Tổng quan` before the LLM block; models often echo the same heading.
 */
export function stripLlmTongQuanHeadingPrefix(md: string): string {
  let t = md.trimStart();
  for (;;) {
    const m = /^(##\s+Tổng quan\s*(?:\r?\n)+)/i.exec(t);
    if (!m) break;
    t = t.slice(m[0].length);
  }
  return t.trim();
}

export function digestLlmCharBudget(): number {
  const n = Number(process.env.DIGEST_LLM_MAX_CHARS);
  if (Number.isFinite(n) && n > 500) return Math.floor(n);
  return 12_000;
}

/** Split items so concatenated `## title\nexcerpt` blocks stay under ~maxChars. */
export function chunkDigestItemsForLlm(
  items: DigestItem[],
  maxChars: number,
): DigestItem[][] {
  const chunks: DigestItem[][] = [];
  let cur: DigestItem[] = [];
  let size = 0;
  for (const i of items) {
    const piece = `## ${i.title}\n${i.excerpt}`.length + 2;
    if (size + piece > maxChars && cur.length > 0) {
      chunks.push(cur);
      cur = [];
      size = 0;
    }
    cur.push(i);
    size += piece;
  }
  if (cur.length > 0) chunks.push(cur);
  return chunks;
}

async function synthesizeDigestMarkdown(
  client: OpenAIClientLike,
  model: string,
  blob: string,
): Promise<string> {
  const res = await client.chat.completions.create({
    model,
    messages: [
      {
        role: 'system',
        content:
          'You write a short weekly digest body in Vietnamese Markdown (bullets or short paragraphs only). Do not include a ## Tổng quan heading — that heading already exists in the file above your output.',
      },
      { role: 'user', content: blob },
    ],
  });
  return (res.choices[0]?.message?.content ?? '').trim();
}

async function mergeDigestChunkSummaries(
  client: OpenAIClientLike,
  model: string,
  parts: string[],
): Promise<string> {
  const blob = parts.map((p, idx) => `### Phần ${idx + 1}\n\n${p}`).join('\n\n');
  const res = await client.chat.completions.create({
    model,
    messages: [
      {
        role: 'system',
        content:
          'Gộp các đoạn tóm tắt sau thành một bài tiếng Việt (bullet hoặc đoạn ngắn). Không dùng tiêu đề ## Tổng quan. Không thêm fact mới; có thể rút gọn trùng lặp.',
      },
      { role: 'user', content: blob },
    ],
  });
  return (res.choices[0]?.message?.content ?? '').trim();
}

async function synthesizeDigestMarkdownWithChunking(
  client: OpenAIClientLike,
  model: string,
  items: DigestItem[],
): Promise<string> {
  const maxChars = digestLlmCharBudget();
  const blob = items.map((i) => `## ${i.title}\n${i.excerpt}`).join('\n\n');
  if (blob.length <= maxChars) {
    return synthesizeDigestMarkdown(client, model, blob);
  }
  const chunks = chunkDigestItemsForLlm(items, maxChars);
  const partials: string[] = [];
  for (let c = 0; c < chunks.length; c += 1) {
    const part = chunks[c]!;
    const b = part.map((i) => `## ${i.title}\n${i.excerpt}`).join('\n\n');
    const header = `Đây là nhóm ${c + 1}/${chunks.length} các capture trong digest tuần. Viết 3–6 bullet tiếng Việt, không thêm tiêu đề ## Tổng quan — chỉ dựa trên nội dung dưới đây.\n\n`;
    partials.push(await synthesizeDigestMarkdown(client, model, header + b));
  }
  if (partials.length === 1) return partials[0]!;
  return mergeDigestChunkSummaries(client, model, partials);
}

export async function generateDigest(options: {
  vaultRoot: string;
  since: string;
  now?: Date;
  skipLlm?: boolean;
  client?: OpenAIClientLike;
  model?: string;
}): Promise<{ digestPath: string; weekId: string }> {
  const now = options.now ?? new Date();
  const sinceMs = parseSinceDurationMs(options.since);
  const items = await collectDigestItems(options.vaultRoot, sinceMs, now);
  const weekId = utcDigestWeekId(now);
  const digestsDir = path.join(options.vaultRoot, 'Digests');
  await fs.mkdir(digestsDir, { recursive: true });
  const digestPath = path.join(digestsDir, `${weekId}.md`);

  const lines = items.map((i) => `- [[${i.wikilink}|${i.title}]]`);
  let llmBlock = '';
  const useLlm =
    !options.skipLlm && Boolean(process.env.OPENAI_API_KEY?.trim()) && items.length > 0;
  if (useLlm) {
    const model = options.model ?? process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
    const client =
      options.client ??
      (new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) as unknown as OpenAIClientLike);
    llmBlock = stripLlmTongQuanHeadingPrefix(
      await synthesizeDigestMarkdownWithChunking(client, model, items),
    );
  }

  const header = `---
type: digest
week: ${weekId}
since: ${JSON.stringify(options.since)}
generated_at: ${now.toISOString()}
---

# Digest ${weekId}

## Captures

${lines.join('\n') || '- (none in range)'}

## Tổng quan

${llmBlock || '(No OpenAI key, skip, or no captures — set OPENAI_API_KEY for LLM summary.)'}
`;

  await fs.writeFile(digestPath, header, 'utf8');
  return { digestPath, weekId };
}
