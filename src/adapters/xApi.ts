import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { BROWSER_UA } from './httpReadability.js';
import { bundleFromParts, normaliseRawHtml } from '../normaliser.js';
import type { CaptureBundle } from '../types/capture.js';
import { formatFetchFailure } from '../util/fetchErrors.js';

const execFileAsync = promisify(execFile);

/** X / Twitter “Articles” (long-form on x.com), not a normal article site. */
export function isXArticlePageUrl(urlString: string): boolean {
  try {
    const u = new URL(urlString);
    const h = u.hostname.replace(/^www\./, '').toLowerCase();
    if (h !== 'x.com' && h !== 'twitter.com' && !h.endsWith('.x.com')) return false;
    return /^\/i\/article\/\d+/i.test(u.pathname);
  } catch {
    return false;
  }
}

function decodeBasicHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function metaContent(html: string, attr: 'property' | 'name', key: string): string | undefined {
  const patterns = [
    new RegExp(
      `<meta\\s+${attr}=["']${key}["']\\s+content=["']([^"']*)["']`,
      'i',
    ),
    new RegExp(
      `<meta\\s+content=["']([^"']*)["']\\s+${attr}=["']${key}["']`,
      'i',
    ),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return decodeBasicHtmlEntities(m[1]);
  }
  return undefined;
}

function extractOpenGraphArticle(html: string): { title?: string; description?: string } {
  return {
    title: metaContent(html, 'property', 'og:title') ?? metaContent(html, 'name', 'twitter:title'),
    description:
      metaContent(html, 'property', 'og:description') ??
      metaContent(html, 'name', 'twitter:description') ??
      metaContent(html, 'name', 'description'),
  };
}

function ogImageAsRefs(html: string): CaptureBundle['images'] {
  const raw = metaContent(html, 'property', 'og:image')?.trim();
  if (!raw) return [];
  try {
    return [{ url: new URL(raw).href, alt: 'Open Graph image' }];
  } catch {
    return [];
  }
}

/** X often returns a full “Something went wrong…” shell that Readability still extracts as long text. */
export function isLikelyXContentBlockOrError(textPlain: string): boolean {
  const t = textPlain.toLowerCase();
  if (t.includes('privacy related extensions') && t.includes('x.com')) return true;
  if (t.includes('something went wrong') && t.includes("give it another shot")) return true;
  if (t.includes("couldn't log you in") || t.includes('could not log you in')) return true;
  if (t.includes('captcha') && t.includes('x.com')) return true;
  return false;
}

const X_ARTICLE_READABILITY_MIN_CHARS = 200;
const OG_DESC_MIN_CHARS = 40;

function bundleFromOpenGraph(
  finalUrl: string,
  meta: { title?: string; description?: string },
  fromReader: CaptureBundle,
  images: CaptureBundle['images'],
): CaptureBundle {
  const desc = meta.description?.trim() ?? '';
  const title = (meta.title?.trim() || fromReader.title || finalUrl).trim();
  return bundleFromParts({
    canonicalUrl: finalUrl,
    title: title || finalUrl,
    textPlain: desc || fromReader.textPlain,
    images,
    codeBlocks: [],
    fetchedAt: fromReader.fetchedAt,
    fetchMethod: 'http_readability',
  });
}

/**
 * Fetch a URL (follows redirects), run Readability; for `x.com/i/article/…` (and other X HTML)
 * prefer Open Graph text when Readability only got an error/shell page or the body is too thin.
 */
