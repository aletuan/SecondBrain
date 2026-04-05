import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  extractTweetIdFromUrl,
  fetchXThread,
  fetchXArticleViaTwitterCli,
  ingestLinkedArticleForX,
  isLikelyXContentBlockOrError,
  pickArticleUrlFromTweet,
  primaryTweetText,
  articlePlainTextFromApi,
} from '../../cli/src/adapters/xApi.js';

describe('extractTweetIdFromUrl', () => {
  it('parses standard status URLs', () => {
    expect(extractTweetIdFromUrl('https://x.com/_avichawla/status/2034902650534187503')).toBe(
      '2034902650534187503',
    );
    expect(
      extractTweetIdFromUrl('https://twitter.com/foo/statuses/1234567890123456789'),
    ).toBe('1234567890123456789');
    expect(extractTweetIdFromUrl('https://mobile.twitter.com/bar/status/99')).toBe('99');
  });

  it('parses /i/web/status/…', () => {
    expect(extractTweetIdFromUrl('https://x.com/i/web/status/2034902650534187503')).toBe(
      '2034902650534187503',
    );
  });

  it('returns null when no id', () => {
    expect(extractTweetIdFromUrl('https://x.com/_avichawla')).toBeNull();
    expect(extractTweetIdFromUrl('not-a-url')).toBeNull();
  });
});

describe('pickArticleUrlFromTweet', () => {
  it('prefers entities expanded_url outside X', () => {
    expect(
      pickArticleUrlFromTweet({
        text: 'https://t.co/x',
        entities: {
          urls: [{ expanded_url: 'https://blog.example.com/post?x=1' }],
        },
      }),
    ).toBe('https://blog.example.com/post?x=1');
  });

  it('uses unwound_url when present', () => {
    expect(
      pickArticleUrlFromTweet({
        text: 'x',
        entities: {
          urls: [{ expanded_url: 'https://t.co/a', unwound_url: 'https://news.site/a' }],
        },
      }),
    ).toBe('https://news.site/a');
  });

  it('skips twitter/x hosts in entities except /i/article/', () => {
    expect(
      pickArticleUrlFromTweet({
        text: 'hi',
        entities: {
          urls: [{ expanded_url: 'https://twitter.com/foo/status/1' }],
        },
      }),
    ).toBeNull();
  });

  it('prefers x.com /i/article/ from entities over t.co in text', () => {
    expect(
      pickArticleUrlFromTweet({
        text: 'https://t.co/HTVp6zvP3v',
        entities: {
          urls: [{ expanded_url: 'https://x.com/i/article/2034896077460316163' }],
        },
      }),
    ).toBe('https://x.com/i/article/2034896077460316163');
  });

  it('falls back to first external URL in text', () => {
    expect(
      pickArticleUrlFromTweet({
        text: 'Read https://medium.com/p/abc — thanks',
        entities: {},
      }),
    ).toBe('https://medium.com/p/abc');
  });

  it('falls back to t.co in text when no expanded external link', () => {
    expect(pickArticleUrlFromTweet({ text: 'https://t.co/HTVp6zvP3v', entities: {} })).toBe(
      'https://t.co/HTVp6zvP3v',
    );
  });

  it('finds x.com /i/article/ URL in tweet text', () => {
    expect(
      pickArticleUrlFromTweet({
        text: 'Read https://x.com/i/article/99 — thanks',
        entities: {},
      }),
    ).toBe('https://x.com/i/article/99');
  });
});

describe('articlePlainTextFromApi', () => {
  it('reads known body keys from article object', () => {
    expect(articlePlainTextFromApi({ title: 'T', text: 'x'.repeat(50) })).toHaveLength(50);
    expect(articlePlainTextFromApi({ title: 'T', markdown: '# Hi\n\n' + 'p'.repeat(40) })).toContain('Hi');
    const apiPlain = 'Body from X API v2 article.plain_text field. '.repeat(2);
    expect(articlePlainTextFromApi({ title: 'T', plain_text: apiPlain })).toBe(apiPlain.trim());
  });

  it('returns null when only title', () => {
    expect(articlePlainTextFromApi({ title: 'Only title' })).toBeNull();
  });
});

describe('primaryTweetText', () => {
  it('prefers note_tweet.text when longer than root text', () => {
    expect(
      primaryTweetText({
        id: '1',
        text: 'Short https://t.co/x',
        note_tweet: {
          text: 'KV Caching in LLMs, Clearly Explained\n\nFull article body here.',
        },
      }),
    ).toContain('KV Caching');
  });

  it('uses root text when note_tweet is absent', () => {
    expect(primaryTweetText({ id: '1', text: 'Only' })).toBe('Only');
  });
});

