import { parse as parseYaml } from 'yaml';

export type MilestoneKind = 'chapter' | 'highlight';

/** One seek point on the YouTube timeline (seconds + label). */
export type YoutubeMilestone = {
  t: number;
  label: string;
  kind?: MilestoneKind;
};

function isRecord(x: unknown): x is Record<string, unknown> {
  return x !== null && typeof x === 'object' && !Array.isArray(x);
}

function coerceMilestone(row: unknown): YoutubeMilestone | null {
  if (!isRecord(row)) return null;
  const tRaw = row.t ?? row.time ?? row.sec;
  const t =
    typeof tRaw === 'number'
      ? tRaw
      : typeof tRaw === 'string'
        ? parseFloat(tRaw)
        : NaN;
  if (!Number.isFinite(t) || t < 0) return null;
  const label =
    typeof row.label === 'string'
      ? row.label.trim()
      : typeof row.title === 'string'
        ? row.title.trim()
        : '';
  if (!label) return null;
  const kind = row.kind;
  const k: MilestoneKind | undefined =
    kind === 'chapter' || kind === 'highlight' ? kind : undefined;
  return { t, label, kind: k };
}

/**
 * Parse `milestones.yaml` in a capture folder.
 * Accepted shapes: `{ milestones: [...] }` or a bare array.
 */
export function parseMilestonesYaml(text: string): YoutubeMilestone[] {
  const raw = parseYaml(text) as unknown;
  const list: unknown[] = Array.isArray(raw)
    ? raw
    : isRecord(raw) && Array.isArray(raw.milestones)
      ? raw.milestones
      : [];
  const out: YoutubeMilestone[] = [];
  for (const row of list) {
    const m = coerceMilestone(row);
    if (m) out.push(m);
  }
  return out.sort((a, b) => a.t - b.t);
}

/** Merge two lists by `t` (same second: later list wins on label/kind). */
export function mergeMilestones(
  base: YoutubeMilestone[],
  extra: YoutubeMilestone[],
): YoutubeMilestone[] {
  const map = new Map<number, YoutubeMilestone>();
  for (const m of base) map.set(m.t, m);
  for (const m of extra) map.set(m.t, m);
  return [...map.values()].sort((a, b) => a.t - b.t);
}

/** Drop / clamp milestones to `[0, maxSec]` when `maxSec` is finite. */
export function validateMilestones(
  milestones: YoutubeMilestone[],
  maxSec: number,
): YoutubeMilestone[] {
  if (!Number.isFinite(maxSec) || maxSec <= 0) return milestones;
  return milestones
    .filter((m) => m.t >= 0 && m.t <= maxSec)
    .sort((a, b) => a.t - b.t);
}

export function milestonesToYaml(milestones: YoutubeMilestone[]): string {
  const parts = ['milestones:'];
  for (const m of milestones) {
    let block = `  - t: ${m.t}\n    label: ${JSON.stringify(m.label)}`;
    if (m.kind === 'chapter' || m.kind === 'highlight') {
      block += `\n    kind: ${m.kind}`;
    }
    parts.push(block);
  }
  return `${parts.join('\n')}\n`;
}
