import { describe, expect, it, vi } from 'vitest';
import { ingestApify } from '../../cli/src/adapters/apify.js';

describe('ingestApify', () => {
  it('maps mocked dataset rows to a normalised bundle', async () => {
    const call = vi.fn(async () => ({ defaultDatasetId: 'ds1' }));
    const listItems = vi.fn(async () => ({
      items: [
        {
          title: 'Crawled',
          text: 'Plain body',
          screenshotUrl: 'https://api.apify.com/v2/key-value-stores/x/screenshot.png',
        },
      ],
    }));
    const client = {
      actor: () => ({ call }),
      dataset: () => ({ listItems }),
    };
    const b = await ingestApify({
      url: 'https://heavy.example/page',
      actorId: 'apify/website-content-crawler',
      token: 'test-token',
      client,
    });
    expect(call).toHaveBeenCalled();
    expect(b.fetchMethod).toBe('apify');
    expect(b.title).toBe('Crawled');
    expect(b.textPlain).toBe('Plain body');
    expect(b.images[0]?.url).toContain('screenshot.png');
  });
});
