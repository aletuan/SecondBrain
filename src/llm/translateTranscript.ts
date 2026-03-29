import fs from 'node:fs/promises';
import path from 'node:path';
import OpenAI from 'openai';
import type { TranscriptSegment } from '../types/capture.js';
import type { OpenAIClientLike } from './enrich.js';
import { getCaptureFiles } from '../vault/writer.js';

/**
 * Batch EN→VI transcript translation, aligned with
 * `youtube-crawl-translate/scripts/translate_transcript.py`:
 * same line count, JSON array of strings, technical terms kept in English when standard.
 */
const DEFAULT_SYSTEM = `You translate English transcript segments to Vietnamese.

Rules:
- Preserve conversational tone.
- Keep technical terms in English when standard (API, SaaS, Claude Code, Jira, etc.).
- Output EXACTLY one Vietnamese string per input line. Same count. Never merge or skip.
- Reply with a single JSON object only: {"lines":["trans1","trans2",...]} — same length as input. No markdown, no prose before or after.
- If a line is [Music] or similar, output the same.`;

function sanitizeControlChars(s: string): string {
  return s.replace(/[\x00-\x1f\x7f]/g, ' ');
}

/** Strip optional markdown code fence from model output. */
function stripMarkdownFence(raw: string): string {
  let r = raw.trim();
  if (!r.startsWith('```')) return r;
  const withoutFirst = r.split('\n').slice(1).join('\n');
  const end = withoutFirst.indexOf('```');
  r = (end === -1 ? withoutFirst : withoutFirst.slice(0, end)).trim();
  return r;
}

/**
 * Extract Vietnamese line strings from model output: JSON object `{"lines":[...]}` (preferred),
 * or a raw JSON array, or first parseable array substring.
 */
export function extractJsonStringArray(raw: string): string[] {
  let r = stripMarkdownFence(raw.trim());

  const parseValue = (s: string): string[] | null => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(s) as unknown;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('control character') || msg.includes('Invalid control')) {
        try {
          parsed = JSON.parse(sanitizeControlChars(s)) as unknown;
        } catch {
          return null;
        }
      } else {
        return null;
      }
    }
    if (Array.isArray(parsed)) {
      return parsed.map((x) => String(x ?? '').trim());
    }
    if (parsed && typeof parsed === 'object') {
      const o = parsed as Record<string, unknown>;
      for (const key of ['lines', 'translations', 'vi'] as const) {
        const v = o[key];
        if (Array.isArray(v)) return v.map((x) => String(x ?? '').trim());
      }
    }
    return null;
  };

  const direct = parseValue(r);
  if (direct) return direct;

  let depth = 0;
  let start = -1;
  for (let i = 0; i < r.length; i += 1) {
    const c = r[i];
    if (c === '[') {
      if (depth === 0) start = i;
      depth += 1;
    } else if (c === ']') {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        const slice = r.slice(start, i + 1);
        const inner = parseValue(slice);
        if (inner) return inner;
      }
    }
  }

  const snippet = r.length > 220 ? `${r.slice(0, 220)}…` : r;
  throw new Error(
    `translateTranscript: expected JSON object {"lines":[...]} or JSON array in model output (got: ${snippet.replace(/\s+/g, ' ')})`,
  );
}

export type TranslateTranscriptOptions = {
  client: OpenAIClientLike;
  model: string;
  systemPrompt?: string;
  /** Lines per API call (env YT_TRANSLATE_BATCH overrides when not passed). */
  batchSize?: number;
};

function batchSizeFromEnvOr(options?: number): number {
  if (options != null && Number.isFinite(options) && options > 0) return Math.floor(options);
  const n = Number(process.env.YT_TRANSLATE_BATCH);
  if (Number.isFinite(n) && n > 0) return Math.floor(n);
  return 20;
}

