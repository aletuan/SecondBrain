import type { CaptureListItem } from './types.js';

function parseCaptureHostname(url: string): string {
  try {
    return new URL(url.trim()).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return '';
  }
}

export function isYoutubeCapture(r: CaptureListItem): boolean {
  if (r.youtube_video_id) return true;
  const h = parseCaptureHostname(r.url);
  return h.includes('youtube.com') || h === 'youtu.be';
}

export function isXCapture(r: CaptureListItem): boolean {
  if (r.fetch_method === 'x_api') return true;
  const h = parseCaptureHostname(r.url);
  return h === 'x.com' || h === 'twitter.com' || h.endsWith('.twitter.com');
}

export function isThreadsCapture(r: CaptureListItem): boolean {
  return parseCaptureHostname(r.url).includes('threads.net');
}

export type SourceFilter = 'all' | 'youtube' | 'x' | 'threads' | 'other';

export type CaptureListFilters = {
  categoryId: string | null;
  source: SourceFilter;
};

/** Client-side AND filter: category (multi-label contains id) + source bucket. */
export function filterCaptures(rows: CaptureListItem[], state: CaptureListFilters): CaptureListItem[] {
  return rows.filter((r) => {
    if (state.categoryId !== null && state.categoryId !== '') {
      const cats = r.categories ?? [];
      if (!cats.includes(state.categoryId)) return false;
    }
    if (state.source === 'all') return true;
    const yt = isYoutubeCapture(r);
    const x = isXCapture(r);
    const th = isThreadsCapture(r);
    if (state.source === 'youtube') return yt;
    if (state.source === 'x') return x;
    if (state.source === 'threads') return th;
    if (state.source === 'other') return !yt && !x && !th;
    return true;
  });
}
