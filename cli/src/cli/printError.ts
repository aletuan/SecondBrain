/** Lines suitable for `console.error` (primary message + optional cause chain). */
export function describeErrorChain(e: unknown, maxDepth = 6): string[] | null {
  if (!(e instanceof Error)) return null;
  const lines = [e.message];
  let c: unknown = e.cause;
  let depth = 0;
  while (c instanceof Error && depth < maxDepth) {
    lines.push(`  Caused by: ${c.message}`);
    c = c.cause;
    depth += 1;
  }
  return lines;
}

export function printError(e: unknown): void {
  const lines = describeErrorChain(e);
  if (lines) {
    for (const line of lines) console.error(line);
    return;
  }
  console.error(e);
}