describe('isLikelyXContentBlockOrError', () => {
  it('detects the common X bot / error shell copy', () => {
    expect(
      isLikelyXContentBlockOrError(
        "Something went wrong, but don't fret — let's give it another shot. Some privacy related extensions may cause issues on x.com.",
      ),
    ).toBe(true);
  });

  it('returns false for normal paragraphs', () => {
    expect(isLikelyXContentBlockOrError('Bernie Sanders discusses AI policy with Claude.')).toBe(false);
  });
});

describe('ingestLinkedArticleForX', () => {
  it('fills text from og:description when X article shell has little Readability text', async () => {
    const shellHtml = `<!doctype html><html><head>
      <meta property="og:title" content="Bernie on AI" />
      <meta property="og:description" content="Claude, this is Senator Bernie Sanders. We discuss AI and jobs." />
      <title>x</title>
      </head><body><div id="root"></div></body></html>`;
    const fetchMock = vi.fn(
      async () =>
        ({
          ok: true,
          status: 200,
          url: 'https://x.com/i/article/2034896077460316163',
          text: async () => shellHtml,
        }) as Response,
    );

    const b = await ingestLinkedArticleForX(
      'https://t.co/short',
      fetchMock as unknown as typeof fetch,
    );
    expect(b.canonicalUrl).toBe('https://x.com/i/article/2034896077460316163');
    expect(b.textPlain).toContain('Senator Bernie Sanders');
  });

  it('replaces long Readability error copy with og:description', async () => {
    const errorBody = `<p>Something went wrong, but don't fret — let's give it another shot. Some privacy related extensions may cause issues on x.com. Please disable them and try again.</p>`;
    const shellHtml = `<!doctype html><html><head>
      <meta property="og:title" content="Bernie on AI" />
      <meta property="og:description" content="Real article summary from Open Graph that is long enough to use." />
      </head><body>${errorBody}</body></html>`;
    const fetchMock = vi.fn(
      async () =>
        ({
          ok: true,
          status: 200,
          url: 'https://x.com/i/article/2034896077460316163',
          text: async () => shellHtml,
        }) as Response,
    );

    const b = await ingestLinkedArticleForX('https://x.com/i/article/2034896077460316163', fetchMock as unknown as typeof fetch);
    expect(b.textPlain).toContain('Open Graph');
    expect(b.textPlain).not.toContain('privacy related extensions');
  });

  it('throws on X article error shell without og:description', async () => {
    const shellHtml = `<!doctype html><html><head><title>x</title></head><body>
      <p>Something went wrong, but don't fret — let's give it another shot.</p>
      </body></html>`;
    const fetchMock = vi.fn(
      async () =>
        ({
          ok: true,
          status: 200,
          url: 'https://x.com/i/article/1',
          text: async () => shellHtml,
        }) as Response,
    );

    await expect(
      ingestLinkedArticleForX('https://x.com/i/article/1', fetchMock as unknown as typeof fetch),
    ).rejects.toThrow(/bot\/error page/);
  });
});

