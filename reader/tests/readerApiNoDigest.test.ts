import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { vaultApiMiddleware } from '../vault/apiMiddleware.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

describe('reader API without digest/challenge', () => {
  let server: ReturnType<typeof createServer>;
  let baseUrl: string;

  beforeAll(async () => {
    process.env.READER_BRAIN_ROOT = repoRoot;
    process.env.READER_VAULT_ROOT = path.join(repoRoot, 'vault');

    const mw = vaultApiMiddleware();
    server = createServer((req, res) => {
      void mw(req, res, () => {
        res.statusCode = 404;
        res.end('not found');
      });
    });
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = server.address();
    if (!addr || typeof addr === 'string') throw new Error('no port');
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    server.closeAllConnections?.();
    await new Promise<void>((resolve, reject) => {
      server.close((e) => (e ? reject(e) : resolve()));
    });
  });

  it('GET /api/health JSON has no digestAvailable', async () => {
    const r = await fetch(`${baseUrl}/api/health`);
    expect(r.status).toBe(200);
    const j = (await r.json()) as Record<string, unknown>;
    expect(j).toHaveProperty('ingestAvailable');
    expect(j).toHaveProperty('ingestBackend');
    expect(['python', null]).toContain(j.ingestBackend);
    expect(j).not.toHaveProperty('digestAvailable');
  });

  it('GET /api/digests returns 404 unknown route', async () => {
    const r = await fetch(`${baseUrl}/api/digests`);
    expect(r.status).toBe(404);
    const j = (await r.json()) as { error?: string };
    expect(j.error).toBe('unknown route');
  });

  it('GET /api/digests/2026-W12 returns 404 unknown route', async () => {
    const r = await fetch(`${baseUrl}/api/digests/2026-W12`);
    expect(r.status).toBe(404);
  });

  it('POST /api/digest returns 404 unknown route', async () => {
    const r = await fetch(`${baseUrl}/api/digest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(r.status).toBe(404);
  });

  it('GET /api/challenges/2026-W12 returns 404 unknown route', async () => {
    const r = await fetch(`${baseUrl}/api/challenges/2026-W12`);
    expect(r.status).toBe(404);
  });
});
