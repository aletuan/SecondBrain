/** Human-readable detail for failed `fetch()` (Node/undici often only says "fetch failed"). */
export function formatFetchFailure(url: string, e: unknown): string {
  if (e instanceof TypeError) {
    const parts: string[] = [e.message];
    const errno = e as NodeJS.ErrnoException;
    if (errno.code) parts.push(`code=${errno.code}`);
    let c: unknown = e.cause;
    let depth = 0;
    while (c != null && depth < 5) {
      if (c instanceof Error) {
        parts.push(`cause: ${c.message}`);
        const ce = c as NodeJS.ErrnoException;
        if (ce.code) parts.push(`cause.code=${ce.code}`);
        c = c.cause;
      } else {
        parts.push(`cause: ${String(c)}`);
        break;
      }
      depth += 1;
    }
    return `${parts.join(' — ')} — ${url}`;
  }
  if (e instanceof Error) {
    return `${e.message} — ${url}`;
  }
  return `${String(e)} — ${url}`;
}
