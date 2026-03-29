import { describe, expect, it } from 'vitest';
import { parseListField } from '../../reader-web/vault/parseListField.js';

describe('parseListField', () => {
  it('returns empty for undefined, boolean, empty string', () => {
    expect(parseListField(undefined)).toEqual([]);
    expect(parseListField(false)).toEqual([]);
    expect(parseListField(true)).toEqual([]);
    expect(parseListField('')).toEqual([]);
  });

  it('parses JSON array string', () => {
    expect(parseListField('["a","b"]')).toEqual(['a', 'b']);
  });

  it('parses bracket list with quotes', () => {
    expect(parseListField('["machine-learning", "data"]')).toEqual(['machine-learning', 'data']);
  });

  it('parses comma-separated', () => {
    expect(parseListField('a, b, c')).toEqual(['a', 'b', 'c']);
  });
});
