/** Extract text between ## Transcript (en|vi) and next ## heading. */
export function extractTranscriptSection(md: string, locale: 'en' | 'vi'): string {
  const label = locale === 'en' ? '## Transcript (en)' : '## Transcript (vi)';
  const idx = md.indexOf(label);
  if (idx === -1) return '';
  const after = md.slice(idx + label.length);
  const next = after.search(/\n## [^#]/);
  const block = (next === -1 ? after : after.slice(0, next)).trim();
  return block;
}
