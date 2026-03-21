import fs from 'node:fs/promises';
import path from 'node:path';
import OpenAI from 'openai';
import { ingestApify } from '../adapters/apify.js';
import { ingestHttpReadability } from '../adapters/httpReadability.js';
import { fetchXThread } from '../adapters/xApi.js';
import { extractYoutubeVideoId, ingestYouTubeViaApify } from '../adapters/youtube.js';
import { readRoutingYamlSync } from '../config/routingFile.js';
import type { OpenAIClientLike } from '../llm/enrich.js';
import { enrichNote } from '../llm/enrich.js';
import { translateTranscriptSegments } from '../llm/translateTranscript.js';
import { loadRouting, resolveStrategy } from '../router.js';
import type { CaptureBundle } from '../types/capture.js';
import { downloadImagesToAssets, writeCapture } from '../vault/writer.js';

export async function runIngest(options: {
  url: string;
  noLlm?: boolean;
  cwd?: string;
  /** YouTube: batch-translate transcript segments to Vietnamese (OpenAI). */
  translateTranscriptVi?: boolean;
}): Promise<string> {
  const cwd = options.cwd ?? process.cwd();
  const vaultRoot = path.resolve(cwd, process.env.VAULT_ROOT?.trim() || 'vault');
  const cfg = loadRouting(readRoutingYamlSync(cwd));
  const { strategy, apify } = resolveStrategy(cfg, options.url);

  let bundle: CaptureBundle;
  if (strategy === 'http_readability') {
    bundle = await ingestHttpReadability(options.url);
  } else if (strategy === 'apify') {
    const token = process.env.APIFY_TOKEN?.trim();
    if (!token) throw new Error('APIFY_TOKEN is required for Apify routes');
    const isYoutube =
      extractYoutubeVideoId(options.url) !== null ||
      /youtube\.com|youtu\.be/i.test(new URL(options.url).hostname);
    if (isYoutube) {
      bundle = await ingestYouTubeViaApify({
        url: options.url,
        actorId: apify!.actorId,
        token,
        build: apify!.build,
        youtubeInput: apify!.youtubeInput,
      });
    } else {
      bundle = await ingestApify({
        url: options.url,
        actorId: apify!.actorId,
        token,
        build: apify!.build,
      });
    }
  } else {
    bundle = await fetchXThread(options.url);
  }

  const strictTranslate = options.translateTranscriptVi === true;
  const skipTranslate = options.translateTranscriptVi === false;
  const autoTranslate = options.translateTranscriptVi === undefined;

  let doTranslate = false;
  if (skipTranslate) {
    doTranslate = false;
  } else if (strictTranslate) {
    if (bundle.source !== 'youtube') {
      throw new Error('ingest: --translate-transcript is only for YouTube captures');
    }
    if (!bundle.transcriptSegments?.length) {
      throw new Error('ingest: no transcript segments to translate');
    }
    if (!process.env.OPENAI_API_KEY?.trim()) {
      throw new Error('ingest: --translate-transcript requires OPENAI_API_KEY');
    }
    doTranslate = true;
  } else if (autoTranslate) {
    doTranslate =
      bundle.source === 'youtube' &&
      Boolean(bundle.transcriptSegments?.length) &&
      Boolean(process.env.OPENAI_API_KEY?.trim());
  }

  if (doTranslate) {
    const key = process.env.OPENAI_API_KEY!.trim();
    const model =
      process.env.YT_TRANSLATE_MODEL?.trim() ||
      process.env.OPENAI_MODEL ||
      'gpt-4o-mini';
    const client = new OpenAI({ apiKey: key }) as unknown as OpenAIClientLike;
    const transcriptSegmentsVi = await translateTranscriptSegments(
      bundle.transcriptSegments!,
      { client, model },
    );
    bundle = { ...bundle, transcriptSegmentsVi };
  }

  const { captureDir } = await writeCapture(vaultRoot, bundle);
  await downloadImagesToAssets(bundle, captureDir);
  const notePath = path.join(captureDir, 'note.md');
  if (!options.noLlm && process.env.OPENAI_API_KEY?.trim()) {
    const raw = await fs.readFile(path.join(captureDir, 'source.md'), 'utf8');
    const excerpt = raw.replace(/^---[\s\S]*?---\s*/, '').slice(0, 12_000);
    await enrichNote({ notePath, sourceExcerpt: excerpt });
  }

  return captureDir;
}
