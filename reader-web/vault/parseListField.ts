/**
 * Parse list-like note frontmatter fields (`tags`, `categories`).
 * Mirrors `parseTagList` in `reader-web/src/main.ts` so list API and UI stay aligned.
 */
export function parseListField(raw: string | boolean | undefined): string[] {
  if (raw === undefined || typeof raw === 'boolean') return [];
  const s = String(raw).trim();
  if (!s) return [];

  if (s.startsWith('[') && s.endsWith(']')) {
    try {
      const j = JSON.parse(s) as unknown;
      if (Array.isArray(j) && j.every((x) => typeof x === 'string')) {
        return j.map((t) => t.trim()).filter(Boolean);
      }
    } catch {
      /* bracket list without valid JSON */
    }
    const inner = s.slice(1, -1).trim();
    if (!inner) return [];
    return inner
      .split(',')
      .map((t) => t.trim().replace(/^["']|["']$/g, ''))
      .filter(Boolean);
  }

  return s
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}