export async function ingestLinkedArticleForX(
  articleUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<CaptureBundle> {
  let res: Response;
  try {
    res = await fetchImpl(articleUrl, {
      headers: {
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
        'User-Agent': BROWSER_UA,
      },
    });
  } catch (e) {
    throw new Error(`x_linked_article: ${formatFetchFailure(articleUrl, e)}`);
  }
  if (!res.ok) {
    throw new Error(`x_linked_article: HTTP ${res.status} for ${articleUrl}`);
  }
  const finalUrl = res.url || articleUrl;
  const html = await res.text();
  const fromReader = normaliseRawHtml(html, finalUrl, 'http_readability');
  const plainLen = fromReader.textPlain.replace(/\s+/g, ' ').trim().length;
  const meta = extractOpenGraphArticle(html);
  const desc = meta.description?.trim() ?? '';
  const readerBad = isLikelyXContentBlockOrError(fromReader.textPlain);
  const isArticle = isXArticlePageUrl(finalUrl);
  const thin = plainLen < X_ARTICLE_READABILITY_MIN_CHARS;
  const ogOk = desc.length >= OG_DESC_MIN_CHARS;

  if (isArticle && readerBad && !ogOk) {
    throw new Error(
      'x_linked_article: X returned a bot/error page and Open Graph has no usable description. Retry later, open the article in a browser once, or use an Apify actor for X.',
    );
  }

  if (ogOk && (readerBad || thin)) {
    const imgs = ogImageAsRefs(html);
    return bundleFromOpenGraph(
      finalUrl,
      meta,
      fromReader,
      imgs.length > 0 ? imgs : fromReader.images,
    );
  }

  return fromReader;
}

function requireBearer(): string {
  const t = process.env.X_BEARER_TOKEN?.trim();
  if (!t) {
    throw new Error(
      'Configure X API: set X_BEARER_TOKEN for X/Twitter URLs, or switch route to apify in config/routing.yaml.',
    );
  }
  return t;
}

/** Parse numeric tweet id from x.com / twitter.com status URLs. */
export function extractTweetIdFromUrl(urlString: string): string | null {
  try {
    const u = new URL(urlString);
    const path = u.pathname;
    let m = path.match(/\/status(?:es)?\/(\d+)/);
    if (m) return m[1];
    m = path.match(/\/i\/(?:web\/)?status\/(\d+)/);
    if (m) return m[1];
    return null;
  } catch {
    return null;
  }
}

function isXOrShortenerHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === 't.co' || h === 'twitter.com' || h === 'www.twitter.com' || h === 'x.com' || h === 'www.x.com')
    return true;
  if (h === 'mobile.twitter.com' || h === 'mobile.x.com') return true;
  if (h.endsWith('.twitter.com') || h.endsWith('.x.com')) return true;
  return false;
}

/**
 * Prefer `entities.urls[].expanded_url` / unwound_url.
 * X “Articles” live on `x.com/i/article/{id}` — we must not skip them as “internal X”
 * (otherwise we only follow `t.co` and Readability gets an empty shell).
 */
export function pickArticleUrlFromTweet(data: {
  text: string;
  entities?: { urls?: Array<{ expanded_url?: string; unwound_url?: string }> };
}): string | null {
  for (const u of data.entities?.urls ?? []) {
    const raw = (u.unwound_url ?? u.expanded_url)?.trim();
    if (!raw) continue;
    try {
      const parsed = new URL(raw);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') continue;
      if (isXArticlePageUrl(parsed.href)) return parsed.href;
    } catch {
      continue;
    }
  }

  for (const u of data.entities?.urls ?? []) {
    const raw = (u.unwound_url ?? u.expanded_url)?.trim();
    if (!raw) continue;
    try {
      const parsed = new URL(raw);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') continue;
      if (isXOrShortenerHost(parsed.hostname)) continue;
      return parsed.href;
    } catch {
      continue;
    }
  }

  const fromText = data.text.match(/https?:\/\/[^\s<>"{}|\\^`[\]]+/gi) ?? [];
  for (const raw of fromText) {
    try {
      const parsed = new URL(raw.replace(/[),.;]+$/, ''));
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') continue;
      if (isXArticlePageUrl(parsed.href)) return parsed.href;
    } catch {
      continue;
    }
  }

  for (const raw of fromText) {
    try {
      const parsed = new URL(raw.replace(/[),.;]+$/, ''));
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') continue;
      if (isXOrShortenerHost(parsed.hostname)) continue;
      return parsed.href;
    } catch {
      continue;
    }
  }

  for (const raw of fromText) {
    try {
      const parsed = new URL(raw.replace(/[),.;]+$/, ''));
      if (parsed.hostname.toLowerCase() === 't.co') return parsed.href;
    } catch {
      continue;
    }
  }

  return null;
}

type TweetEntities = { urls?: Array<{ expanded_url?: string; unwound_url?: string }> };

