/**
 * migrate-vault-filenames.ts
 *
 * Renames legacy `source.md` / `note.md` to `{slug}.source.md` / `{slug}.note.md`
 * in every capture directory under `Captures/`.
 *
 * Usage:
 *   cd reader && pnpm migrate-vault-filenames [--vault <path>] [--dry-run]
 *
 * Options:
 *   --vault <path>   Path to vault root (default: VAULT_ROOT env or ./vault)
 *   --dry-run        Print what would be renamed without making changes
 */

import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';

function getSlugFromDir(dirName: string): string {
  const parts = dirName.split('--');
  if (parts.length >= 3) {
    return parts.slice(1, -1).join('--');
  }
  return dirName;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const vaultIdx = args.indexOf('--vault');
  const vaultRoot =
    vaultIdx !== -1 && args[vaultIdx + 1]
      ? path.resolve(args[vaultIdx + 1]!)
      : path.resolve(process.env.VAULT_ROOT?.trim() || 'vault');

  console.log(`Vault root: ${vaultRoot}`);
  if (dryRun) console.log('DRY RUN — no files will be renamed.\n');

  const capturesDir = path.join(vaultRoot, 'Captures');
  let names: string[];
  try {
    names = await fs.readdir(capturesDir);
  } catch {
    console.error(`Cannot read Captures dir: ${capturesDir}`);
    process.exit(1);
  }

  let renamed = 0;
  let skipped = 0;

  for (const dirName of names) {
    const captureDir = path.join(capturesDir, dirName);
    const stat = await fs.stat(captureDir).catch(() => null);
    if (!stat?.isDirectory()) continue;
    if (!dirName.includes('--')) continue;
    const slug = getSlugFromDir(dirName);

    const legacySource = path.join(captureDir, 'source.md');
    const legacyNote = path.join(captureDir, 'note.md');
    const newSource = path.join(captureDir, `${slug}.source.md`);
    const newNote = path.join(captureDir, `${slug}.note.md`);

    let hasLegacySource = false;
    let hasLegacyNote = false;
    try { await fs.access(legacySource); hasLegacySource = true; } catch { /* */ }
    try { await fs.access(legacyNote); hasLegacyNote = true; } catch { /* */ }

    if (!hasLegacySource && !hasLegacyNote) {
      skipped++;
      continue;
    }

    if (hasLegacySource) {
      console.log(`  ${dirName}/source.md  →  ${slug}.source.md`);
      if (!dryRun) await fs.rename(legacySource, newSource);
    }
    if (hasLegacyNote) {
      console.log(`  ${dirName}/note.md    →  ${slug}.note.md`);
      if (!dryRun) await fs.rename(legacyNote, newNote);
    }
    renamed++;
  }

  console.log(`\nDone. ${renamed} capture(s) renamed, ${skipped} already migrated or missing legacy files.`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
