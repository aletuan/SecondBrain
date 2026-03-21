import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bundleFromParts } from '../../src/normaliser.js';
import { downloadImagesToAssets, writeCapture } from '../../src/vault/writer.js';

let tmp: string | undefined;

afterEach(async () => {
  vi.unstubAllEnvs();
  if (tmp) await fs.rm(tmp, { recursive: true, force: true });
  tmp = undefined;
});

describe('downloadImagesToAssets', () => {
  it('writes image files and embeds relative paths in note.md', async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'vault-img-'));
    const bundle = bundleFromParts({
      canonicalUrl: 'https://example.com/p',
      fetchMethod: 'http_readability',
      title: 'With pic',
      textPlain: 'x',
      images: [{ url: 'https://cdn.example/photo.png', alt: 'Shot' }],
      fetchedAt: '2026-03-20T12:00:00.000Z',
    });
    const { captureDir } = await writeCapture(tmp, bundle, {
      ingestedAt: new Date('2026-03-20T12:00:00.000Z'),
    });

    const pngHeader = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const fetchMock = vi.fn(
      async () =>
        ({
          ok: true,
          headers: {
            get: (h: string) => (h.toLowerCase() === 'content-type' ? 'image/png' : null),
          },
          arrayBuffer: async () => pngHeader.buffer,
        }) as Response,
    );

    await downloadImagesToAssets(bundle, captureDir, {
      fetchImpl: fetchMock as unknown as typeof fetch,
      maxBytes: 50_000,
    });

    const assets = path.join(captureDir, 'assets');
    const files = await fs.readdir(assets);
    expect(files.some((f) => f.startsWith('img-') && f.endsWith('.png'))).toBe(true);
    const note = await fs.readFile(path.join(captureDir, 'note.md'), 'utf8');
    expect(note).toContain('![[assets/');
    expect(note).toContain('Shot');
  });

  it('does not embed when bytes are not a known image format', async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'vault-img-bad-'));
    const bundle = bundleFromParts({
      canonicalUrl: 'https://example.com/p',
      fetchMethod: 'http_readability',
      title: 'Bad img',
      textPlain: 'x',
      images: [{ url: 'https://evil.example/fake.png', alt: 'x' }],
      fetchedAt: '2026-03-20T12:00:00.000Z',
    });
    const { captureDir } = await writeCapture(tmp, bundle, {
      ingestedAt: new Date('2026-03-20T12:00:00.000Z'),
    });

    const htmlAsBytes = new TextEncoder().encode('<!doctype html><html>');
    const fetchMock = vi.fn(
      async () =>
        ({
          ok: true,
          headers: {
            get: (h: string) => (h.toLowerCase() === 'content-type' ? 'image/png' : null),
          },
          arrayBuffer: async () => htmlAsBytes.buffer,
        }) as Response,
    );

    await downloadImagesToAssets(bundle, captureDir, {
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const note = await fs.readFile(path.join(captureDir, 'note.md'), 'utf8');
    expect(note).not.toContain('## Hình ảnh');
  });

  it('sends Referer and Twitter cookies when fetching pbs.twimg.com URLs', async () => {
    vi.stubEnv('TWITTER_AUTH_TOKEN', 'tok');
    vi.stubEnv('TWITTER_CT0', 'ct0val');
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'vault-img-tw-'));
    const bundle = bundleFromParts({
      canonicalUrl: 'https://x.com/u/status/1',
      fetchMethod: 'x_api',
      title: 'Twimg',
      textPlain: 'x',
      images: [{ url: 'https://pbs.twimg.com/media/abc.jpg', alt: '' }],
      fetchedAt: '2026-03-20T12:00:00.000Z',
    });
    const { captureDir } = await writeCapture(tmp, bundle, {
      ingestedAt: new Date('2026-03-20T12:00:00.000Z'),
    });

    const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0]);
    const fetchMock = vi.fn(
      async (_url: string, init?: RequestInit) =>
        ({
          ok: true,
          headers: {
            get: (h: string) => (h.toLowerCase() === 'content-type' ? 'image/jpeg' : null),
          },
          arrayBuffer: async () => jpg.buffer,
        }) as Response,
    );

    await downloadImagesToAssets(bundle, captureDir, {
      fetchImpl: fetchMock as unknown as typeof fetch,
      maxBytes: 50_000,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://pbs.twimg.com/media/abc.jpg',
      expect.objectContaining({
        headers: expect.objectContaining({
          Referer: 'https://x.com/',
          Cookie: 'auth_token=tok; ct0=ct0val',
        }),
      }),
    );
    vi.unstubAllEnvs();
  });
});
