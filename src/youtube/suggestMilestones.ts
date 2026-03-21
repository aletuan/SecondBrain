import fs from 'node:fs/promises';
import path from 'node:path';
import type { OpenAIClientLike } from '../llm/enrich.js';
import { parseEnTranscriptFromSourceMarkdown } from '../llm/translateTranscript.js';
import type { YoutubeMilestone } from './milestones.js';
import { milestonesToYaml, mergeMilestones, parseMilestonesYaml } from './milestones.js';

function extractJsonObject(raw: string): Record<string, unknown> {
  let r = raw.trim();
  if (r.startsWith('```')) {
    r = r.split('\n', 2)[1] ?? r;
    r = r.split('```')[0]?.trim() ?? r;
  }
  const out = JSON.parse(r) as unknown;
  if (!out || typeof out !== 'object' || Array.isArray(out)) {
    throw new Error('suggestMilestones: expected JSON object');
  }
  return out as Record<string, unknown>;
}

const SYSTEM = `You suggest YouTube chapter/highlight milestones from an English transcript only.
Return JSON: { "milestones": [ { "t": number (seconds, integer), "label": string (short Vietnamese or English), "kind": "chapter" | "highlight" } ] }
Rules:
- At most 12 items; only moments that help navigation.
- "t" must be within 0 and maxSec (inclusive).
- Do not invent content not implied by the transcript lines.`;

export async function suggestMilestonesFromTranscript(options: {
  segments: { startSec?: number; text: string }[];
  maxSec: number;
  client: OpenAIClientLike;
  model: string;
}): Promise<YoutubeMilestone[]> {
  if (!Number.isFinite(options.maxSec) || options.maxSec <= 0) {
    throw new Error('suggestMilestones: maxSec must be a positive number');
  }
  const lines = options.segments.map((s, i) => {
    const t =
      s.startSec != null && Number.isFinite(s.startSec)
        ? `${Math.floor(s.startSec)}s`
        : `line${i + 1}`;
    return `[${t}] ${s.text}`;
  });
  const user = `maxSec: ${Math.floor(options.maxSec)}\n\nTranscript:\n${lines.join('\n')}`;
  const res = await options.client.chat.completions.create({
    model: options.model,
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: user },
    ],
  });
  const raw = res.choices[0]?.message?.content?.trim();
  if (!raw) throw new Error('suggestMilestones: empty completion');
  const obj = extractJsonObject(raw);
  const arr = obj.milestones;
  if (!Array.isArray(arr)) throw new Error('suggestMilestones: missing milestones array');
  const out: YoutubeMilestone[] = [];
  for (const row of arr) {
    if (!row || typeof row !== 'object') continue;
    const o = row as Record<string, unknown>;
    const t = typeof o.t === 'number' ? o.t : parseFloat(String(o.t));
    const label = typeof o.label === 'string' ? o.label.trim() : '';
    const kind = o.kind === 'highlight' || o.kind === 'chapter' ? o.kind : undefined;
    if (!Number.isFinite(t) || !label) continue;
    if (t < 0 || t > options.maxSec) continue;
    out.push({ t, label, kind });
  }
  return out.sort((a, b) => a.t - b.t);
}

/** Read capture `source.md`, optional existing `milestones.yaml`, write merged YAML. */
export async function writeSuggestedMilestonesForCapture(options: {
  captureDir: string;
  maxSec: number;
  client: OpenAIClientLike;
  model: string;
}): Promise<string> {
  const sourcePath = path.join(options.captureDir, 'source.md');
  const raw = await fs.readFile(sourcePath, 'utf8');
  const segs = parseEnTranscriptFromSourceMarkdown(raw);
  if (segs.length === 0) {
    throw new Error('suggest-milestones: no ## Transcript (en) segments in source.md');
  }
  const suggested = await suggestMilestonesFromTranscript({
    segments: segs,
    maxSec: options.maxSec,
    client: options.client,
    model: options.model,
  });
  const yamlPath = path.join(options.captureDir, 'milestones.yaml');
  let existing: YoutubeMilestone[] = [];
  try {
    existing = parseMilestonesYaml(await fs.readFile(yamlPath, 'utf8'));
  } catch {
    /* no file */
  }
  const merged = mergeMilestones(existing, suggested);
  const text = milestonesToYaml(merged);
  await fs.writeFile(yamlPath, text, 'utf8');
  return yamlPath;
}
