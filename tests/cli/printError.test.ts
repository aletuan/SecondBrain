import { describe, expect, it } from 'vitest';
import { describeErrorChain } from '../../cli/src/cli/printError.js';

describe('describeErrorChain', () => {
  it('returns null for non-Error values', () => {
    expect(describeErrorChain('oops')).toBeNull();
    expect(describeErrorChain(null)).toBeNull();
    expect(describeErrorChain({ message: 'x' })).toBeNull();
  });

  it('returns primary message for Error without cause', () => {
    expect(describeErrorChain(new Error('root'))).toEqual(['root']);
  });

  it('walks Error.cause up to maxDepth', () => {
    const inner = new Error('inner');
    const mid = new Error('mid');
    (mid as Error & { cause?: unknown }).cause = inner;
    const root = new Error('root');
    (root as Error & { cause?: unknown }).cause = mid;
    expect(describeErrorChain(root, 6)).toEqual(['root', '  Caused by: mid', '  Caused by: inner']);
  });

  it('stops at maxDepth', () => {
    let e: Error = new Error('d0');
    for (let i = 1; i <= 8; i += 1) {
      const next = new Error(`d${i}`);
      (next as Error & { cause?: unknown }).cause = e;
      e = next;
    }
    const lines = describeErrorChain(e, 2);
    expect(lines).toHaveLength(3);
    expect(lines?.[0]).toBe('d8');
    expect(lines?.[1]).toBe('  Caused by: d7');
    expect(lines?.[2]).toBe('  Caused by: d6');
  });
});
