import { parse } from 'dotenv';
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Read Brain repo `.env` without mutating `process.env`.
 * Used so Vite-driven ingest/digest children get the same keys as `pnpm ingest` from repo root.
 */
export async function readBrainDotenv(brainRoot: string): Promise<Record<string, string>> {
  const envPath = path.join(brainRoot, '.env');
  try {
    const raw = await fs.readFile(envPath, 'utf8');
    return parse(raw);
  } catch {
    return {};
  }
}

/** Env for spawned Brain CLI: shell + Brain `.env` (overrides shell for same keys) + `VAULT_ROOT`. */
export async function envForBrainChild(
  brainRoot: string,
  vaultRoot: string,
  base: NodeJS.ProcessEnv = process.env,
): Promise<NodeJS.ProcessEnv> {
  const fromFile = await readBrainDotenv(brainRoot);
  return {
    ...base,
    ...fromFile,
    VAULT_ROOT: vaultRoot,
  };
}
