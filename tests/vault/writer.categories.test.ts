import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { setCategoriesInNoteFrontmatter } from '../../cli/src/vault/writer.js';

let tmp: string | undefined;

afterEach(async () => {
  if (tmp) await fs.rm(tmp, { recursive: true, force: true });
  tmp = undefined;
});

const sampleNote = `---
type: capture
url: https://example.com/a
ingested_at: 2026-01-01T00:00:00.000Z
fetch_method: http_readability
publish: false
---

# Hello

More.
`;

describe('setCategoriesInNoteFrontmatter', () => {
  it('inserts categories line with JSON array', async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'cat-fm-'));
    const notePath = path.join(tmp, 'x.note.md');
    await fs.writeFile(notePath, sampleNote, 'utf8');
    await setCategoriesInNoteFrontmatter(notePath, ['machine-learning', 'data-engineering']);
    const out = await fs.readFile(notePath, 'utf8');
    const fm = /^---\r?\n([\s\S]*?)\r?\n---/m.exec(out);
    expect(fm).toBeTruthy();
    expect(fm![1]).toContain('categories: ["machine-learning", "data-engineering"]');
    expect((fm![1].match(/^categories:/gm) ?? []).length).toBe(1);
  });

  it('replaces existing categories line', async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'cat-fm2-'));
    const notePath = path.join(tmp, 'x.note.md');
    await fs.writeFile(
      notePath,
      sampleNote.replace(
        'publish: false\n',
        'publish: false\ncategories: ["old"]\n',
      ),
      'utf8',
    );
    await setCategoriesInNoteFrontmatter(notePath, ['management']);
    const out = await fs.readFile(notePath, 'utf8');
    const fm = /^---\r?\n([\s\S]*?)\r?\n---/m.exec(out);
    expect(fm![1]).toContain('categories: ["management"]');
    expect(fm![1]).not.toContain('old');
    expect((fm![1].match(/^categories:/gm) ?? []).length).toBe(1);
  });

  it('removes categories key when ids empty', async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'cat-fm3-'));
    const notePath = path.join(tmp, 'x.note.md');
    await fs.writeFile(
      notePath,
      sampleNote.replace(
        'publish: false\n',
        'publish: false\ncategories: ["x"]\n',
      ),
      'utf8',
    );
    await setCategoriesInNoteFrontmatter(notePath, []);
    const out = await fs.readFile(notePath, 'utf8');
    expect(out).not.toMatch(/^categories:/m);
  });
});
