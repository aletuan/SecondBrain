import path from 'node:path';

/**
 * Resolve vault root: READER_VAULT_ROOT, VAULT_ROOT, or `<repo>/vault`.
 * Relative env values (e.g. `./vault` from shared repo `.env`) are resolved against the
 * brain repo root — not `process.cwd()` — so `pnpm dev` from `reader/` does not become `reader/vault`.
 */
export function resolveVaultRoot(cwd: string = process.cwd()): string {
  const fromEnv = process.env.READER_VAULT_ROOT?.trim() || process.env.VAULT_ROOT?.trim();
  const brainRoot = resolveBrainRepoRoot(cwd);
  if (fromEnv) {
    return path.isAbsolute(fromEnv) ? fromEnv : path.resolve(brainRoot, fromEnv);
  }
  return path.resolve(brainRoot, 'vault');
}

/** Brain monorepo root (for `READER_BRAIN_ROOT` / `.env` on disk). Default: parent of `reader/`. */
export function resolveBrainRepoRoot(cwd: string = process.cwd()): string {
  const fromEnv = process.env.READER_BRAIN_ROOT?.trim();
  if (fromEnv) return path.isAbsolute(fromEnv) ? fromEnv : path.resolve(cwd, fromEnv);
  return path.resolve(cwd, '..');
}
