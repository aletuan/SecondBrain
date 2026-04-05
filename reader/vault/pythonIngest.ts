import type { IngestProgressEvent } from './ingestProgressParse.js';
import { tryParseIngestProgressLine } from './ingestProgressParse.js';

/** Base URL for Python FastAPI (e.g. `http://127.0.0.1:8765`). Required for ingest. */
export function pythonIngestBaseUrl(): string | null {
  const u = process.env.PYTHON_INGEST_URL?.trim();
  return u || null;
}

async function* ndjsonLinesFromBody(
  body: ReadableStream<Uint8Array> | null,
): AsyncGenerator<string> {
  if (!body) return;
  const reader = body.getReader();
  const dec = new TextDecoder();
  let carry = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    carry += dec.decode(value, { stream: true });
    const parts = carry.split('\n');
    carry = parts.pop() ?? '';
    for (const p of parts) {
      const t = p.trim();
      if (t) yield t;
    }
  }
  carry += dec.decode();
  const tail = carry.trim();
  if (tail) yield tail;
}

export async function fetchPythonIngestHealth(baseUrl: string): Promise<boolean> {
  const base = baseUrl.replace(/\/$/, '');
  try {
    const r = await fetch(`${base}/health`, { signal: AbortSignal.timeout(5000) });
    return r.ok;
  } catch {
    return false;
  }
}

/** Require `PYTHON_INGEST_URL` and a reachable `/health`. */
export async function assertIngestBackendReady(): Promise<void> {
  const py = pythonIngestBaseUrl();
  if (!py) {
    throw new Error(
      'PYTHON_INGEST_URL is not set. Ingest runs only via the Python API (e.g. http://127.0.0.1:8765). Add it to reader/.env or the shell environment.',
    );
  }
  const ok = await fetchPythonIngestHealth(py);
  if (!ok) {
    throw new Error(
      `Python ingest API not reachable at ${py} (check PYTHON_INGEST_URL and run pnpm api:dev).`,
    );
  }
}

export type PythonIngestStreamOptions = {
  url?: string;
  reingestCaptureDir?: string;
  onProgress: (ev: IngestProgressEvent) => void;
  signal?: AbortSignal;
};

/**
 * POST /v1/ingest (NDJSON). Outcome shape matches what reader middleware expects from the old CLI spawn.
 */
export async function runPythonIngestStream(
  opts: PythonIngestStreamOptions,
): Promise<{ code: number; stdout: string; stderr: string; captureDir: string | null }> {
  const base = pythonIngestBaseUrl();
  if (!base) {
    return { code: 1, stdout: '', stderr: 'PYTHON_INGEST_URL not set', captureDir: null };
  }
  const apiKey = process.env.INGEST_API_KEY?.trim();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) headers['X-Ingest-Key'] = apiKey;

  const body: Record<string, string> = {};
  if (opts.url) body.url = opts.url;
  if (opts.reingestCaptureDir) body.reingest_capture_dir = opts.reingestCaptureDir;

  const stdoutLines: string[] = [];
  let captureDir: string | null = null;

  const res = await fetch(`${base.replace(/\/$/, '')}/v1/ingest`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: opts.signal,
  });

  if (res.status === 401) {
    const t = await res.text();
    let msg = t;
    try {
      const j = JSON.parse(t) as { message?: string };
      if (j.message) msg = j.message;
    } catch {
      /* use raw */
    }
    return { code: 1, stdout: '', stderr: msg || '401 Unauthorized', captureDir: null };
  }

  if (!res.ok) {
    const errText = await res.text();
    return { code: 1, stdout: '', stderr: errText.slice(0, 8000), captureDir: null };
  }

  for await (const line of ndjsonLinesFromBody(res.body)) {
    const ev = tryParseIngestProgressLine(line);
    if (ev) {
      opts.onProgress(ev);
      if (ev.kind === 'done') {
        captureDir = ev.captureDir;
        stdoutLines.push(ev.captureDir);
      }
    }
  }

  return {
    code: 0,
    stdout: stdoutLines.join('\n'),
    stderr: '',
    captureDir,
  };
}
