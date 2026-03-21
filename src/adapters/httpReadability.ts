import { normaliseRawHtml } from '../normaliser.js';
import type { CaptureBundle } from '../types/capture.js';
import { formatFetchFailure } from '../util/fetchErrors.js';

/** Many sites block Node’s default UA; use a neutral browser-like string. */
export const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

export async function ingestHttpReadability(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<CaptureBundle> {
  let res: Response;
  try {
    res = await fetchImpl(url, {
      headers: {
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
        'User-Agent': BROWSER_UA,
      },
    });
  } catch (e) {
    throw new Error(
      `http_readability: ${formatFetchFailure(url, e)}`,
    );
  }
  if (!res.ok) throw new Error(`http_readability: HTTP ${res.status} for ${url}`);
  const html = await res.text();
  const pageUrl = res.url || url;
  return normaliseRawHtml(html, pageUrl, 'http_readability');
}
