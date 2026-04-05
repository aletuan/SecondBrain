#!/usr/bin/env tsx
/**
 * Strip "## Câu hỏi mở" sections from all `*.note.md` under VAULT_ROOT/Captures.
 *
 * Usage: pnpm strip-cau-hoi-mo
 * Env: VAULT_ROOT (default ./vault from cwd)
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { config as loadEnv } from 'dotenv';

loadEnv();

/**
 * Removes the "## Câu hỏi mở" / "### Câu hỏi mở" block from capture note markdown (ingest enrich legacy).
 * Stops at the next line that starts with "## " (another H2). Optional "---" + blanks immediately before the heading are removed with the block.
 */
function stripCauHoiMoSection(md: string): { text: string; changed: boolean } {
  const lines = md.split(/\r?\n/);
  const idx = lines.findIndex((line) => {
    const t = line.trimStart();
    return t.startsWith('## Câu hỏi mở') || t.startsWith('### Câu hỏi mở');
  });
  if (idx === -1) return { text: md, changed: false };

  let start = idx;
  if (start > 0 && lines[start - 1] === '') start -= 1;
  if (start > 0 && lines[start - 1] === '---') {
    start -= 1;
    while (start > 0 && lines[start - 1] === '') start -= 1;
  }

  let end = idx + 1;
  while (end < lines.length) {
    const L = lines[end];
    const t = L?.trimStart() ?? '';
    if (/^## [^#]/.test(t) && !t.startsWith('## Câu hỏi mở')) break;
    end += 1;
  }

  const out = [...lines.slice(0, start), ...lines.slice(end)];
  let text = out.join('\n');
  text = text.replace(/\n{3,}/g, '\n\n');
  if (!text.endsWith('\n')) text += '\n';
  return { text, changed: text !== md };
}

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
