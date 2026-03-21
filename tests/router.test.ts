import { describe, expect, it } from 'vitest';
import { loadRouting, resolveStrategy } from '../src/router.js';

const sampleYaml = `
version: 1
defaultStrategy: http_readability
apifyDefaults:
  actorId: apify/website-content-crawler
routes:
  - match:
      hostSuffix: x.com
      pathPrefix: /
    strategy: x_api
  - match:
      hostSuffix: twitter.com
    strategy: x_api
  - match:
      hostSuffix: youtube.com
    strategy: apify
    apify:
      actorId: custom~youtube
      inputFromUrl: true
  - match:
      hostSuffix: youtu.be
    strategy: apify
    apify:
      actorId: custom~youtube
      inputFromUrl: true
  - match:
      hostSuffix: "*"
    strategy: http_readability
`;

describe('loadRouting + resolveStrategy', () => {
  it('maps example.com to http_readability', () => {
    const cfg = loadRouting(sampleYaml);
    expect(resolveStrategy(cfg, 'https://example.com/post').strategy).toBe('http_readability');
  });

  it('maps x.com status URL to x_api', () => {
    const cfg = loadRouting(sampleYaml);
    expect(resolveStrategy(cfg, 'https://x.com/user/status/1').strategy).toBe('x_api');
  });

  it('merges apify defaults for youtube route', () => {
    const cfg = loadRouting(sampleYaml);
    const r = resolveStrategy(cfg, 'https://youtube.com/watch?v=1');
    expect(r.strategy).toBe('apify');
    expect(r.apify?.actorId).toBe('custom~youtube');
    expect(r.apify?.inputFromUrl).toBe(true);
  });

  it('maps youtu.be short links to apify youtube route', () => {
    const cfg = loadRouting(sampleYaml);
    const r = resolveStrategy(cfg, 'https://youtu.be/dQw4w9WgXcQ');
    expect(r.strategy).toBe('apify');
    expect(r.apify?.actorId).toBe('custom~youtube');
  });

  it('uses defaultStrategy when no route matches host', () => {
    const yaml = `
version: 1
defaultStrategy: http_readability
routes:
  - match:
      hostSuffix: x.com
    strategy: x_api
`;
    const cfg = loadRouting(yaml);
    expect(resolveStrategy(cfg, 'https://news.example.org/a').strategy).toBe('http_readability');
  });
});
