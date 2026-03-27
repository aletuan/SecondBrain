/** Reader reactions file `{slug}.comment` — Markdown timeline per spec (2026-03-27). */

export const REACTIONS_FILE_HEADER = '# Reader reactions\n\n';

/** Max length for optional comment text (POST validation). */
export const MAX_COMMENT_CHARS = 8000;

export type ParsedReactionEntry = {
  at: string;
  rating: number;
  text?: string;
};

export function ratingToStarLine(rating: number): string {
  if (rating < 1 || rating > 5 || !Number.isInteger(rating)) {
    throw new Error('rating must be integer 1–5');
  }
  return `${'★'.repeat(rating)}${'☆'.repeat(5 - rating)} (${rating}/5)`;
}

/** ISO-8601 with local timezone offset, e.g. `2026-03-27T14:32:01+07:00`. */
export function formatLocalIso8601(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const y = d.getFullYear();
  const mo = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const h = pad(d.getHours());
  const mi = pad(d.getMinutes());
  const s = pad(d.getSeconds());
  const offMin = -d.getTimezoneOffset();
  const sign = offMin >= 0 ? '+' : '-';
  const abs = Math.abs(offMin);
  const oh = pad(Math.floor(abs / 60));
  const om = pad(abs % 60);
  return `${y}-${mo}-${day}T${h}:${mi}:${s}${sign}${oh}:${om}`;
}

/**
 * One reaction block (no leading `---`; caller adds delimiter when appending).
 */
export function formatReactionEntry(
  rating: number,
  comment: string | undefined,
  at: Date = new Date(),
): string {
  const iso = formatLocalIso8601(at);
  const stars = ratingToStarLine(rating);
  const c = comment?.trim();
  let body = `### ${iso}\n\n**Đánh giá:** ${stars}\n`;
  if (c) {
    body += `\n${c}\n`;
  }
  return body;
}

function parseRatingFromRest(rest: string): number | null {
  const frac = /\((\d)\/5\)/.exec(rest);
  if (frac) {
    const n = parseInt(frac[1]!, 10);
    return n >= 1 && n <= 5 ? n : null;
  }
  const stars = (rest.match(/★/g) ?? []).length;
  return stars >= 1 && stars <= 5 ? stars : null;
}

function parseOneEntryBlock(block: string): ParsedReactionEntry | null {
  const trimmed = block.trim();
  if (!trimmed) return null;

  const lines = trimmed.split(/\r?\n/);
  let i = 0;
  const h3 = /^###\s+(.+)$/.exec(lines[i] ?? '');
  if (!h3) return null;
  const at = h3[1]!.trim();
  i += 1;

  while (i < lines.length && lines[i]!.trim() === '') i += 1;

  const rateLine = lines[i];
  if (!rateLine || !rateLine.includes('**Đánh giá:**')) return null;
  const afterLabel = rateLine.split('**Đánh giá:**')[1]?.trim() ?? '';
  const rating = parseRatingFromRest(afterLabel);
  if (rating === null) return null;
  i += 1;

  while (i < lines.length && lines[i]!.trim() === '') i += 1;

  const restLines = lines.slice(i);
  const text = restLines.join('\n').trim();
  return { at, rating, ...(text ? { text } : {}) };
}

export function parseReactionsMarkdown(raw: string): { entries: ParsedReactionEntry[] } {
  let s = raw.replace(/^\uFEFF/, '').trim();
  if (!s) return { entries: [] };

  if (s.startsWith('# Reader reactions')) {
    s = s.replace(/^# Reader reactions\s*\r?\n+/, '').trim();
  }

  const chunks = s.split(/\r?\n---\r?\n/).map((c) => c.trim()).filter(Boolean);
  const entries: ParsedReactionEntry[] = [];
  for (const chunk of chunks) {
    const e = parseOneEntryBlock(chunk);
    if (e) entries.push(e);
  }
  return { entries };
}

/**
 * Append a new entry. `existing` is full file contents or null if missing.
 */
export function appendToReactionsFile(
  existing: string | null,
  rating: number,
  comment?: string,
  at: Date = new Date(),
): string {
  const entry = formatReactionEntry(rating, comment, at);
  const prev = existing?.replace(/^\uFEFF/, '').trimEnd() ?? '';

  if (!prev) {
    return `${REACTIONS_FILE_HEADER}${entry}`;
  }

  return `${prev}\n\n---\n\n${entry}`;
}