export async function translateTranscriptSegments(
  segments: TranscriptSegment[],
  opts: TranslateTranscriptOptions,
): Promise<TranscriptSegment[]> {
  if (segments.length === 0) return [];
  const system = opts.systemPrompt ?? DEFAULT_SYSTEM;
  const batchSize = batchSizeFromEnvOr(opts.batchSize);
  const out: TranscriptSegment[] = [];

  for (let i = 0; i < segments.length; i += batchSize) {
    const batch = segments.slice(i, i + batchSize);
    const texts = batch.map((s) => (s.text.trim() ? s.text : ' '));
    const userContent = `Translate these ${texts.length} lines to Vietnamese. Reply with JSON only: {"lines":[...]} with exactly ${texts.length} strings (same order).\n\n${texts.map((t, j) => `${j + 1}. ${t}`).join('\n')}`;

    const baseParams = {
      model: opts.model,
      messages: [
        { role: 'system' as const, content: system },
        { role: 'user' as const, content: userContent },
      ],
    };

    let res: Awaited<ReturnType<OpenAIClientLike['chat']['completions']['create']>>;
    try {
      res = await opts.client.chat.completions.create({
        ...baseParams,
        response_format: { type: 'json_object' },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/response_format|json_object|unsupported.*format/i.test(msg)) {
        res = await opts.client.chat.completions.create(baseParams);
      } else {
        throw e;
      }
    }
    const raw = res.choices[0]?.message?.content?.trim();
    if (!raw) throw new Error('translateTranscript: empty completion');
    let arr = extractJsonStringArray(raw);
    while (arr.length < texts.length) arr.push('');
    arr = arr.slice(0, texts.length);

    for (let j = 0; j < batch.length; j += 1) {
      const vi = arr[j] ?? '';
      out.push({
        startSec: batch[j]!.startSec,
        text: vi.trim() || batch[j]!.text,
      });
    }
  }

  return out;
}

/** Parse `## Transcript (en)` block from vault `source.md` (timestamp lines **m:ss**). */
export function parseEnTranscriptFromSourceMarkdown(md: string): TranscriptSegment[] {
  const marker = '## Transcript (en)';
  const idx = md.indexOf(marker);
  if (idx === -1) return [];
  const after = md.slice(idx + marker.length);
  const next = after.search(/\n## [^#]/);
  const block = (next === -1 ? after : after.slice(0, next)).trim();
  const segs: TranscriptSegment[] = [];
  const ts = /^\*\*(\d+):(\d{2})\*\*\s+(.+)$/;
  for (const line of block.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('>')) continue;
    const m = ts.exec(t);
    if (m) {
      const mm = parseInt(m[1]!, 10);
      const ss = parseInt(m[2]!, 10);
      segs.push({ startSec: mm * 60 + ss, text: m[3]!.trim() });
    } else {
      segs.push({ text: t });
    }
  }
  return segs;
}

function buildViTranscriptMarkdownBody(viSegments: TranscriptSegment[]): string {
  const disclaimer =
    '> Bản dịch do LLM tạo; đối chiếu với **Transcript (en)** khi cần độ chính xác.';
  const bodyLines: string[] = [
    '## Transcript (vi) — bản dịch (LLM)',
    '',
    disclaimer,
    '',
  ];
  for (const seg of viSegments) {
    if (seg.startSec != null && Number.isFinite(seg.startSec)) {
      const mm = Math.floor(seg.startSec / 60);
      const ss = Math.floor(seg.startSec % 60);
      const stamp = `${mm}:${String(ss).padStart(2, '0')}`;
      bodyLines.push(`**${stamp}** ${seg.text}`, '');
    } else {
      bodyLines.push(seg.text, '');
    }
  }
  return `${bodyLines.join('\n').trimEnd()}\n`;
}

/** Insert or replace `## Transcript (vi) — bản dịch (LLM)` section (next H2 ends the block). */
export function injectViTranscriptSection(
  sourceMd: string,
  viSegments: TranscriptSegment[],
): string {
  const viBlock = buildViTranscriptMarkdownBody(viSegments);
  const idx = sourceMd.search(/## Transcript \(vi\)/i);
  if (idx === -1) {
    return `${sourceMd.trimEnd()}\n\n${viBlock}`;
  }
  const lineStart = sourceMd.lastIndexOf('\n', idx);
  const cutStart = lineStart === -1 ? 0 : lineStart;
  const fromHeading = sourceMd.slice(cutStart);
  const afterFirstLine = fromHeading.indexOf('\n');
  const rest =
    afterFirstLine === -1 ? '' : fromHeading.slice(afterFirstLine + 1);
  const nextH2 = rest.search(/\n## [^#]/);
  const cutEnd =
    nextH2 === -1
      ? sourceMd.length
      : cutStart + afterFirstLine + 1 + nextH2 + 1;
  return `${sourceMd.slice(0, cutStart).trimEnd()}\n\n${viBlock}${sourceMd.slice(cutEnd)}`;
}

/** Read `source.md` in a capture folder, translate EN transcript, write Vi section (idempotent replace). */
export async function applyTranslationToCaptureSource(options: {
  captureDir: string;
  client?: OpenAIClientLike;
  model?: string;
  apiKey?: string;
}): Promise<void> {
  const { sourcePath } = await getCaptureFiles(options.captureDir);
  const raw = await fs.readFile(sourcePath, 'utf8');
  const segs = parseEnTranscriptFromSourceMarkdown(raw);
  if (segs.length === 0) {
    throw new Error(
      'translate-transcript: no segments under ## Transcript (en) in source.md',
    );
  }
  const key = options.apiKey ?? process.env.OPENAI_API_KEY;
  if (!key?.trim()) throw new Error('translate-transcript: OPENAI_API_KEY is not set');
  const model =
    options.model?.trim() ||
    process.env.YT_TRANSLATE_MODEL?.trim() ||
    process.env.OPENAI_MODEL ||
    'gpt-4o-mini';
  const client =
    options.client ??
    (new OpenAI({ apiKey: key }) as unknown as OpenAIClientLike);
  const vi = await translateTranscriptSegments(segs, { client, model });
  const next = injectViTranscriptSection(raw, vi);
  await fs.writeFile(sourcePath, next, 'utf8');
}