type TweetV2Data = {
  id: string;
  text: string;
  author_id?: string;
  created_at?: string;
  entities?: TweetEntities;
  /** Long posts: full text. Request `tweet.fields=note_tweet`. */
  note_tweet?: { text: string; entities?: TweetEntities };
  /** X Articles: API returns only `{ title }` on all known tiers (no body). Full body via twitter-cli. */
  article?: Record<string, unknown>;
};

type TweetV2Response = {
  data?: TweetV2Data;
  includes?: { users?: Array<{ id: string; username: string; name: string }> };
  errors?: Array<{ detail?: string; title?: string }>;
};

const MIN_ARTICLE_BODY_CHARS = 40;

/** Prefer `note_tweet.text` when X returns a long-form body (Articles, long posts). */
export function primaryTweetText(data: TweetV2Data): string {
  const shortText = (data.text ?? '').trim();
  const note = data.note_tweet?.text?.trim();
  if (note && note.length > shortText.length) return note;
  return data.text ?? '';
}

/** If X returns article body in any known field, use it (field set may vary by API access tier). */
export function articlePlainTextFromApi(article: unknown): string | null {
  if (!article || typeof article !== 'object') return null;
  const o = article as Record<string, unknown>;
  for (const k of [
    'text',
    'content',
    'plain_text',
    'body',
    'markdown',
    'description',
    'article_text',
  ]) {
    const v = o[k];
    if (typeof v === 'string' && v.trim().length >= MIN_ARTICLE_BODY_CHARS) return v.trim();
  }
  return null;
}

function articleTitleFromApi(article: unknown): string {
  if (!article || typeof article !== 'object') return '';
  const t = (article as Record<string, unknown>).title;
  return typeof t === 'string' ? t.trim() : '';
}

function httpsArticleLink(url: string): string {
  try {
    const u = new URL(url);
    if (u.protocol === 'http:' && u.hostname.replace(/^www\./, '').match(/^(x|twitter)\.com$/))
      u.protocol = 'https:';
    return u.href;
  } catch {
    return url;
  }
}

function pickArticleUrlForTweet(data: TweetV2Data): string | null {
  const shortPick = pickArticleUrlFromTweet({
    text: data.text ?? '',
    entities: data.entities,
  });
  if (shortPick) return shortPick;
  if (data.note_tweet) {
    return pickArticleUrlFromTweet({
      text: data.note_tweet.text,
      entities: data.note_tweet.entities,
    });
  }
  return null;
}

function titleFromLongPost(text: string, username: string, displayName?: string): string {
  const line = text.split(/\r?\n/).map((l) => l.trim()).find((l) => l.length > 0);
  if (line && line.length <= 120) return line;
  const slice = (line ?? text).slice(0, 80).trim();
  const base = displayName ? `@${username} — ${displayName}` : `@${username}`;
  return slice ? `${base}: ${slice}` : `${base} — post`;
}

/** JSON shape returned by scripts/fetch-x-article.py. */
type FetchXArticleResult = {
  ok: boolean;
  title?: string;
  text?: string;
  images?: string[];
  error?: string;
};

/**
 * Fetch full X Article body (with embedded images) via our Python helper
 * that uses twitter-cli's GraphQL client internally.
 * Requires `uv` on PATH, `twitter-cli` installed (`uv tool install twitter-cli`),
 * and TWITTER_AUTH_TOKEN + TWITTER_CT0 env vars.
 * Returns null if the fetch fails or dependencies are missing.
 */
export async function fetchXArticleViaTwitterCli(
  tweetId: string,
): Promise<{ title: string; text: string; images: string[] } | null> {
  const env: Record<string, string> = { ...process.env } as Record<string, string>;
  const scriptPath = new URL('../../scripts/fetch-x-article.py', import.meta.url).pathname;
  try {
    const { stdout } = await execFileAsync(
      'uv',
      ['run', '--with', 'twitter-cli', 'python3', scriptPath, tweetId],
      { env, timeout: 60_000 },
    );
    const parsed = JSON.parse(stdout) as FetchXArticleResult;
    if (!parsed.ok || !parsed.text) return null;
    return {
      title: parsed.title ?? '',
      text: parsed.text,
      images: parsed.images ?? [],
    };
  } catch {
    return null;
  }
}

