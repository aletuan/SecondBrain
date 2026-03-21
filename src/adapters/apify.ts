import { ApifyClient } from 'apify-client';
import { bundleFromParts } from '../normaliser.js';
import type { CaptureBundle } from '../types/capture.js';

export type ApifyActorCallResult = { defaultDatasetId: string };

/** Narrow surface for tests — real `ApifyClient` satisfies this at runtime. */
export type ApifyClientLike = {
  actor: (actorId: string) => {
    call: (
      input: Record<string, unknown>,
      options?: { build?: string },
    ) => Promise<ApifyActorCallResult>;
  };
  dataset: (datasetId: string) => {
    listItems: (opts?: { limit?: number }) => Promise<{ items: Record<string, unknown>[] }>;
  };
};

function defaultClient(token: string): ApifyClientLike {
  return new ApifyClient({ token }) as unknown as ApifyClientLike;
}

/**
 * Runs a website/content actor and maps the first dataset row to a bundle.
 * Expected fields (website-content-crawler style): `text`, `markdown`, optional `title`, `screenshotUrl`.
 */
export async function ingestApify(options: {
  url: string;
  actorId: string;
  token: string;
  build?: string;
  client?: ApifyClientLike;
}): Promise<CaptureBundle> {
  const client = options.client ?? defaultClient(options.token);
  const input: Record<string, unknown> = { startUrls: [{ url: options.url }] };
  const run = await client.actor(options.actorId).call(input, options.build ? { build: options.build } : undefined);
  const { items } = await client.dataset(run.defaultDatasetId).listItems({ limit: 10 });
  const row = items[0] ?? {};
  const text =
    (typeof row.text === 'string' && row.text) ||
    (typeof row.markdown === 'string' && row.markdown) ||
    '';
  const title =
    (typeof row.title === 'string' && row.title) || new URL(options.url).hostname;
  const images =
    typeof row.screenshotUrl === 'string'
      ? [{ url: row.screenshotUrl, alt: 'screenshot' as const }]
      : [];
  return bundleFromParts({
    canonicalUrl: new URL(options.url).href,
    title,
    textPlain: text,
    images,
    fetchMethod: 'apify',
  });
}
