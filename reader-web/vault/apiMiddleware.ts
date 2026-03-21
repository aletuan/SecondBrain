import type { IncomingMessage, ServerResponse } from 'node:http';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  getCapture,
  getChallenge,
  getDigest,
  listCaptures,
  listDigests,
} from './service.js';
import { resolveBrainRepoRoot, resolveVaultRoot } from './paths.js';
import { runIngestCli } from './runIngestCli.js';

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

function ingestAllowed(): boolean {
  const v = process.env.READER_ALLOW_INGEST?.trim().toLowerCase();
  if (v === '0' || v === 'false' || v === 'no') return false;
  return true;
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
        const cliPath = path.join(brainRoot, 'src', 'cli.ts');
        const ingestAvailable =
          ingestAllowed() &&
          fsSync.existsSync(cliPath) &&
          fsSync.existsSync(path.join(brainRoot, 'package.json'));
        sendJson(res, 200, {
          ok: true,
          vaultRoot,
          brainRoot,
          ingestAvailable,
        });
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
        if (!body || typeof body !== 'object') {
          sendJson(res, 400, { error: 'expected JSON object' });
          return;
        }
        const url = (body as { url?: unknown }).url;
        if (typeof url !== 'string' || !url.trim()) {
          sendJson(res, 400, { error: 'url required' });
          return;
        }
        let parsed: URL;
        try {
          parsed = new URL(url.trim());
        } catch {
          sendJson(res, 400, { error: 'invalid url' });
          return;
        }
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          sendJson(res, 400, { error: 'only http(s) urls' });
          return;
        }
        const noLlm = Boolean((body as { noLlm?: unknown }).noLlm);
        const rawTr = (body as { translateTranscript?: unknown }).translateTranscript;
        const translateTranscript =
          rawTr === false ? false : rawTr === true ? true : undefined;
        try {
          const { code, stdout, stderr, captureDir } = await runIngestCli({
            url: url.trim(),
            noLlm,
            translateTranscript,
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

      if (req.method === 'GET' && urlRaw === '/api/digests') {
        const digests = await listDigests();
        sendJson(res, 200, { digests });
        return;
      }

      const digestM = /^\/api\/digests\/([^/]+)$/.exec(urlRaw);
      if (req.method === 'GET' && digestM) {
        const slug = decodeURIComponent(digestM[1]!);
        const raw = await getDigest(slug);
        if (raw === null) {
          sendJson(res, 404, { error: 'not found' });
          return;
        }
        sendJson(res, 200, { week: slug, markdown: raw });
        return;
      }

      const challengeM = /^\/api\/challenges\/([^/]+)$/.exec(urlRaw);
      if (req.method === 'GET' && challengeM) {
        const slug = decodeURIComponent(challengeM[1]!);
        const raw = await getChallenge(slug);
        if (raw === null) {
          sendJson(res, 404, { error: 'not found' });
          return;
        }
        sendJson(res, 200, { week: slug, markdown: raw });
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
