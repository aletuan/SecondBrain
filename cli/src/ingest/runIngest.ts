import fs from 'node:fs/promises';
import path from 'node:path';
import OpenAI from 'openai';
import { ingestApify } from '../adapters/apify.js';
import { ingestHttpReadability } from '../adapters/httpReadability.js';
import { fetchXThread } from '../adapters/xApi.js';
import { extractYoutubeVideoId, ingestYouTubeViaApify } from '../adapters/youtube.js';
import { getAllowedCategoryIdsSorted, loadCategoriesFromRepo } from '../config/categories.js';
import type { ApifyRouteConfig } from '../config/loadRouting.js';
import { readRoutingYamlSync } from '../config/routingFile.js';
import type { OpenAIClientLike } from '../llm/enrich.js';
import { enrichNote, extractTags, resolveEnrichModel } from '../llm/enrich.js';
import { extractCategories } from '../llm/extractCategories.js';
import { enrichMaxCharsFromEnv, truncateSourceForEnrich } from '../llm/enrichSource.js';
import { translateTranscriptSegments } from '../llm/translateTranscript.js';
import { loadRouting, resolveStrategy } from '../router.js';
import type { CaptureBundle, FetchMethod } from '../types/capture.js';
import {
  addTagsToNoteFrontmatter,
  assertCaptureDirUnderVault,
  downloadImagesToAssets,
  getCaptureFiles,
  overwriteCaptureAtDir,
  setCategoriesInNoteFrontmatter,
  writeCapture,
} from '../vault/writer.js';
import type { IngestPhaseProgressEvent } from './ingestProgress.js';

async function fetchCaptureBundle(
  url: string,
  strategy: FetchMethod,
  apify: ApifyRouteConfig | undefined,
): Promise<CaptureBundle> {
  switch (strategy) {
    case 'http_readability':
      return ingestHttpReadability(url);
    case 'apify': {
      const token = process.env.APIFY_TOKEN?.trim();
      if (!token) throw new Error('APIFY_TOKEN is required for Apify routes');
      const isYoutube =
        extractYoutubeVideoId(url) !== null ||
        /youtube\.com|youtu\.be/i.test(new URL(url).hostname);
      if (isYoutube) {
        return ingestYouTubeViaApify({
          url,
          actorId: apify!.actorId,
          token,
          build: apify!.build,
          youtubeInput: apify!.youtubeInput,
        });
      }
      return ingestApify({
        url,
        actorId: apify!.actorId,
        token,
        build: apify!.build,
      });
    }
    case 'x_api':
      return fetchXThread(url);
  }
}

export async function runIngest(options: {
  url: string;
  cwd?: string;
  /** If set, overwrite this existing capture folder instead of creating a new one. */
  captureDir?: string;
  /** Emitted at real pipeline boundaries (Reader SSE / `--progress-json`). */
  onProgress?: (ev: IngestPhaseProgressEvent) => void;
}): Promise<string> {
  const report = options.onProgress;
  const phase = (ev: IngestPhaseProgressEvent) => {
    report?.(ev);
  };

  const cwd = options.cwd ?? process.cwd();
  const vaultRoot = path.resolve(cwd, process.env.VAULT_ROOT?.trim() || 'vault');
  const cfg = loadRouting(readRoutingYamlSync(cwd));
  const { strategy, apify } = resolveStrategy(cfg, options.url);

  phase({ v: 1, kind: 'phase', phase: 'fetch', state: 'active' });
  let bundle = await fetchCaptureBundle(options.url, strategy, apify);
  phase({ v: 1, kind: 'phase', phase: 'fetch', state: 'done' });

  const doTranslate =
    bundle.source === 'youtube' &&
    Boolean(bundle.transcriptSegments?.length) &&
    Boolean(process.env.OPENAI_API_KEY?.trim());

  if (doTranslate) {
    phase({ v: 1, kind: 'phase', phase: 'translate', state: 'active' });
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
    phase({ v: 1, kind: 'phase', phase: 'translate', state: 'done' });
  }

  phase({ v: 1, kind: 'phase', phase: 'vault', state: 'active' });
  let captureDir: string;
  if (options.captureDir) {
    const abs = assertCaptureDirUnderVault(vaultRoot, options.captureDir);
    await overwriteCaptureAtDir(abs, bundle, { ingestedAt: new Date() });
    captureDir = abs;
  } else {
    const { captureDir: d } = await writeCapture(vaultRoot, bundle);
    captureDir = d;
  }
  await downloadImagesToAssets(bundle, captureDir);
  phase({ v: 1, kind: 'phase', phase: 'vault', state: 'done' });
  const { notePath, sourcePath } = await getCaptureFiles(captureDir);
  const willEnrich = Boolean(process.env.OPENAI_API_KEY?.trim());
  if (willEnrich) {
    phase({ v: 1, kind: 'phase', phase: 'llm', state: 'active' });
    const key = process.env.OPENAI_API_KEY!.trim();
    const enrichClient = new OpenAI({ apiKey: key }) as unknown as OpenAIClientLike;
    const raw = await fs.readFile(sourcePath, 'utf8');
    const body = raw.replace(/^---[\s\S]*?---\s*/, '');
    const excerpt = truncateSourceForEnrich(body, enrichMaxCharsFromEnv());
    const enrichModel = resolveEnrichModel();
    const categoryAllowedIds = getAllowedCategoryIdsSorted(loadCategoriesFromRepo(cwd));
    const [, tags, categories] = await Promise.all([
      enrichNote({
        notePath,
        sourceExcerpt: excerpt,
        title: bundle.title,
        url: bundle.canonicalUrl,
        fetchMethod: bundle.fetchMethod,
        client: enrichClient,
      }),
      extractTags(excerpt, enrichClient, enrichModel),
      extractCategories(excerpt, enrichClient, enrichModel, categoryAllowedIds),
    ]);
    await addTagsToNoteFrontmatter(notePath, tags);
    await setCategoriesInNoteFrontmatter(notePath, categories);
    phase({ v: 1, kind: 'phase', phase: 'llm', state: 'done' });
  }

  return captureDir;
}
