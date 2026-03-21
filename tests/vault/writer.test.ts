import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { bundleFromParts } from '../../src/normaliser.js';
import { writeCapture } from '../../src/vault/writer.js';

let tmp: string | undefined;

afterEach(async () => {
  if (tmp) await fs.rm(tmp, { recursive: true, force: true });
  tmp = undefined;
});

describe('writeCapture', () => {
  it('creates source.md with required frontmatter under Captures/…', async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'vault-'));
    const bundle = bundleFromParts({
      canonicalUrl: 'https://example.com/post/hello',
      fetchMethod: 'http_readability',
      title: 'Hello World',
      textPlain: 'Body text',
      fetchedAt: '2026-03-20T15:00:00.000Z',
    });
    const { captureDir, relativeFolder } = await writeCapture(tmp, bundle, {
      ingestedAt: new Date('2026-03-20T15:00:00.000Z'),
    });
    expect(relativeFolder).toMatch(/^Captures\/2026-03-20--hello-world--[a-f0-9]{6}$/);
    const sourcePath = path.join(captureDir, 'source.md');
    const raw = await fs.readFile(sourcePath, 'utf8');
    expect(raw).toContain('type: "capture"');
    expect(raw).toContain('https://example.com/post/hello');
    expect(raw).toContain('ingested_at: "2026-03-20T15:00:00.000Z"');
    expect(raw).toContain('fetch_method: "http_readability"');
    expect(raw).toContain('publish: false');
    expect(raw).toContain('# Hello World');
    expect(raw).toContain('Body text');
  });

  it('writes youtube frontmatter and transcript section to source.md', async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'vault-yt-'));
    const bundle = bundleFromParts({
      canonicalUrl: 'https://www.youtube.com/watch?v=abcDEFghIj0',
      fetchMethod: 'apify',
      title: 'YT title',
      textPlain: 'Line',
      fetchedAt: '2026-03-20T15:00:00.000Z',
      source: 'youtube',
      youtubeVideoId: 'abcDEFghIj0',
      transcriptSegments: [{ startSec: 3, text: 'Line' }],
    });
    const { captureDir } = await writeCapture(tmp, bundle, {
      ingestedAt: new Date('2026-03-20T15:00:00.000Z'),
    });
    const raw = await fs.readFile(path.join(captureDir, 'source.md'), 'utf8');
    expect(raw).toContain('source: "youtube"');
    expect(raw).toContain('youtube_video_id: "abcDEFghIj0"');
    expect(raw).toContain('transcript_locale: "en"');
    expect(raw).toContain('fetch_method: "apify"');
    expect(raw).toContain('## Transcript (en)');
    expect(raw).toContain('**0:03** Line');
    const noteRaw = await fs.readFile(path.join(captureDir, 'note.md'), 'utf8');
    expect(noteRaw).toContain('source: "youtube"');
    expect(noteRaw).toContain('youtube_video_id: "abcDEFghIj0"');
  });

  it('writes Vietnamese transcript section when transcriptSegmentsVi set', async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'vault-yt-vi-'));
    const bundle = bundleFromParts({
      canonicalUrl: 'https://www.youtube.com/watch?v=abcDEFghIj0',
      fetchMethod: 'apify',
      title: 'YT',
      textPlain: 'en',
      fetchedAt: '2026-03-20T15:00:00.000Z',
      source: 'youtube',
      youtubeVideoId: 'abcDEFghIj0',
      transcriptSegments: [{ startSec: 5, text: 'Hello' }],
      transcriptSegmentsVi: [{ startSec: 5, text: 'Xin chào' }],
    });
    const { captureDir } = await writeCapture(tmp, bundle, {
      ingestedAt: new Date('2026-03-20T15:00:00.000Z'),
    });
    const raw = await fs.readFile(path.join(captureDir, 'source.md'), 'utf8');
    expect(raw).toContain('transcript_locale: "en,vi"');
    expect(raw).toContain('transcript_vi: true');
    expect(raw).toContain('## Transcript (vi)');
    expect(raw).toContain('**0:05** Xin chào');
  });
});
