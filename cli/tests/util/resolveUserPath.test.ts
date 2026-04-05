import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveUserPath } from '../../src/util/resolveUserPath.js';

describe('resolveUserPath', () => {
  it('returns absolute paths unchanged', () => {
    expect(resolveUserPath('/tmp', '/var/x')).toBe('/var/x');
  });

  it('resolves relative paths against cwd', () => {
    const cwd = '/project/root';
    expect(resolveUserPath(cwd, 'captures/foo')).toBe(path.resolve(cwd, 'captures/foo'));
  });
});
