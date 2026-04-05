import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import type { CaptureBundle, FetchMethod } from './types/capture.js';

export function bundleFromParts(
  parts: Partial<Omit<CaptureBundle, 'canonicalUrl' | 'fetchMethod'>> &
    Pick<CaptureBundle, 'canonicalUrl' | 'fetchMethod'>,
): CaptureBundle {
  return {
    canonicalUrl: parts.canonicalUrl,
    title: parts.title ?? '',
    textPlain: parts.textPlain ?? '',
    images: parts.images ?? [],
    codeBlocks: parts.codeBlocks ?? [],
    fetchedAt: parts.fetchedAt ?? new Date().toISOString(),
    fetchMethod: parts.fetchMethod,
    source: parts.source,
    youtubeVideoId: parts.youtubeVideoId,
    transcriptSegments: parts.transcriptSegments,
    transcriptSegmentsVi: parts.transcriptSegmentsVi,
  };
}

function collectImagesAndCode(root: ParentNode, baseUrl: string): {
  images: CaptureBundle['images'];
  codeBlocks: CaptureBundle['codeBlocks'];
} {
  const images: CaptureBundle['images'] = [];
  for (const img of root.querySelectorAll('img')) {
    const src = img.getAttribute('src');
    if (!src) continue;
    try {
      images.push({
        url: new URL(src, baseUrl).href,
        alt: img.getAttribute('alt') ?? '',
      });
    } catch {
      /* ignore bad URLs */
    }
  }
  const codeBlocks: CaptureBundle['codeBlocks'] = [];
  for (const pre of root.querySelectorAll('pre')) {
    const codeEl = pre.querySelector('code');
    const langMatch = codeEl?.className.match(/language-([\w+-]+)/);
    const language = langMatch?.[1] ?? 'text';
    const code = (codeEl?.textContent ?? pre.textContent ?? '').trim();
    if (code) codeBlocks.push({ language, code });
  }
  return { images, codeBlocks };
}

/** Parse article HTML from Readability and return a normalised bundle. */
export function normaliseRawHtml(
  html: string,
  pageUrl: string,
  fetchMethod: FetchMethod,
  fetchedAt: Date = new Date(),
): CaptureBundle {
  const dom = new JSDOM(html, { url: pageUrl });
  const doc = dom.window.document;
  const reader = new Readability(doc.cloneNode(true) as Document);
  const article = reader.parse();
  const canonicalUrl = new URL(pageUrl).href;
  const title = (article?.title ?? doc.title ?? canonicalUrl).trim();
  const contentHtml = article?.content ?? '';
  const contentDom = new JSDOM(contentHtml || html, { url: pageUrl }).window.document;
  const body = contentDom.body;
  const textPlain = (body.textContent ?? '').replace(/\s+/g, ' ').trim();
  const { images, codeBlocks } = collectImagesAndCode(body, canonicalUrl);
  return {
    canonicalUrl,
    title,
    textPlain,
    images,
    codeBlocks,
    fetchedAt: fetchedAt.toISOString(),
    fetchMethod,
  };
}
