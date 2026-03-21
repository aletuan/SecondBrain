/**
 * Kiểm tra APIFY_TOKEN trong `.env` và (mặc định) chạy actor YouTube từ routing
 * trên một video (tốn compute Apify — dùng `--token-only` nếu chỉ muốn thử token).
 *
 * Usage:
 *   pnpm verify-apify-youtube
 *   pnpm verify-apify-youtube --token-only
 *   pnpm verify-apify-youtube https://www.youtube.com/watch?v=VIDEO_ID
 */
import 'dotenv/config';
import { ApifyClient } from 'apify-client';
import { ingestYouTubeViaApify } from '../src/adapters/youtube.js';
import { readRoutingYamlSync } from '../src/config/routingFile.js';
import { loadRouting, resolveStrategy } from '../src/router.js';

/** Big Buck Bunny (CC) — thường có transcript để thử actor. */
const DEFAULT_YT_URL = 'https://www.youtube.com/watch?v=YE7VzlLtp-4';

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
    const segN = bundle.transcriptSegments?.length ?? 0;
    const preview = bundle.textPlain.replace(/\s+/g, ' ').trim().slice(0, 280);
    console.log('YouTube ingest: OK');
    console.log(`  title: ${bundle.title}`);
    console.log(`  video_id: ${bundle.youtubeVideoId ?? '(không parse được)'}`);
    console.log(`  transcript_chars: ${bundle.textPlain.length}`);
    console.log(`  segments: ${segN}`);
    console.log(`  preview: ${preview}${bundle.textPlain.length > 280 ? '…' : ''}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`YouTube ingest: FAIL — ${msg}`);
    process.exitCode = 1;
  }
}

main();
