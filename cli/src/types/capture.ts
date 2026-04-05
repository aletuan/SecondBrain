export type FetchMethod = 'http_readability' | 'apify' | 'x_api';

export type ImageRef = { url: string; alt: string };

export type CodeBlock = { language: string; code: string };

/** Optional timed lines from YouTube captions / Apify transcript arrays. */
export type TranscriptSegment = { startSec?: number; text: string };

export type CaptureSource = 'web' | 'youtube';

export type CaptureBundle = {
  canonicalUrl: string;
  title: string;
  textPlain: string;
  images: ImageRef[];
  codeBlocks: CodeBlock[];
  fetchedAt: string;
  fetchMethod: FetchMethod;
  /** Set for YouTube captures (vault frontmatter + layout). */
  source?: CaptureSource;
  youtubeVideoId?: string;
  transcriptSegments?: TranscriptSegment[];
  /** Same order/timestamps as `transcriptSegments`; LLM translation (e.g. vi). */
  transcriptSegmentsVi?: TranscriptSegment[];
};