export type FetchXThreadOptions = {
  fetchImpl?: typeof fetch;
  /** Used to load the linked article HTML (defaults to `fetchImpl` or global `fetch`). */
  articleFetchImpl?: typeof fetch;
  /** Override for twitter-cli article fetch (for testing). */
  twitterCliFetch?: (tweetId: string) => Promise<{ title: string; text: string; images?: string[] } | null>;
};

/**
 * Single tweet via X API v2.
 * - Requests `note_tweet` + `article`. X API only returns `article.title` (no body) on all known tiers.
 * - For X Articles (title-only from API), tries `twitter-cli` (GraphQL + cookies) to get full body.
 * - Off-platform URLs still use HTTP (`ingestLinkedArticleForX`).
 */
export async function fetchXThread(
  url: string,
  options?: FetchXThreadOptions,
): Promise<CaptureBundle> {
  const token = requireBearer();
  const tweetId = extractTweetIdFromUrl(url);
  if (!tweetId) {
    throw new Error(
      'X API: could not parse tweet id from URL. Expected …/status/<id> (x.com or twitter.com).',
    );
  }

  const fetchImpl = options?.fetchImpl ?? fetch;
  const articleFetch = options?.articleFetchImpl ?? fetchImpl;
  const cliFetch = options?.twitterCliFetch ?? fetchXArticleViaTwitterCli;

  const params = new URLSearchParams({
    'tweet.fields': 'created_at,author_id,text,entities,note_tweet,article',
    expansions: 'author_id',
    'user.fields': 'username,name',
  });
  const apiUrl = `https://api.twitter.com/2/tweets/${tweetId}?${params}`;
  let res: Response;
  try {
    res = await fetchImpl(apiUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (e) {
    throw new Error(`X API: network error calling Twitter — ${formatFetchFailure(apiUrl, e)}`);
  }

  let json: TweetV2Response;
  try {
    json = (await res.json()) as TweetV2Response;
  } catch (e) {
    throw new Error(
      `X API: invalid JSON from Twitter (${res.status}) — ${formatFetchFailure(apiUrl, e)}`,
    );
  }
  if (!res.ok) {
    const detail =
      json.errors?.map((e) => e.detail ?? e.title).filter(Boolean).join('; ') ||
      res.statusText;
    throw new Error(`X API: tweet lookup failed (${res.status}): ${detail}`);
  }
  const data = json.data;
  if (!data) {
    throw new Error('X API: empty response (tweet missing or inaccessible)');
  }

  const author = json.includes?.users?.find((u) => u.id === data.author_id);
  const username = author?.username ?? 'user';
  const tweetPermalink = `https://x.com/${username}/status/${data.id}`;
  const bodyText = primaryTweetText(data);
  const tweetHeader = `## Tweet gốc (@${username})\n${tweetPermalink}\n\n${bodyText}\n`;

  const shortText = data.text ?? '';
  const noteText = data.note_tweet?.text?.trim() ?? '';
  const hasApiLongForm = noteText.length > shortText.length;

  if (hasApiLongForm) {
    return bundleFromParts({
      canonicalUrl: tweetPermalink,
      title: titleFromLongPost(noteText, username, author?.name),
      textPlain: `## Post (@${username})\n${tweetPermalink}\n\n${noteText}\n`,
      fetchMethod: 'x_api',
      fetchedAt: data.created_at ?? new Date().toISOString(),
    });
  }

  const apiArticle = data.article;
  const articleBody = articlePlainTextFromApi(apiArticle);
  const articleTitle = articleTitleFromApi(apiArticle);
  const hasArticleCard = apiArticle != null && typeof apiArticle === 'object';

  if (articleBody && articleBody.length > shortText.length) {
    // Try twitter-cli first for richer markdown with images
    const cliResult = await cliFetch(tweetId);
    if (cliResult?.text) {
      const t = cliResult.title || articleTitle || titleFromLongPost(cliResult.text, username, author?.name);
      return bundleFromParts({
        canonicalUrl: tweetPermalink,
        title: t,
        textPlain: `## X Article (@${username})\n${tweetPermalink}\n\n# ${t}\n\n${cliResult.text}\n`,
        images: (cliResult.images ?? []).map((url) => ({ url, alt: '' })),
        fetchMethod: 'x_api',
        fetchedAt: data.created_at ?? new Date().toISOString(),
      });
    }
    // Fallback: API plain text (no images)
    const t = articleTitle || titleFromLongPost(articleBody, username, author?.name);
    return bundleFromParts({
      canonicalUrl: tweetPermalink,
      title: t,
      textPlain: `## X Article (@${username})\n${tweetPermalink}\n\n# ${articleTitle || t}\n\n${articleBody}\n`,
      fetchMethod: 'x_api',
      fetchedAt: data.created_at ?? new Date().toISOString(),
    });
  }

  if (hasArticleCard && articleTitle) {
    // Try twitter-cli (GraphQL + cookies) for full article body with images
    const cliResult = await cliFetch(tweetId);
    if (cliResult?.text) {
      return bundleFromParts({
        canonicalUrl: tweetPermalink,
        title: cliResult.title || articleTitle,
        textPlain: `## X Article (@${username})\n${tweetPermalink}\n\n# ${cliResult.title || articleTitle}\n\n${cliResult.text}\n`,
        images: (cliResult.images ?? []).map((url) => ({ url, alt: '' })),
        fetchMethod: 'x_api',
        fetchedAt: data.created_at ?? new Date().toISOString(),
      });
    }

    // Fallback: title-only stub
    const artUrl = pickArticleUrlForTweet(data);
    const link = artUrl ? httpsArticleLink(artUrl) : '';
    return bundleFromParts({
      canonicalUrl: tweetPermalink,
      title: articleTitle,
      textPlain: [
        `## X Article (@${username})`,
        tweetPermalink,
        '',
        `# ${articleTitle}`,
        '',
        '_API chỉ trả `article.title`. twitter-cli cũng không lấy được body. Mở bài trên trình duyệt để đọc đầy đủ._',
        link ? '' : null,
        link ? `[Article](${link})` : null,
        '',
      ]
        .filter((x) => x != null)
        .join('\n'),
      fetchMethod: 'x_api',
      fetchedAt: data.created_at ?? new Date().toISOString(),
    });
  }

  const articleUrl = pickArticleUrlForTweet(data);
  if (!articleUrl) {
    const title = author?.name
      ? `@${username} — ${author.name}`
      : `@${username} — post ${data.id}`;
    return bundleFromParts({
      canonicalUrl: tweetPermalink,
      title,
      textPlain: bodyText,
      fetchMethod: 'x_api',
      fetchedAt: data.created_at ?? new Date().toISOString(),
    });
  }

  if (articleUrl && isXArticlePageUrl(articleUrl)) {
    // Try twitter-cli for full article body with images
    const cliResult = await cliFetch(tweetId);
    if (cliResult?.text) {
      return bundleFromParts({
        canonicalUrl: tweetPermalink,
        title: cliResult.title || `@${username} — X Article`,
        textPlain: `## X Article (@${username})\n${tweetPermalink}\n\n# ${cliResult.title || 'X Article'}\n\n${cliResult.text}\n`,
        images: (cliResult.images ?? []).map((url) => ({ url, alt: '' })),
        fetchMethod: 'x_api',
        fetchedAt: data.created_at ?? new Date().toISOString(),
      });
    }

    // Fallback: stub with link
    const link = httpsArticleLink(articleUrl);
    return bundleFromParts({
      canonicalUrl: tweetPermalink,
      title: `@${username} — X Article`,
      textPlain: [
        `## X Article (@${username})`,
        tweetPermalink,
        '',
        'Không có `article` đủ từ API; twitter-cli cũng không lấy được. Mở trên trình duyệt.',
        `[Article](${link})`,
      ].join('\n'),
      fetchMethod: 'x_api',
      fetchedAt: data.created_at ?? new Date().toISOString(),
    });
  }

  let article: CaptureBundle;
  try {
    article = await ingestLinkedArticleForX(articleUrl, articleFetch);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(
      `X API: tweet links to ${articleUrl} but article could not be loaded — ${msg}`,
    );
  }

  return bundleFromParts({
    canonicalUrl: article.canonicalUrl,
    title: article.title || `From @${username}: ${tweetPermalink}`,
    textPlain: `${tweetHeader}\n---\n\n${article.textPlain}`,
    images: article.images,
    codeBlocks: article.codeBlocks,
    fetchMethod: 'x_api',
    fetchedAt: data.created_at ?? article.fetchedAt,
  });
}
