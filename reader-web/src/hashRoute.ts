/**
 * Maps removed reader hash routes to the captures library (bookmark compatibility).
 * `location.hash` includes the leading `#`.
 */
export function normalizeLegacyReaderHash(hash: string): string | null {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  const trimmed = raw.replace(/^\/+/, '');
  const parts = trimmed.split('/').filter(Boolean);
  if (parts[0] === 'digests') return '#/captures';
  if (parts[0] === 'digest' && parts[1]) return '#/captures';
  return null;
}
