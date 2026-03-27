import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { generateDigest, stripLlmTongQuanHeadingPrefix } from '../src/digest.js';

let tmp: string | undefined;

afterEach(async () => {
  if (tmp) await fs.rm(tmp, { recursive: true, force: true });
  tmp = undefined;
});

describe('stripLlmTongQuanHeadingPrefix', () => {
  it('removes one leading ## Tổng quan', () => {
    expect(stripLlmTongQuanHeadingPrefix('## Tổng quan\n\n- a\n')).toBe('- a');
  });

  it('removes repeated headings', () => {
    expect(
      stripLlmTongQuanHeadingPrefix('## Tổng quan\n\n## Tổng quan\n\nNội dung'),
    ).toBe('Nội dung');
  });

  it('is case-insensitive on heading', () => {
    expect(stripLlmTongQuanHeadingPrefix('## tổng quan\r\n\r\nx')).toBe('x');
  });
});

describe('generateDigest', () => {
  it('writes Digests/YYYY-Www.md with a wikilink to a recent capture', async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'digest-'));
    const cap = path.join(tmp, 'Captures', '2026-03-14--demo--a1b2c3');
    await fs.mkdir(cap, { recursive: true });
    await fs.writeFile(
      path.join(cap, 'demo.note.md'),
      `---
type: "capture"
url: "https://example.com/a"
ingested_at: "2026-03-14T12:00:00.000Z"
publish: false
---
# Demo Note

Hello digest.
`,
      'utf8',
    );

    const now = new Date('2026-03-15T12:00:00.000Z');
    const { digestPath, weekId } = await generateDigest({
      vaultRoot: tmp,
      since: '7d',
      now,
      skipLlm: true,
    });

    expect(weekId).toBe('2026-W11');
    expect(digestPath).toContain(`Digests${path.sep}2026-W11.md`);
    const body = await fs.readFile(digestPath, 'utf8');
    expect(body).toContain('[[Captures/2026-03-14--demo--a1b2c3/demo.note|Demo Note]]');
  });
});
