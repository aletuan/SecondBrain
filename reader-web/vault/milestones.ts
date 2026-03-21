import fs from 'node:fs/promises';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';

export type Milestone = { t: number; label: string; kind?: string };

export async function loadMilestones(captureDir: string): Promise<Milestone[] | null> {
  const p = path.join(captureDir, 'milestones.yaml');
  try {
    const text = await fs.readFile(p, 'utf8');
    const raw = parseYaml(text) as unknown;
    const list: unknown[] = Array.isArray(raw)
      ? raw
      : raw && typeof raw === 'object' && raw !== null && Array.isArray((raw as { milestones?: unknown[] }).milestones)
        ? (raw as { milestones: unknown[] }).milestones
        : [];
    const out: Milestone[] = [];
    for (const row of list) {
      if (!row || typeof row !== 'object') continue;
      const o = row as Record<string, unknown>;
      const t = typeof o.t === 'number' ? o.t : parseFloat(String(o.t));
      const label = typeof o.label === 'string' ? o.label : '';
      if (!Number.isFinite(t) || !label) continue;
      const kind = typeof o.kind === 'string' ? o.kind : undefined;
      out.push({ t, label, kind });
    }
    return out.sort((a, b) => a.t - b.t);
  } catch {
    return null;
  }
}
