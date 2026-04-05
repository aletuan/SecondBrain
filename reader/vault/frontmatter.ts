export function stripFrontmatter(raw: string): { fm: Record<string, string | boolean>; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\s*/.exec(raw);
  if (!m) return { fm: {}, body: raw };
  const fm: Record<string, string | boolean> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^(\w+):\s*(.+)$/.exec(line.trim());
    if (!kv) continue;
    const k = kv[1]!;
    let v = kv[2]!.trim();
    if (v === 'true') {
      fm[k] = true;
      continue;
    }
    if (v === 'false') {
      fm[k] = false;
      continue;
    }
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    fm[k] = v;
  }
  return { fm, body: raw.slice(m[0].length) };
}

export function firstHeading(body: string): string {
  const line = body.match(/^#\s+(.+)$/m);
  return line?.[1]?.trim() ?? '';
}
