/**
 * Parses v1 NDJSON progress lines from `POST /v1/ingest` (Python API). Keep in sync with `brain_api.progress`.
 */
export type IngestProgressPhase = 'fetch' | 'translate' | 'vault' | 'llm';

export type IngestProgressEvent =
  | { v: 1; kind: 'phase'; phase: IngestProgressPhase; state: 'active' | 'done' }
  | { v: 1; kind: 'done'; captureDir: string; captureId: string }
  | { v: 1; kind: 'error'; message: string; phase?: IngestProgressPhase };

export function tryParseIngestProgressLine(line: string): IngestProgressEvent | null {
  const t = line.trim();
  if (!t.startsWith('{')) return null;
  let o: unknown;
  try {
    o = JSON.parse(t);
  } catch {
    return null;
  }
  if (!o || typeof o !== 'object') return null;
  const r = o as Record<string, unknown>;
  if (r.v !== 1) return null;
  if (r.kind === 'phase') {
    if (r.state !== 'active' && r.state !== 'done') return null;
    const ph = r.phase;
    if (ph !== 'fetch' && ph !== 'translate' && ph !== 'vault' && ph !== 'llm') return null;
    return { v: 1, kind: 'phase', phase: ph, state: r.state };
  }
  if (r.kind === 'done') {
    if (typeof r.captureDir !== 'string' || typeof r.captureId !== 'string') return null;
    return { v: 1, kind: 'done', captureDir: r.captureDir, captureId: r.captureId };
  }
  if (r.kind === 'error') {
    if (typeof r.message !== 'string') return null;
    const phase = r.phase;
    if (
      phase !== undefined &&
      phase !== 'fetch' &&
      phase !== 'translate' &&
      phase !== 'vault' &&
      phase !== 'llm'
    ) {
      return null;
    }
    return { v: 1, kind: 'error', message: r.message, phase };
  }
  return null;
}
