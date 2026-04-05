import { describe, expect, it, vi } from 'vitest';
import { ingestHttpReadability } from '../../cli/src/adapters/httpReadability.js';

const fixtureHtml = `<!doctype html><html><head><title>T</title></head><body>
<article><h1>Article</h1><p>Para one.</p><img src="https://cdn.example/img.png" alt="i" /></article>
</body></html>`;

describe('ingestHttpReadability', () => {
  it('maps fetched HTML through Readability into a bundle', async () => {
    const fetchMock = vi.fn(async () =>
      Promise.resolve({
        ok: true,
        status: 200,
        text: async () => fixtureHtml,
      } as Response),
    );
    const b = await ingestHttpReadability('https://blog.example/p/a', fetchMock as unknown as typeof fetch);
    expect(b.canonicalUrl).toBe('https://blog.example/p/a');
    expect(b.fetchMethod).toBe('http_readability');
    expect(b.textPlain).toContain('Para one');
    expect(b.images.some((i) => i.url.includes('img.png'))).toBe(true);
  });
});
