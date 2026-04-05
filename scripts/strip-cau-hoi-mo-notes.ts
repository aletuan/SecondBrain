#!/usr/bin/env tsx
/**
 * Strip "## Câu hỏi mở" sections from all `*.note.md` under VAULT_ROOT/Captures.
 *
 * Usage: pnpm exec tsx scripts/strip-cau-hoi-mo-notes.ts
 * Env: VAULT_ROOT (default ./vault from cwd)
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { stripCauHoiMoSection } from '../src/vault/stripCauHoiMoSection.js';

loadEnv();

async function* walkNoteFiles(dir: string): AsyncGenerator<string> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walkNoteFiles(p);
    else if (e.isFile() && e.name.endsWith('.note.md')) yield p;
  }
}

async function main() {
  const root = path.resolve(process.env.VAULT_ROOT?.trim() || 'vault');
  const captures = path.join(root, 'Captures');
  let changed = 0;
  let scanned = 0;
  try {
    await fs.access(captures);
  } catch {
    console.error(`No Captures directory: ${captures}`);
    process.exitCode = 1;
    return;
  }
  for await (const file of walkNoteFiles(captures)) {
    scanned += 1;
    const raw = await fs.readFile(file, 'utf8');
    const { text, changed: did } = stripCauHoiMoSection(raw);
    if (did) {
      await fs.writeFile(file, text, 'utf8');
      changed += 1;
      console.log(file);
    }
  }
  console.log(`Scanned ${scanned} *.note.md, updated ${changed}.`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
