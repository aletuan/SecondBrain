import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  allowedCategoryIdsSorted,
  loadCategoryTaxonomy,
  setCategoriesInNoteFrontmatter,
} from './categoriesIO.js';
import { getCapture, getCaptureNotePath, getCommentPath, listCaptures } from './service.js';
import {
  MAX_COMMENT_CHARS,
  appendToReactionsFile,
  parseReactionsMarkdown,
} from './reactionsMarkdown.js';
import { resolveBrainRepoRoot, resolveVaultRoot } from './paths.js';
import type { IngestProgressEvent } from './ingestProgressParse.js';
import {
  assertIngestBackendReady,
  pythonIngestBaseUrl,
  runPythonIngestStream,
} from './pythonIngest.js';

function resolvedIngestBackend(): 'python' | null {
  return pythonIngestBaseUrl() ? 'python' : null;
}

function ingestBackendConfigured(): boolean {
  return resolvedIngestBackend() !== null;
}

type NextFn = (err?: unknown) => void;

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function sendText(res: ServerResponse, status: number, text: string, ct = 'text/plain') {
  res.statusCode = status;
  res.setHeader('Content-Type', `${ct}; charset=utf-8`);
  res.end(text);
}

const ASSET_RE = /^\/api\/captures\/([^/]+)\/assets\/(.+)$/;

const MAX_JSON_BODY = 32_768;
const MAX_PENDING_INGEST_JOBS = 16;

type IngestJobPayload =
  | { kind: 'url'; url: string }
  | { kind: 'reingest'; captureId: string };

const pendingIngestJobs = new Map<string, IngestJobPayload>();

function getQueryParam(req: IncomingMessage, key: string): string | null {
  const raw = req.url ?? '';
  const q = raw.includes('?') ? raw.slice(raw.indexOf('?') + 1) : '';
  const params = new URLSearchParams(q);
  const v = params.get(key);
  return v?.trim() ? v.trim() : null;
}

function sendSse(res: ServerResponse, payload: unknown) {
  try {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  } catch {
    /* client disconnected */
  }
}

function beginSse(res: ServerResponse) {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof (res as ServerResponse & { flushHeaders?: () => void }).flushHeaders === 'function') {
    (res as ServerResponse & { flushHeaders: () => void }).flushHeaders();
  }
}

type ParsedIngestBody = { ok: true; url: string } | { ok: false; status: number; error: string };

function parseCategoriesPatchBody(
  body: unknown,
):
  | { ok: true; categories: string[] }
  | { ok: false; status: number; error: string } {
  if (body == null || typeof body !== 'object') {
    return { ok: false, status: 400, error: 'expected JSON object' };
  }
  const c = (body as { categories?: unknown }).categories;
  if (!Array.isArray(c) || !c.every(x => typeof x === 'string')) {
    return { ok: false, status: 400, error: 'categories must be string array' };
  }
  return { ok: true, categories: c.map(x => x.trim()).filter(Boolean) };
}

function parseIngestJsonBody(body: unknown): ParsedIngestBody {
  if (!body || typeof body !== 'object') {
    return { ok: false, status: 400, error: 'expected JSON object' };
  }
  const url = (body as { url?: unknown }).url;
  if (typeof url !== 'string' || !url.trim()) {
    return { ok: false, status: 400, error: 'url required' };
  }
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return { ok: false, status: 400, error: 'invalid url' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, status: 400, error: 'only http(s) urls' };
  }
  return { ok: true, url: url.trim() };
}

function ingestAllowed(): boolean {
  const v = process.env.READER_ALLOW_INGEST?.trim().toLowerCase();
  if (v === '0' || v === 'false' || v === 'no') return false;
  return true;
}

type ParsedReactionPost =
  | { ok: true; rating: number; comment?: string }
  | { ok: false; status: number; error: string };

