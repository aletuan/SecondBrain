/**
 * Removes the "## Câu hỏi mở" / "### Câu hỏi mở" block from capture note markdown (ingest enrich legacy).
 * Stops at the next line that starts with "## " (another H2). Optional "---" + blanks immediately before the heading are removed with the block.
 */
export function stripCauHoiMoSection(md: string): { text: string; changed: boolean } {
  const lines = md.split(/\r?\n/);
  const idx = lines.findIndex((line) => {
    const t = line.trimStart();
    return t.startsWith('## Câu hỏi mở') || t.startsWith('### Câu hỏi mở');
  });
  if (idx === -1) return { text: md, changed: false };

  let start = idx;
  if (start > 0 && lines[start - 1] === '') start -= 1;
  if (start > 0 && lines[start - 1] === '---') {
    start -= 1;
    while (start > 0 && lines[start - 1] === '') start -= 1;
  }

  let end = idx + 1;
  while (end < lines.length) {
    const L = lines[end];
    const t = L?.trimStart() ?? '';
    if (/^## [^#]/.test(t) && !t.startsWith('## Câu hỏi mở')) break;
    end += 1;
  }

  const out = [...lines.slice(0, start), ...lines.slice(end)];
  let text = out.join('\n');
  text = text.replace(/\n{3,}/g, '\n\n');
  if (!text.endsWith('\n')) text += '\n';
  return { text, changed: text !== md };
}