describe('fetchXThread', () => {
  const prev = process.env.X_BEARER_TOKEN;

  afterEach(() => {
    if (prev === undefined) delete process.env.X_BEARER_TOKEN;
    else process.env.X_BEARER_TOKEN = prev;
  });

  it('throws a helpful message when X_BEARER_TOKEN is missing', async () => {
    delete process.env.X_BEARER_TOKEN;
    await expect(fetchXThread('https://x.com/user/status/1')).rejects.toThrow(/Configure X API/);
    await expect(fetchXThread('https://x.com/user/status/1')).rejects.toThrow(/switch route to apify/);
  });

  it('maps API JSON to a CaptureBundle (tweet only, no article URL)', async () => {
    process.env.X_BEARER_TOKEN = 'test-bearer';
    const fetchMock = vi.fn(
      async () =>
        ({
          ok: true,
          status: 200,
          json: async () => ({
            data: {
              id: '111',
              text: 'Hello world',
              author_id: 'u1',
              created_at: '2026-03-20T12:00:00.000Z',
              entities: {},
            },
            includes: {
              users: [{ id: 'u1', username: 'alice', name: 'Alice' }],
            },
          }),
        }) as Response,
    );

    const b = await fetchXThread('https://x.com/alice/status/111', {
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(b.fetchMethod).toBe('x_api');
    expect(b.textPlain).toBe('Hello world');
    expect(b.canonicalUrl).toBe('https://x.com/alice/status/111');
  });

  it('loads linked article via Readability when entities point outside X', async () => {
    process.env.X_BEARER_TOKEN = 'test-bearer';
    const articleHtml = `<!doctype html><html><head><title>Article</title></head><body>
      <article><h1>Article Title</h1><p>Body paragraph.</p></article></body></html>`;

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const u = String(input);
      if (u.includes('api.twitter.com')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: {
              id: '111',
              text: 'https://t.co/x',
              author_id: 'u1',
              created_at: '2026-03-20T12:00:00.000Z',
              entities: {
                urls: [{ expanded_url: 'https://blog.example.com/p/1' }],
              },
            },
            includes: {
              users: [{ id: 'u1', username: 'alice', name: 'Alice' }],
            },
          }),
        } as Response;
      }
      if (u.startsWith('https://blog.example.com/')) {
        return {
          ok: true,
          status: 200,
          url: u,
          text: async () => articleHtml,
        } as Response;
      }
      throw new Error(`unexpected fetch: ${u}`);
    });

    const b = await fetchXThread('https://x.com/alice/status/111', {
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(b.fetchMethod).toBe('x_api');
    expect(b.canonicalUrl).toBe('https://blog.example.com/p/1');
    expect(b.textPlain).toContain('## Tweet gốc (@alice)');
    expect(b.textPlain).toContain('https://x.com/alice/status/111');
    expect(b.textPlain).toContain('Body paragraph');
  });

  it('uses note_tweet from API for long posts and does not fetch article HTML', async () => {
    process.env.X_BEARER_TOKEN = 'test-bearer';
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL) => {
        const u = String(input);
        if (u.includes('api.twitter.com')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              data: {
                id: '111',
                text: 'Read my post https://t.co/x',
                author_id: 'u1',
                created_at: '2026-03-20T12:00:00.000Z',
                entities: {
                  urls: [{ expanded_url: 'https://x.com/i/article/99' }],
                },
                note_tweet: {
                  text: 'KV Caching in LLMs — full long-form content from the X API note_tweet field.',
                },
              },
              includes: {
                users: [{ id: 'u1', username: 'alice', name: 'Alice' }],
              },
            }),
          } as Response;
        }
        throw new Error(`should not fetch non-API URL: ${u}`);
      },
    );

    const b = await fetchXThread('https://x.com/alice/status/111', {
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(b.canonicalUrl).toBe('https://x.com/alice/status/111');
    expect(b.textPlain).toContain('note_tweet field');
    expect(b.textPlain).toContain('KV Caching');
    expect(b.title).toContain('KV Caching');
  });

  it('falls back to title-only stub when twitter-cli returns null', async () => {
    process.env.X_BEARER_TOKEN = 'test-bearer';
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL) => {
        const u = String(input);
        if (u.includes('api.twitter.com')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              data: {
                id: '111',
                text: 'https://t.co/x',
                author_id: 'u1',
                created_at: '2026-03-20T12:00:00.000Z',
                article: { title: 'KV Caching in LLMs, Clearly Explained' },
                entities: {
                  urls: [
                    {
                      expanded_url: 'http://x.com/i/article/2034896077460316163',
                      unwound_url: 'https://x.com/i/article/2034896077460316163',
                    },
                  ],
                },
              },
              includes: {
                users: [{ id: 'u1', username: 'alice', name: 'Alice' }],
              },
            }),
          } as Response;
        }
        throw new Error(`unexpected fetch: ${u}`);
      },
    );

    const b = await fetchXThread('https://x.com/alice/status/111', {
      fetchImpl: fetchMock as unknown as typeof fetch,
      twitterCliFetch: async () => null,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(b.title).toBe('KV Caching in LLMs, Clearly Explained');
    expect(b.textPlain).toContain('KV Caching in LLMs');
    expect(b.textPlain).toContain('article.title');
  });

  it('uses twitter-cli full article body when API returns title-only', async () => {
    process.env.X_BEARER_TOKEN = 'test-bearer';
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL) => {
        const u = String(input);
        if (u.includes('api.twitter.com')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              data: {
                id: '111',
                text: 'https://t.co/x',
                author_id: 'u1',
                created_at: '2026-03-20T12:00:00.000Z',
                article: { title: 'KV Caching in LLMs' },
                entities: {
                  urls: [{ expanded_url: 'https://x.com/i/article/99' }],
                },
              },
              includes: {
                users: [{ id: 'u1', username: 'alice', name: 'Alice' }],
              },
            }),
          } as Response;
        }
        throw new Error(`unexpected fetch: ${u}`);
      },
    );

    const b = await fetchXThread('https://x.com/alice/status/111', {
      fetchImpl: fetchMock as unknown as typeof fetch,
      twitterCliFetch: async () => ({
        title: 'KV Caching in LLMs, Clearly Explained',
        text: 'You must have seen it every time you use ChatGPT that the first token takes longer.',
      }),
    });

    expect(b.title).toBe('KV Caching in LLMs, Clearly Explained');
    expect(b.textPlain).toContain('first token takes longer');
    expect(b.textPlain).not.toContain('article.title');
  });

  it('uses twitter-cli for /i/article/ URL when no article object from API', async () => {
    process.env.X_BEARER_TOKEN = 'test-bearer';
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL) => {
        const u = String(input);
        if (u.includes('api.twitter.com')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              data: {
                id: '222',
                text: 'https://t.co/x',
                author_id: 'u1',
                created_at: '2026-03-20T12:00:00.000Z',
                entities: {
                  urls: [{ expanded_url: 'https://x.com/i/article/99' }],
                },
              },
              includes: {
                users: [{ id: 'u1', username: 'bob', name: 'Bob' }],
              },
            }),
          } as Response;
        }
        throw new Error(`unexpected fetch: ${u}`);
      },
    );

    const b = await fetchXThread('https://x.com/bob/status/222', {
      fetchImpl: fetchMock as unknown as typeof fetch,
      twitterCliFetch: async () => ({
        title: 'Deep Dive Article',
        text: 'Full article content from twitter-cli.',
      }),
    });

    expect(b.title).toBe('Deep Dive Article');
    expect(b.textPlain).toContain('Full article content from twitter-cli');
  });

  it('when API returns article.plain_text, prefers twitter-cli body and images over API text', async () => {
    process.env.X_BEARER_TOKEN = 'test-bearer';
    const apiBody =
      'Plain text from API only — no image URLs here. '.repeat(2).trim();
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL) => {
        const u = String(input);
        if (u.includes('api.twitter.com')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              data: {
                id: '333',
                text: 'https://t.co/x',
                author_id: 'u1',
                created_at: '2026-03-20T12:00:00.000Z',
                article: { title: 'Article Title', plain_text: apiBody },
                entities: {
                  urls: [{ expanded_url: 'https://x.com/i/article/99' }],
                },
              },
              includes: {
                users: [{ id: 'u1', username: 'carol', name: 'Carol' }],
              },
            }),
          } as Response;
        }
        throw new Error(`unexpected fetch: ${u}`);
      },
    );

    const cliFetch = vi.fn(async () => ({
      title: 'From CLI',
      text: 'Rich markdown from GraphQL path with ![img](https://pbs.twimg.com/media/x.jpg).',
      images: ['https://pbs.twimg.com/media/x.jpg'],
    }));

    const b = await fetchXThread('https://x.com/carol/status/333', {
      fetchImpl: fetchMock as unknown as typeof fetch,
      twitterCliFetch: cliFetch,
    });

    expect(cliFetch).toHaveBeenCalledWith('333');
    expect(b.textPlain).toContain('Rich markdown from GraphQL');
    expect(b.textPlain).not.toContain('Plain text from API only');
    expect(b.images).toEqual([{ url: 'https://pbs.twimg.com/media/x.jpg', alt: '' }]);
    expect(b.title).toBe('From CLI');
  });

  it('when API returns article.plain_text but twitter-cli fails, falls back to API body', async () => {
    process.env.X_BEARER_TOKEN = 'test-bearer';
    const apiBody =
      'Fallback body from article.plain_text when CLI is unavailable. '.repeat(2).trim();
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL) => {
        const u = String(input);
        if (u.includes('api.twitter.com')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              data: {
                id: '444',
                text: 'https://t.co/x',
                author_id: 'u1',
                created_at: '2026-03-20T12:00:00.000Z',
                article: { title: 'T', plain_text: apiBody },
                entities: {},
              },
              includes: {
                users: [{ id: 'u1', username: 'dave', name: 'Dave' }],
              },
            }),
          } as Response;
        }
        throw new Error(`unexpected fetch: ${u}`);
      },
    );

    const cliFetch = vi.fn(async () => null);

    const b = await fetchXThread('https://x.com/dave/status/444', {
      fetchImpl: fetchMock as unknown as typeof fetch,
      twitterCliFetch: cliFetch,
    });

    expect(cliFetch).toHaveBeenCalledWith('444');
    expect(b.textPlain).toContain('Fallback body from article.plain_text');
    expect(b.images ?? []).toEqual([]);
  });
});
