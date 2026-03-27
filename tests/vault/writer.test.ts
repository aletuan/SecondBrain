import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { bundleFromParts } from '../../src/normaliser.js';
import { addTagsToNoteFrontmatter, getCaptureFiles, getSlugFromDir, writeCapture } from '../../src/vault/writer.js';

let tmp: string | undefined;

afterEach(async () => {
  if (tmp) await fs.rm(tmp, { recursive: true, force: true });
  tmp = undefined;
});

describe('getSlugFromDir', () => {
  it('extracts middle part from 3-segment dir name', () => {
    expect(getSlugFromDir('2026-03-21--how-i-code--8dc9f7')).toBe('how-i-code');
  });

  it('handles multiple slug segments', () => {
    expect(getSlugFromDir('2026-03-21--foo--bar--8dc9f7')).toBe('foo--bar');
  });

  it('returns dirName unchanged when fewer than 3 segments', () => {
    expect(getSlugFromDir('just-a-dir')).toBe('just-a-dir');
  });
});

describe('getCaptureFiles', () => {
  it('finds slug-named files when present', async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'getfiles-'));
    await fs.writeFile(path.join(tmp, 'my-slug.source.md'), '', 'utf8');
    await fs.writeFile(path.join(tmp, 'my-slug.note.md'), '', 'utf8');
    const { sourcePath, notePath } = await getCaptureFiles(tmp);
    expect(sourcePath).toContain('my-slug.source.md');
    expect(notePath).toContain('my-slug.note.md');
  });

  it('falls back to legacy source.md / note.md when slug files absent', async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'getfiles-legacy-'));
    const { sourcePath, notePath } = await getCaptureFiles(tmp);
    expect(path.basename(sourcePath)).toBe('source.md');
    expect(path.basename(notePath)).toBe('note.md');
  });

  it('resolves note and source independently', async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'getfiles-mixed-'));
    await fs.writeFile(path.join(tmp, 'my-slug.note.md'), '', 'utf8');
    const { sourcePath, notePath } = await getCaptureFiles(tmp);
    expect(path.basename(notePath)).toBe('my-slug.note.md');
    expect(path.basename(sourcePath)).toBe('source.md');
  });
});

describe('addTagsToNoteFrontmatter', () => {
  it('inserts tags into frontmatter', async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'tags-'));
    const notePath = path.join(tmp, 'note.md');
    await fs.writeFile(notePath, '---\ntype: "capture"\npublish: false\n---\n# Title\n', 'utf8');
    await addTagsToNoteFrontmatter(notePath, ['ai', 'machine-learning']);
    const content = await fs.readFile(notePath, 'utf8');
    expect(content).toContain('tags: ["ai", "machine-learning"]');
    expect(content).toContain('type: "capture"');
  });

  it('is a no-op when tags array is empty', async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'tags-empty-'));
    const notePath = path.join(tmp, 'note.md');
    const original = '---\ntype: "capture"\n---\n# Title\n';
    await fs.writeFile(notePath, original, 'utf8');
    await addTagsToNoteFrontmatter(notePath, []);
    const content = await fs.readFile(notePath, 'utf8');
    expect(content).toBe(original);
  });
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
    const { sourcePath } = await getCaptureFiles(captureDir);
    expect(sourcePath).toContain('hello-world.source.md');
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
    const { sourcePath: sp1, notePath: np1 } = await getCaptureFiles(captureDir);
    const raw = await fs.readFile(sp1, 'utf8');
    expect(raw).toContain('source: "youtube"');
    expect(raw).toContain('youtube_video_id: "abcDEFghIj0"');
    expect(raw).toContain('transcript_locale: "en"');
    expect(raw).toContain('fetch_method: "apify"');
    expect(raw).toContain('## Transcript (en)');
    expect(raw).toContain('**0:03** Line');
    const noteRaw = await fs.readFile(np1, 'utf8');
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
    const { sourcePath: sp2 } = await getCaptureFiles(captureDir);
    const raw = await fs.readFile(sp2, 'utf8');
    expect(raw).toContain('transcript_locale: "en,vi"');
    expect(raw).toContain('transcript_vi: true');
    expect(raw).toContain('## Transcript (vi)');
    expect(raw).toContain('**0:05** Xin chào');
  });
});
