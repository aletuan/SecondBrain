/**
 * Kiểm tra APIFY_TOKEN và (mặc định) chạ actor YouTube từ `config/routing.yaml`
 * (hoặc `routing.example.yaml`) trên một video.
 *
 * Usage:
 *   cd reader && pnpm verify-apify-youtube
 *   cd reader && pnpm verify-apify-youtube --token-only
 *   cd reader && pnpm verify-apify-youtube https://www.youtube.com/watch?v=VIDEO_ID
 *
 * (Standalone — không phụ thuộc `cli/`.)
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { ApifyClient } from 'apify-client';
import { parse as parseYaml } from 'yaml';

/** Big Buck Bunny (CC) — thường có transcript để thử actor. */
const DEFAULT_YT_URL = 'https://www.youtube.com/watch?v=YE7VzlLtp-4';

type StrategyName = 'http_readability' | 'apify' | 'youtube' | 'x_api';

type ApifyRouteConfig = {
  actorId: string;
  build?: string;
  inputFromUrl?: boolean;
  youtubeInput?: 'start_urls' | 'urls';
};

type RoutingRoute = {
  match: { hostSuffix?: string; pathPrefix?: string };
  strategy: StrategyName;
  apify?: ApifyRouteConfig;
};

type RoutingConfig = {
  version: number;
  defaultStrategy: StrategyName;
  routes: RoutingRoute[];
  apifyDefaults?: ApifyRouteConfig;
};

function readRoutingYamlSync(cwd: string): string {
  const local = path.join(cwd, 'config', 'routing.yaml');
  if (fs.existsSync(local)) return fs.readFileSync(local, 'utf8');
  return fs.readFileSync(path.join(cwd, 'config', 'routing.example.yaml'), 'utf8');
}

function loadRouting(yamlText: string): RoutingConfig {
  const raw = parseYaml(yamlText) as RoutingConfig;
  if (raw?.version !== 1) throw new Error('routing: expected version: 1');
  if (!raw.defaultStrategy) throw new Error('routing: missing defaultStrategy');
  if (!Array.isArray(raw.routes)) throw new Error('routing: routes must be an array');
  return raw;
}

function hostMatches(hostname: string, suffix: string): boolean {
  if (suffix === '*') return true;
  return hostname === suffix || hostname.endsWith(`.${suffix}`);
}

function pathMatches(pathname: string, prefix: string | undefined): boolean {
  if (prefix === undefined || prefix === '') return true;
  return (
    pathname === prefix ||
    pathname.startsWith(prefix.endsWith('/') ? prefix : `${prefix}/`) ||
    pathname.startsWith(prefix)
  );
}

function resolveStrategy(
  config: RoutingConfig,
  urlString: string,
): { strategy: StrategyName; apify?: ApifyRouteConfig } {
  const u = new URL(urlString);
  const hostname = u.hostname.toLowerCase();
  const pathname = u.pathname || '/';

  for (const route of config.routes) {
    const suf = route.match.hostSuffix;
    if (suf !== undefined && !hostMatches(hostname, suf.toLowerCase())) continue;
    if (!pathMatches(pathname, route.match.pathPrefix)) continue;
    let apify: ApifyRouteConfig | undefined;
    if (route.strategy === 'apify') {
      const merged = { ...config.apifyDefaults, ...route.apify };
      if (!merged.actorId) throw new Error('routing: apify route missing actorId and apifyDefaults.actorId');
      apify = merged as ApifyRouteConfig;
    }
    return { strategy: route.strategy, apify };
  }

  const strategy = config.defaultStrategy;
  if (strategy === 'apify') {
    const merged = { ...config.apifyDefaults };
    if (!merged.actorId) throw new Error('routing: default apify strategy requires apifyDefaults.actorId');
    return { strategy, apify: merged as ApifyRouteConfig };
  }
  return { strategy };
}

