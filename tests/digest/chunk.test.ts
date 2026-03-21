import { describe, expect, it } from 'vitest';
import { chunkDigestItemsForLlm } from '../../src/digest.js';
import type { DigestItem } from '../../src/digest.js';

describe('chunkDigestItemsForLlm', () => {
  it('splits when over budget', () => {
    const items: DigestItem[] = [
      { wikilink: 'a', title: 'T1', excerpt: 'x'.repeat(100) },
      { wikilink: 'b', title: 'T2', excerpt: 'y'.repeat(100) },
      { wikilink: 'c', title: 'T3', excerpt: 'z'.repeat(100) },
    ];
    const chunks = chunkDigestItemsForLlm(items, 180);
    expect(chunks.length).toBeGreaterThan(1);
    const flat = chunks.flat();
    expect(flat).toEqual(items);
  });
});
