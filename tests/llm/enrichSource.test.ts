import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ENRICH_MAX_CHARS,
  enrichMaxCharsFromEnv,
  truncateSourceForEnrich,
} from '../../cli/src/llm/enrichSource.js';

describe('truncateSourceForEnrich', () => {
  it('returns body unchanged when under limit', () => {
    const s = 'short';
    expect(truncateSourceForEnrich(s, 100)).toBe(s);
  });

  it('includes head, separator note, and tail when over limit', () => {
    const head = 'HEAD_MARK_START' + 'a'.repeat(400);
    const mid = 'm'.repeat(25_000);
    const tail = 'z'.repeat(400) + 'TAIL_MARK_END';
    const body = head + mid + tail;
    const out = truncateSourceForEnrich(body, 3000);
    expect(out.length).toBeLessThanOrEqual(3000);
    expect(out).toContain('HEAD_MARK_START');
    expect(out).toContain('TAIL_MARK_END');
    expect(out).toContain('lược bỏ');
    expect(body.length).toBeGreaterThan(3000);
  });

  it('default max matches constant', () => {
    expect(DEFAULT_ENRICH_MAX_CHARS).toBe(12_000);
  });
});

describe('enrichMaxCharsFromEnv', () => {
  it('returns default when env unset', () => {
    const prev = process.env.ENRICH_MAX_CHARS;
    delete process.env.ENRICH_MAX_CHARS;
    expect(enrichMaxCharsFromEnv()).toBe(12_000);
    if (prev !== undefined) process.env.ENRICH_MAX_CHARS = prev;
  });
});