function parseReactionPost(body: unknown): ParsedReactionPost {
  if (!body || typeof body !== 'object') {
    return { ok: false, status: 400, error: 'expected JSON object' };
  }
  const o = body as { rating?: unknown; comment?: unknown };
  const r = o.rating;
  if (typeof r !== 'number' || !Number.isInteger(r) || r < 1 || r > 5) {
    return { ok: false, status: 400, error: 'rating must be integer 1-5' };
  }
  if (o.comment === undefined || o.comment === null) {
    return { ok: true, rating: r };
  }
  if (typeof o.comment !== 'string') {
    return { ok: false, status: 400, error: 'comment must be string' };
  }
  const c = o.comment.trim();
  if (c.length > MAX_COMMENT_CHARS) {
    return { ok: false, status: 400, error: `comment exceeds ${MAX_COMMENT_CHARS} chars` };
  }
  return { ok: true, rating: r, ...(c ? { comment: c } : {}) };
}

function readJsonBody(req: IncomingMessage, maxBytes = MAX_JSON_BODY): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new Error('request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8').trim();
        if (!raw) resolve(null);
        else resolve(JSON.parse(raw));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

/** Shared Connect-style middleware for Vite dev and Express. */
export function vaultApiMiddleware() {
  return async (req: IncomingMessage, res: ServerResponse, next: NextFn) => {
    const urlRaw = req.url?.split('?')[0] ?? '';
    if (!urlRaw.startsWith('/api')) {
      next();
      return;
    }

    try {
      if (req.method === 'GET' && urlRaw === '/api/health') {
        const vaultRoot = resolveVaultRoot();
        const brainRoot = resolveBrainRepoRoot();
        const ingestBackend = resolvedIngestBackend();
        const ingestAvailable = ingestAllowed() && ingestBackend !== null;
        sendJson(res, 200, {
          ok: true,
          vaultRoot,
          brainRoot,
          ingestAvailable,
          ingestSse: ingestAvailable,
          ingestBackend,
        });
        return;
      }

      if (req.method === 'POST' && urlRaw === '/api/ingest/start') {
        if (!ingestAllowed()) {
          sendJson(res, 403, { error: 'ingest disabled (READER_ALLOW_INGEST)' });
          return;
        }
        let body: unknown;
        try {
          body = await readJsonBody(req);
        } catch (e) {
          sendJson(res, 400, { error: e instanceof Error ? e.message : 'bad json' });
          return;
        }
        const parsedBody = parseIngestJsonBody(body);
        if (!parsedBody.ok) {
          sendJson(res, parsedBody.status, { error: parsedBody.error });
          return;
        }
        if (pendingIngestJobs.size >= MAX_PENDING_INGEST_JOBS) {
          sendJson(res, 503, { error: 'too many pending ingest jobs; try again later' });
          return;
        }
        const jobId = randomUUID();
        pendingIngestJobs.set(jobId, { kind: 'url', url: parsedBody.url });
        sendJson(res, 200, { ok: true, jobId });
        return;
      }

      if (req.method === 'POST') {
        const reingestM = /^\/api\/captures\/([^/]+)\/reingest\/start$/.exec(urlRaw);
        if (reingestM) {
          if (!ingestAllowed()) {
            sendJson(res, 403, { error: 'ingest disabled (READER_ALLOW_INGEST)' });
            return;
          }
          const captureId = decodeURIComponent(reingestM[1]!);
          if (!(await getCapture(captureId))) {
            sendJson(res, 404, { error: 'capture not found' });
            return;
          }
          if (pendingIngestJobs.size >= MAX_PENDING_INGEST_JOBS) {
            sendJson(res, 503, { error: 'too many pending ingest jobs; try again later' });
            return;
          }
          const jobId = randomUUID();
          pendingIngestJobs.set(jobId, { kind: 'reingest', captureId });
          sendJson(res, 200, { ok: true, jobId });
          return;
        }
      }

      if (req.method === 'GET' && urlRaw === '/api/ingest/stream') {
        if (!ingestAllowed()) {
          sendJson(res, 403, { error: 'ingest disabled (READER_ALLOW_INGEST)' });
          return;
        }
        const jobId = getQueryParam(req, 'jobId');
        if (!jobId) {
          sendJson(res, 400, { error: 'jobId query required' });
          return;
        }
        const payload = pendingIngestJobs.get(jobId);
        if (!payload) {
          sendJson(res, 404, { error: 'unknown or expired jobId' });
          return;
        }
        pendingIngestJobs.delete(jobId);

        beginSse(res);
        const ac = new AbortController();
        const onReqClose = () => {
          try {
            ac.abort();
          } catch {
            /* ignore */
          }
        };
        req.on('close', onReqClose);

        const forward = (ev: IngestProgressEvent) => {
          try {
            sendSse(res, ev);
          } catch {
            /* client gone */
          }
        };

        try {
          await assertIngestBackendReady();
          const vaultRoot = resolveVaultRoot();
          const { code, stderr, captureDir } = await runPythonIngestStream({
            url: payload.kind === 'url' ? payload.url : undefined,
            reingestCaptureDir:
              payload.kind === 'reingest'
                ? path.join(vaultRoot, 'Captures', payload.captureId)
                : undefined,
            onProgress: forward,
            signal: ac.signal,
          });
          if (code !== 0) {
            sendSse(res, {
              v: 1,
              kind: 'error',
              message: stderr.trim() ? stderr.slice(-8000) : `ingest exited with code ${code}`,
            });
          } else if (!captureDir) {
            sendSse(res, {
              v: 1,
              kind: 'error',
              message: 'capture path missing in ingest stream',
            });
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          sendSse(res, { v: 1, kind: 'error', message: msg });
        } finally {
          req.off('close', onReqClose);
          try {
            res.end();
          } catch {
            /* ignore */
          }
        }
        return;
      }

      if (req.method === 'POST' && urlRaw === '/api/ingest') {
        if (!ingestAllowed()) {
          sendJson(res, 403, { error: 'ingest disabled (READER_ALLOW_INGEST)' });
          return;
        }
        let body: unknown;
        try {
          body = await readJsonBody(req);
        } catch (e) {
          sendJson(res, 400, { error: e instanceof Error ? e.message : 'bad json' });
          return;
        }
        const parsedBody = parseIngestJsonBody(body);
        if (!parsedBody.ok) {
          sendJson(res, parsedBody.status, { error: parsedBody.error });
          return;
        }
        try {
          await assertIngestBackendReady();
          const { code, stdout, stderr, captureDir } = await runPythonIngestStream({
            url: parsedBody.url,
            onProgress: () => {},
          });
          if (code !== 0) {
            sendJson(res, 502, {
              error: 'ingest failed',
              stderr: stderr.slice(-8000),
              stdout: stdout.slice(-2000),
            });
            return;
          }
          if (!captureDir) {
            sendJson(res, 502, {
              error: 'ingest finished but capture path not detected in stdout',
              stderr: stderr.slice(-8000),
              stdout: stdout.slice(-4000),
            });
            return;
          }
          const captureId = path.basename(captureDir);
          sendJson(res, 200, { ok: true, captureDir, captureId });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          sendJson(res, 500, { error: msg });
        }
        return;
      }

      if (req.method === 'GET' && urlRaw === '/api/captures') {
        const data = await listCaptures();
        sendJson(res, 200, data);
        return;
      }

      if (req.method === 'GET' && urlRaw === '/api/taxonomy/categories') {
        try {
          const items = await loadCategoryTaxonomy();
          sendJson(res, 200, { items });
        } catch (e) {
          sendJson(res, 500, { error: e instanceof Error ? e.message : String(e) });
        }
        return;
      }

      const assetM = ASSET_RE.exec(urlRaw);
      if (req.method === 'GET' && assetM) {
        const id = decodeURIComponent(assetM[1]!);
        let rel = assetM[2]!;
        if (rel.includes('..') || path.isAbsolute(rel)) {
          sendJson(res, 400, { error: 'bad path' });
          return;
        }
        rel = decodeURIComponent(rel);
        const vaultRoot = resolveVaultRoot();
        const file = path.join(vaultRoot, 'Captures', id, 'assets', rel);
        if (!file.startsWith(path.join(vaultRoot, 'Captures', id, 'assets'))) {
          sendJson(res, 400, { error: 'bad path' });
          return;
        }
        try {
          const buf = await fs.readFile(file);
          const ext = path.extname(rel).toLowerCase();
          const ct =
            ext === '.png'
              ? 'image/png'
              : ext === '.jpg' || ext === '.jpeg'
                ? 'image/jpeg'
                : ext === '.webp'
                  ? 'image/webp'
                  : ext === '.gif'
                    ? 'image/gif'
                    : 'application/octet-stream';
          res.statusCode = 200;
          res.setHeader('Content-Type', ct);
          res.end(buf);
        } catch {
          sendJson(res, 404, { error: 'not found' });
        }
        return;
      }

      const reactionsM = /^\/api\/captures\/([^/]+)\/reactions$/.exec(urlRaw);
      if (reactionsM && (req.method === 'GET' || req.method === 'POST')) {
        const id = decodeURIComponent(reactionsM[1]!);
        if (!(await getCapture(id))) {
          sendJson(res, 404, { error: 'not found' });
          return;
        }
        const vaultRoot = resolveVaultRoot();
        const captureDir = path.join(vaultRoot, 'Captures', id);
        const commentPath = await getCommentPath(captureDir);

        if (req.method === 'GET') {
          let raw = '';
          try {
            raw = await fs.readFile(commentPath, 'utf8');
          } catch (e: unknown) {
            const err = e as NodeJS.ErrnoException;
            if (err.code === 'ENOENT') {
              sendJson(res, 200, { entries: [] });
              return;
            }
            sendJson(res, 500, { error: err.message ?? 'read failed' });
            return;
          }
          const { entries } = parseReactionsMarkdown(raw);
          sendJson(res, 200, { entries });
          return;
        }

        let body: unknown;
        try {
          body = await readJsonBody(req);
        } catch (e) {
          sendJson(res, 400, { error: e instanceof Error ? e.message : 'bad json' });
          return;
        }
        const parsed = parseReactionPost(body);
        if (!parsed.ok) {
          sendJson(res, parsed.status, { error: parsed.error });
          return;
        }
        let existing: string | null = null;
        try {
          existing = await fs.readFile(commentPath, 'utf8');
        } catch (e: unknown) {
          const err = e as NodeJS.ErrnoException;
          if (err.code !== 'ENOENT') {
            sendJson(res, 500, { error: err.message ?? 'read failed' });
            return;
          }
        }
        const next = appendToReactionsFile(existing, parsed.rating, parsed.comment);
        try {
          await fs.writeFile(commentPath, next, 'utf8');
        } catch (e) {
          sendJson(res, 500, { error: e instanceof Error ? e.message : 'write failed' });
          return;
        }
        sendJson(res, 200, { ok: true });
        return;
      }

      const capCatM = /^\/api\/captures\/([^/]+)\/categories$/.exec(urlRaw);
      if (req.method === 'PATCH' && capCatM) {
        const id = decodeURIComponent(capCatM[1]!);
        if (!(await getCapture(id))) {
          sendJson(res, 404, { error: 'not found' });
          return;
        }
        let body: unknown;
        try {
          body = await readJsonBody(req);
        } catch (e) {
          sendJson(res, 400, { error: e instanceof Error ? e.message : 'bad json' });
          return;
        }
        const parsed = parseCategoriesPatchBody(body);
        if (!parsed.ok) {
          sendJson(res, parsed.status, { error: parsed.error });
          return;
        }
        let entries: Awaited<ReturnType<typeof loadCategoryTaxonomy>>;
        try {
          entries = await loadCategoryTaxonomy();
        } catch (e) {
          sendJson(res, 500, { error: e instanceof Error ? e.message : String(e) });
          return;
        }
        const allowed = new Set(allowedCategoryIdsSorted(entries));
        const filtered = [...new Set(parsed.categories.filter(cid => allowed.has(cid)))].sort(
          (a, b) => a.localeCompare(b),
        );
        const notePath = await getCaptureNotePath(id);
        if (!notePath) {
          sendJson(res, 404, { error: 'note not found' });
          return;
        }
        try {
          await setCategoriesInNoteFrontmatter(notePath, filtered);
        } catch (e) {
          sendJson(res, 500, { error: e instanceof Error ? e.message : String(e) });
          return;
        }
        sendJson(res, 200, { ok: true, categories: filtered });
        return;
      }

      const capM = /^\/api\/captures\/([^/]+)$/.exec(urlRaw);
      if (req.method === 'GET' && capM) {
        const id = decodeURIComponent(capM[1]!);
        const detail = await getCapture(id);
        if (!detail) {
          sendJson(res, 404, { error: 'not found' });
          return;
        }
        sendJson(res, 200, detail);
        return;
      }

      sendJson(res, 404, { error: 'unknown route' });
    } catch (e) {
      sendText(res, 500, e instanceof Error ? e.message : String(e));
    }
  };
}
