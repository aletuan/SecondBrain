import { describe, expect, it } from 'vitest';
import {
  filterCaptures,
  isThreadsCapture,
  isXCapture,
  isYoutubeCapture,
  type SourceFilter,
} from '../../reader-web/src/captureFilters.js';
import type { CaptureListItem } from '../../reader-web/src/types.js';

function row(p: Partial<CaptureListItem> & Pick<CaptureListItem, 'id'>): CaptureListItem {
  return {
    id: p.id,
    title: p.title ?? 't',
    url: p.url ?? 'https://example.com',
    fetch_method: p.fetch_method ?? 'http',
    source: p.source ?? 'web',
    ingested_at: p.ingested_at ?? '2026-01-01',
    publish: p.publish ?? false,
    reaction_avg: p.reaction_avg ?? null,
    reaction_count: p.reaction_count ?? 0,
    youtube_video_id: p.youtube_video_id,
    categories: p.categories ?? [],
  };
}

describe('isYoutubeCapture / isXCapture / isThreadsCapture', () => {
  it('YouTube: video id or host', () => {
    expect(isYoutubeCapture(row({ id: 'a', youtube_video_id: 'x' }))).toBe(true);
    expect(isYoutubeCapture(row({ id: 'b', url: 'https://www.youtube.com/watch?v=1' }))).toBe(true);
    expect(isYoutubeCapture(row({ id: 'c', url: 'https://example.com' }))).toBe(false);
  });

  it('X: fetch_method or host', () => {
    expect(isXCapture(row({ id: 'a', fetch_method: 'x_api', url: 'https://example.com' }))).toBe(true);
    expect(isXCapture(row({ id: 'b', url: 'https://x.com/foo' }))).toBe(true);
    expect(isXCapture(row({ id: 'c', url: 'https://example.com' }))).toBe(false);
  });

  it('Threads: host', () => {
    expect(isThreadsCapture(row({ id: 'a', url: 'https://www.threads.net/@x' }))).toBe(true);
    expect(isThreadsCapture(row({ id: 'b', url: 'https://example.com' }))).toBe(false);
  });
});

describe('filterCaptures', () => {
  const a = row({
    id: '1',
    categories: ['ml', 'dev'],
    url: 'https://youtube.com/watch?v=1',
    youtube_video_id: 'v',
  });
  const b = row({ id: '2', categories: ['dev'], url: 'https://x.com/a', fetch_method: 'x_api' });
  const c = row({ id: '3', categories: [], url: 'https://threads.net/t' });
  const d = row({ id: '4', categories: ['ml'], url: 'https://blog.example.com/post' });
  const all = [a, b, c, d];

  it('returns all when no filters', () => {
    expect(filterCaptures(all, { categoryId: null, source: 'all' })).toEqual(all);
  });

  it('filters by category id (multi-label)', () => {
    const out = filterCaptures(all, { categoryId: 'ml', source: 'all' });
    expect(out.map((x) => x.id).sort()).toEqual(['1', '4']);
  });

  it('clears category when categoryId null', () => {
    expect(filterCaptures(all, { categoryId: null, source: 'all' }).length).toBe(4);
  });

  it('filters by source youtube', () => {
    const out = filterCaptures(all, { categoryId: null, source: 'youtube' as SourceFilter });
    expect(out.map((x) => x.id)).toEqual(['1']);
  });

  it('other excludes yt, x, threads', () => {
    const out = filterCaptures(all, { categoryId: null, source: 'other' });
    expect(out.map((x) => x.id)).toEqual(['4']);
  });

  it('AND category and source', () => {
    const out = filterCaptures(all, { categoryId: 'ml', source: 'youtube' });
    expect(out.map((x) => x.id)).toEqual(['1']);
  });
});
