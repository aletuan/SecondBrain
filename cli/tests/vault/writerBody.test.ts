import { describe, expect, it } from 'vitest';
import { bundleFromParts } from '../../src/normaliser.js';
import { buildSourceMarkdownBody } from '../../src/vault/writer.js';

describe('buildSourceMarkdownBody', () => {
  it('uses default article shape for web captures', () => {
    const b = bundleFromParts({
      canonicalUrl: 'https://example.com/a',
      fetchMethod: 'http_readability',
      title: 'T',
      textPlain: 'body',
    });
    expect(buildSourceMarkdownBody(b)).toBe('# T\n\nbody\n');
  });

  it('formats YouTube transcript with timestamps when segments exist', () => {
    const b = bundleFromParts({
      canonicalUrl: 'https://www.youtube.com/watch?v=abcDEFghIj0',
      fetchMethod: 'apify',
      title: 'Vid',
      textPlain: 'A\n\nB',
      source: 'youtube',
      youtubeVideoId: 'abcDEFghIj0',
      transcriptSegments: [
        { startSec: 0, text: 'A' },
        { startSec: 65, text: 'B' },
      ],
    });
    const md = buildSourceMarkdownBody(b);
    expect(md).toContain('> YouTube: https://www.youtube.com/watch?v=abcDEFghIj0');
    expect(md).toContain('## Transcript (en)');
    expect(md).toContain('**0:00** A');
    expect(md).toContain('**1:05** B');
  });

  it('uses canonical URL blockquote when youtube id missing', () => {
    const b = bundleFromParts({
      canonicalUrl: 'https://www.youtube.com/watch?v=broken',
      fetchMethod: 'apify',
      title: 'X',
      textPlain: 'only text',
      source: 'youtube',
    });
    const md = buildSourceMarkdownBody(b);
    expect(md).toContain('> https://www.youtube.com/watch?v=broken');
    expect(md).toContain('## Transcript (en)');
    expect(md).toContain('only text');
  });
});
