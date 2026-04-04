import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('digest/challenge CLI removal', () => {
  it('package.json has no digest or challenge scripts', () => {
    const pkgPath = path.join(import.meta.dirname, '../package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { scripts?: Record<string, string> };
    expect(pkg.scripts?.digest).toBeUndefined();
    expect(pkg.scripts?.challenge).toBeUndefined();
  });

  it('cli.ts does not register digest or challenge commands', () => {
    const cliPath = path.join(import.meta.dirname, '../src/cli.ts');
    const src = readFileSync(cliPath, 'utf8');
    expect(src).not.toMatch(/\.command\(\s*['`]digest['`]/);
    expect(src).not.toMatch(/\.command\(\s*['`]challenge['`]/);
  });

  it('cli.ts does not import digest or challenge modules', () => {
    const cliPath = path.join(import.meta.dirname, '../src/cli.ts');
    const src = readFileSync(cliPath, 'utf8');
    expect(src).not.toContain("from './digest.js'");
    expect(src).not.toContain("from './challenge/fromDigest.js'");
  });
});
