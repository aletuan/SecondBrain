import fs from 'node:fs/promises';
import path from 'node:path';
import type { OpenAIClientLike } from '../llm/enrich.js';

export function parseDigestMarkdown(raw: string): {
  frontmatter: Record<string, string>;
  body: string;
} {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\s*/.exec(raw);
  if (!m) return { frontmatter: {}, body: raw.trim() };
  const frontmatter: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^\s*([\w.-]+):\s*(.+)\s*$/.exec(line);
    if (!kv) continue;
    let v = kv[2].trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    frontmatter[kv[1]] = v;
  }
  return { frontmatter, body: raw.slice(m[0].length).trim() };
}

export type ChallengeJson = {
  difficulty: string;
  questions: Array<{ question: string; answer_key?: string }>;
};

const CHALLENGE_SYSTEM = `You create reading-comprehension checks using ONLY the digest text the user sends.
Do not add facts, dates, or details that are not explicitly supported by that digest.
Return a single valid JSON object (no markdown fences) with this exact shape:
{"difficulty":"easy"|"medium"|"hard","questions":[{"question":"...","answer_key":"short rubric or expected points"}]}
Use at least 3 questions. Wording can be Vietnamese if the digest is Vietnamese.
answer_key is a short hint for self-check, not an absolute external truth.`;

export async function generateChallengeJson(
  digestBody: string,
  client: OpenAIClientLike,
  model: string,
): Promise<ChallengeJson> {
  const res = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: CHALLENGE_SYSTEM },
      { role: 'user', content: digestBody.slice(0, 24_000) },
    ],
  });
  const text = res.choices[0]?.message?.content?.trim();
  if (!text) throw new Error('challenge: empty completion');
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('challenge: model did not return valid JSON');
  }
  const obj = parsed as ChallengeJson;
  if (!Array.isArray(obj.questions) || obj.questions.length < 1) {
    throw new Error('challenge: invalid or empty questions array');
  }
  return {
    difficulty: obj.difficulty || 'medium',
    questions: obj.questions,
  };
}

export function renderChallengeMarkdown(
  data: ChallengeJson,
  meta: { digestRelPath: string; model: string; weekId: string },
): string {
  const fm = {
    type: 'challenge',
    digest: meta.digestRelPath,
    week: meta.weekId,
    difficulty: data.difficulty,
    model: meta.model,
  };
  const head = ['---'];
  for (const [k, v] of Object.entries(fm)) {
    head.push(`${k}: ${JSON.stringify(String(v))}`);
  }
  head.push('---', '', `# Challenge ${meta.weekId}`, '', '## Câu hỏi', '');
  for (let i = 0; i < data.questions.length; i++) {
    head.push(`${i + 1}. ${data.questions[i]!.question}`, '');
  }
  head.push(
    '## Gợi ý đáp án',
    '',
    '> Chỉ dựa trên digest đã cho; đối chiếu lại nguồn trong vault.',
    '',
  );
  for (let i = 0; i < data.questions.length; i++) {
    head.push(`**${i + 1}.** ${data.questions[i]!.answer_key ?? '—'}`, '');
  }
  return head.join('\n');
}

/** Resolve `2026-W12` → `vaultRoot/Digests/2026-W12.md`. */
export function resolveDigestPathForWeek(vaultRoot: string, weekId: string): string {
  const m = /^(\d{4})-W(\d{2})$/i.exec(weekId.trim());
  if (!m) throw new Error('challenge: week must look like 2026-W12');
  const normalized = `${m[1]}-W${m[2]}`;
  return path.join(vaultRoot, 'Digests', `${normalized}.md`);
}

export async function writeChallengeFromDigestFile(options: {
  digestPath: string;
  vaultRoot: string;
  client?: OpenAIClientLike;
  model?: string;
}): Promise<{ challengePath: string; weekId: string }> {
  const raw = await fs.readFile(options.digestPath, 'utf8');
  const { frontmatter, body } = parseDigestMarkdown(raw);
  const base = path.basename(options.digestPath, '.md');
  const weekId = frontmatter.week ?? base;

  const digestRel = path
    .relative(options.vaultRoot, options.digestPath)
    .split(path.sep)
    .join('/');

  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new Error('challenge: OPENAI_API_KEY is not set');
  const model = options.model ?? process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
  const { default: OpenAI } = await import('openai');
  const client =
    options.client ?? (new OpenAI({ apiKey: key }) as unknown as OpenAIClientLike);

  const json = await generateChallengeJson(body, client, model);
  const md = renderChallengeMarkdown(json, {
    digestRelPath: digestRel,
    model,
    weekId,
  });

  const challengesDir = path.join(options.vaultRoot, 'Challenges');
  await fs.mkdir(challengesDir, { recursive: true });
  const challengePath = path.join(challengesDir, `${weekId}.md`);
  await fs.writeFile(challengePath, md, 'utf8');
  return { challengePath, weekId };
}
