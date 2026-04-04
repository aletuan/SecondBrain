import { describe, expect, it } from 'vitest';
import { normalizeLegacyReaderHash } from '../../reader-web/src/hashRoute.js';

describe('normalizeLegacyReaderHash', () => {
  it('maps #/digests to #/captures', () => {
    expect(normalizeLegacyReaderHash('#/digests')).toBe('#/captures');
  });

  it('maps #/digest/:week to #/captures', () => {
    expect(normalizeLegacyReaderHash('#/digest/2026-W12')).toBe('#/captures');
    expect(normalizeLegacyReaderHash('#/digest/2026-W01')).toBe('#/captures');
  });

  it('returns null for non-legacy routes', () => {
    expect(normalizeLegacyReaderHash('#/captures')).toBeNull();
    expect(normalizeLegacyReaderHash('#/capture/foo')).toBeNull();
    expect(normalizeLegacyReaderHash('#/')).toBeNull();
    expect(normalizeLegacyReaderHash('')).toBeNull();
  });
});
