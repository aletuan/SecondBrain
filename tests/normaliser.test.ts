import { describe, expect, it } from 'vitest';
import { bundleFromParts, normaliseRawHtml } from '../cli/src/normaliser.js';

describe('bundleFromParts', () => {
  it('fills required shape with defaults', () => {
    const b = bundleFromParts({
      canonicalUrl: 'https://example.com/a',
      fetchMethod: 'http_readability',
      title: 'T',
      textPlain: 'body',
    });
    expect(b).toMatchObject({
      canonicalUrl: 'https://example.com/a',
      title: 'T',
      textPlain: 'body',
      images: [],
      codeBlocks: [],
      fetchMethod: 'http_readability',
    });
    expect(b.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe('normaliseRawHtml', () => {
  it('extracts title, text, images, and fenced code from readability output', () => {
    const html = `<!doctype html><html><head><title>Page</title></head><body>
      <article>
        <h1>Hello</h1>
        <p>First paragraph.</p>
        <img src="/pic.png" alt="pic" />
        <pre><code class="language-ts">const x = 1;</code></pre>
      </article>
    </body></html>`;
    const fixed = new Date('2026-03-20T12:00:00.000Z');
    const b = normaliseRawHtml(html, 'https://example.com/post', 'http_readability', fixed);
    expect(b.canonicalUrl).toBe('https://example.com/post');
    expect(b.title.length).toBeGreaterThan(0);
    expect(b.textPlain).toContain('First paragraph');
    expect(b.fetchMethod).toBe('http_readability');
    expect(b.fetchedAt).toBe('2026-03-20T12:00:00.000Z');
    expect(b.images).toContainEqual({
      url: 'https://example.com/pic.png',
      alt: 'pic',
    });
    expect(b.codeBlocks.map((c) => c.code)).toContain('const x = 1;');
  });
});
