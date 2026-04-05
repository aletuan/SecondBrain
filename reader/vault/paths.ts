import path from 'node:path';

/** Resolve vault root: READER_VAULT_ROOT, VAULT_ROOT, or ../vault from reader cwd. */
export function resolveVaultRoot(cwd: string = process.cwd()): string {
  const fromEnv = process.env.READER_VAULT_ROOT?.trim() || process.env.VAULT_ROOT?.trim();
  if (fromEnv) return path.isAbsolute(fromEnv) ? fromEnv : path.resolve(cwd, fromEnv);
  return path.resolve(cwd, '..', 'vault');
}

/** Repo root that contains `cli/src/cli.ts` (Brain CLI). Default: parent of reader/. */
export function resolveBrainRepoRoot(cwd: string = process.cwd()): string {
  const fromEnv = process.env.READER_BRAIN_ROOT?.trim();
  if (fromEnv) return path.isAbsolute(fromEnv) ? fromEnv : path.resolve(cwd, fromEnv);
  return path.resolve(cwd, '..');
}
