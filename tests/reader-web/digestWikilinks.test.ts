import { describe, expect, it } from 'vitest';
import { transformDigestCapturesWikilinks } from '../../reader-web/src/digestWikilinks.js';

describe('transformDigestCapturesWikilinks', () => {
  it('turns digest CLI wikilink (folder/slug.note|title) into markdown link', () => {
    const md = `- [[Captures/2026-03-14--demo--a1b2c3/demo.note|Demo Note]]`;
    expect(transformDigestCapturesWikilinks(md)).toBe(
      `- [Demo Note](#/capture/${encodeURIComponent('2026-03-14--demo--a1b2c3')})`,
    );
  });

  it('supports legacy [[Captures/id/note|title]]', () => {
    const md = `[[Captures/2026-01-01--x--abc/note|Legacy Title]]`;
    expect(transformDigestCapturesWikilinks(md)).toBe(
      `[Legacy Title](#/capture/${encodeURIComponent('2026-01-01--x--abc')})`,
    );
  });

  it('supports legacy [[Captures/id/note]] without alias', () => {
    const md = `[[Captures/2026-01-01--x--abc/note]]`;
    expect(transformDigestCapturesWikilinks(md)).toBe(
      `[2026-01-01--x--abc](#/capture/${encodeURIComponent('2026-01-01--x--abc')})`,
    );
  });

  it('handles slug.note without alias', () => {
    const md = `[[Captures/2026-03-14--demo--a1b2c3/demo.note]]`;
    expect(transformDigestCapturesWikilinks(md)).toBe(
      `[2026-03-14--demo--a1b2c3](#/capture/${encodeURIComponent('2026-03-14--demo--a1b2c3')})`,
    );
  });
});
