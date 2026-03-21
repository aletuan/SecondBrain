/**
 * Parse vault transcript blocks: lines like `**m:ss** text` (see src/vault/writer.ts).
 */

export type ParsedTranscriptLine = {
  startSec: number;
  stamp: string;
  text: string;
};

export type MergedTranscriptLine = {
  startSec: number;
  stamp: string;
  en: string;
  vi: string;
};

function parseTimestampLine(line: string): ParsedTranscriptLine | null {
  const m = /^\s*\*\*(\d+):(\d{2})\*\*\s*(.*)$/.exec(line);
  if (!m) return null;
  const mm = parseInt(m[1]!, 10);
  const ss = parseInt(m[2]!, 10);
  if (Number.isNaN(mm) || Number.isNaN(ss) || ss > 59) return null;
  const startSec = mm * 60 + ss;
  const stamp = `${mm}:${String(ss).padStart(2, '0')}`;
  return { startSec, stamp, text: m[3]!.trim() };
}

export function parseTimestampedTranscript(block: string): ParsedTranscriptLine[] {
  const out: ParsedTranscriptLine[] = [];
  for (const line of block.split(/\r?\n/)) {
    const p = parseTimestampLine(line);
    if (p) out.push(p);
  }
  return out;
}

/** Align EN/VI by `startSec`; EN order wins when both exist. */
export function mergeTranscriptsForUi(enBlock: string, viBlock: string): MergedTranscriptLine[] {
  const en = parseTimestampedTranscript(enBlock);
  const vi = parseTimestampedTranscript(viBlock);
  const viByStart = new Map<number, string>();
  for (const v of vi) {
    viByStart.set(v.startSec, v.text);
  }
  if (en.length > 0) {
    return en.map((e) => ({
      startSec: e.startSec,
      stamp: e.stamp,
      en: e.text,
      vi: viByStart.get(e.startSec) ?? '',
    }));
  }
  if (vi.length > 0) {
    return vi.map((v) => ({
      startSec: v.startSec,
      stamp: v.stamp,
      en: '',
      vi: v.text,
    }));
  }
  return [];
}

export function findActiveSegmentIndex(lines: MergedTranscriptLine[], timeSec: number): number {
  const t = timeSec + 0.25;
  if (lines.length === 0) return -1;
  for (let i = 0; i < lines.length; i += 1) {
    const cur = lines[i]!.startSec;
    const next = lines[i + 1]?.startSec ?? Infinity;
    if (t >= cur && t < next) return i;
  }
  return lines.length - 1;
}