function extractYoutubeVideoId(urlString: string): string | null {
  try {
    const u = new URL(urlString);
    const h = u.hostname.replace(/^www\./, '').toLowerCase();
    if (h === 'youtu.be') {
      const id = u.pathname.split('/').filter(Boolean)[0] ?? '';
      return /^[\w-]{11}$/.test(id) ? id : null;
    }
    if (h === 'youtube.com' || h.endsWith('.youtube.com')) {
      const v = u.searchParams.get('v');
      if (v && /^[\w-]{11}$/.test(v)) return v;
      const embed = u.pathname.match(/\/embed\/([\w-]{11})/);
      if (embed) return embed[1]!;
      const shorts = u.pathname.match(/\/shorts\/([\w-]{11})/);
      if (shorts) return shorts[1]!;
      const live = u.pathname.match(/\/live\/([\w-]{11})/);
      if (live) return live[1]!;
    }
    return null;
  } catch {
    return null;
  }
}

function pickString(row: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

function numStart(o: Record<string, unknown>): number | undefined {
  for (const k of ['start', 'startSeconds', 'offset', 'time']) {
    const v = o[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string') {
      const n = parseFloat(v);
      if (!Number.isNaN(n)) return n;
    }
  }
  return undefined;
}

function textFromCaptionItem(item: unknown): string {
  if (typeof item === 'string') return item.trim();
  if (!item || typeof item !== 'object') return '';
  const o = item as Record<string, unknown>;
  const t =
    (typeof o.text === 'string' && o.text) ||
    (typeof o.subtitle === 'string' && o.subtitle) ||
    (typeof o.content === 'string' && o.content) ||
    '';
  return String(t).trim();
}

function transcriptFromApifyYoutubeRow(row: Record<string, unknown>): { textPlain: string } {
  const segments: { text: string }[] = [];
  const arrays = [
    row.subtitles,
    row.captions,
    row.transcriptSegments,
    row.transcripts,
    row.segments,
  ];
  for (const arr of arrays) {
    if (!Array.isArray(arr)) continue;
    for (const item of arr) {
      const text = textFromCaptionItem(item);
      if (!text) continue;
      segments.push({ text });
    }
    if (segments.length > 0) break;
  }

  if (segments.length > 0) {
    return { textPlain: segments.map((s) => s.text).join('\n\n') };
  }

  const single =
    (typeof row.fullText === 'string' && row.fullText.trim()) ||
    (typeof row.transcript === 'string' && row.transcript.trim()) ||
    (typeof row.plainText === 'string' && row.plainText.trim()) ||
    pickString(row, ['text', 'markdown', 'description']);

  return { textPlain: single };
}

function videoIdFromRow(row: Record<string, unknown>, pageUrl: string): string | null {
  const fromUrl = extractYoutubeVideoId(pageUrl);
  if (fromUrl) return fromUrl;
  for (const k of ['videoId', 'id', 'youtubeId']) {
    const v = row[k];
    if (typeof v === 'string' && /^[\w-]{11}$/.test(v)) return v;
  }
  return null;
}

function apifyYoutubeActorInput(
  pageUrl: string,
  youtubeInput: 'start_urls' | 'urls' | undefined,
): Record<string, unknown> {
  if (youtubeInput === 'urls') {
    return {
      urls: [pageUrl],
      language: 'en',
      includeAutoGenerated: true,
      mergeSegments: true,
    };
  }
  return { startUrls: [{ url: pageUrl }] };
}

async function ingestYouTubeViaApify(options: {
  url: string;
  actorId: string;
  token: string;
  build?: string;
  youtubeInput?: 'start_urls' | 'urls';
}): Promise<{
  title: string;
  youtubeVideoId: string | null;
  textPlain: string;
  segmentishCount: number;
}> {
  const client = new ApifyClient({ token: options.token });
  const input = apifyYoutubeActorInput(options.url, options.youtubeInput);
  const run = await client
    .actor(options.actorId)
    .call(input, options.build ? { build: options.build } : undefined);
  const { items } = await client.dataset(run.defaultDatasetId).listItems({ limit: 10 });
  const row = (items[0] ?? {}) as Record<string, unknown>;

  const vid = videoIdFromRow(row, options.url);
  const title =
    pickString(row, ['title', 'name', 'videoTitle']) || (vid ? `YouTube ${vid}` : 'YouTube capture');

  const { textPlain } = transcriptFromApifyYoutubeRow(row);
  if (!textPlain.trim()) {
    throw new Error(
      'youtube: Apify actor returned no transcript/text. Pin a YouTube transcript-capable actor and check dataset output fields.',
    );
  }

  const segN = Array.isArray(row.subtitles)
    ? row.subtitles.length
    : Array.isArray(row.segments)
      ? row.segments.length
      : 0;

  return { title, youtubeVideoId: vid, textPlain, segmentishCount: segN };
}

function parseArgs(): { tokenOnly: boolean; url: string } {
  const rest = process.argv.slice(2);
  const tokenOnly = rest.includes('--token-only');
  const urlArg = rest.find((a) => /^https?:\/\//i.test(a));
  return { tokenOnly, url: urlArg ?? DEFAULT_YT_URL };
}

async function checkToken(): Promise<{ ok: boolean; line: string }> {
  const token = process.env.APIFY_TOKEN?.trim();
  if (!token) {
    return { ok: false, line: 'Apify: FAIL — thiếu APIFY_TOKEN trong .env' };
  }
  try {
    const client = new ApifyClient({ token });
    const me = await client.user().get();
    const id = me?.username ?? me?.id ?? 'ok';
    return { ok: true, line: `Apify token: OK (user: ${String(id)})` };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, line: `Apify token: FAIL — ${msg}` };
  }
}

async function main(): Promise<void> {
  const { tokenOnly, url } = parseArgs();

  const tokenResult = await checkToken();
  console.log(tokenResult.line);
  if (!tokenResult.ok) {
    process.exitCode = 1;
    return;
  }

  if (tokenOnly) {
    console.log('(--token-only: không chạy actor)');
    return;
  }

  const cwd = process.cwd();
  const cfg = loadRouting(readRoutingYamlSync(cwd));
  let resolved: ReturnType<typeof resolveStrategy>;
  try {
    resolved = resolveStrategy(cfg, url);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`Routing: FAIL — ${msg}`);
    process.exitCode = 1;
    return;
  }

  if (resolved.strategy !== 'apify' || !resolved.apify) {
    console.error(
      `Routing: URL không map tới strategy apify (hiện: ${resolved.strategy}). Thêm route youtube.com / youtu.be trong config/routing.yaml.`,
    );
    process.exitCode = 1;
    return;
  }

  const { actorId, build, youtubeInput } = resolved.apify;
  console.log(`URL: ${url}`);
  console.log(
    `Actor: ${actorId}${build ? ` (build: ${build})` : ''}${youtubeInput ? ` [youtubeInput: ${youtubeInput}]` : ''}`,
  );

  if (/YOUR_|PLACEHOLDER|example/i.test(actorId)) {
    console.error(
      'Đổi actorId trong config/routing.yaml thành Actor YouTube có transcript (Apify Console), không dùng placeholder.',
    );
    process.exitCode = 1;
    return;
  }

  const token = process.env.APIFY_TOKEN!.trim();
  console.log('\nĐang chạy actor (có thể mất vài chục giây)…\n');

  try {
    const bundle = await ingestYouTubeViaApify({
      url,
      actorId,
      token,
      build,
      youtubeInput,
    });
    const preview = bundle.textPlain.replace(/\s+/g, ' ').trim().slice(0, 280);
    console.log('YouTube ingest: OK');
    console.log(`  title: ${bundle.title}`);
    console.log(`  video_id: ${bundle.youtubeVideoId ?? '(không parse được)'}`);
    console.log(`  transcript_chars: ${bundle.textPlain.length}`);
    console.log(`  segments-ish: ${bundle.segmentishCount}`);
    console.log(`  preview: ${preview}${bundle.textPlain.length > 280 ? '…' : ''}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`YouTube ingest: FAIL — ${msg}`);
    process.exitCode = 1;
  }
}

main();
