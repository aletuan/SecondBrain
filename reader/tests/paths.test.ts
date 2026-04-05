import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, afterEach } from 'vitest';
import { resolveBrainRepoRoot, resolveVaultRoot } from '../vault/paths.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const readerDir = path.join(repoRoot, 'reader');

describe('resolveVaultRoot', () => {
  afterEach(() => {
    delete process.env.READER_VAULT_ROOT;
    delete process.env.VAULT_ROOT;
    delete process.env.READER_BRAIN_ROOT;
  });

  it('resolves ./vault from brain root when cwd is reader/', () => {
    process.env.VAULT_ROOT = './vault';
    expect(resolveVaultRoot(readerDir)).toBe(path.join(repoRoot, 'vault'));
  });

  it('default vault is <brainRoot>/vault when env unset', () => {
    expect(resolveVaultRoot(readerDir)).toBe(path.join(repoRoot, 'vault'));
  });

  it('absolute VAULT_ROOT is unchanged', () => {
    const abs = path.join(repoRoot, 'vault');
    process.env.VAULT_ROOT = abs;
    expect(resolveVaultRoot(readerDir)).toBe(abs);
  });
});

describe('resolveBrainRepoRoot', () => {
  afterEach(() => {
    delete process.env.READER_BRAIN_ROOT;
  });

  it('defaults to parent of cwd', () => {
    expect(resolveBrainRepoRoot(readerDir)).toBe(repoRoot);
  });
});
