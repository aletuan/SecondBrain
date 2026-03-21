import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { enrichNote } from '../../src/llm/enrich.js';

let tmp: string | undefined;

afterEach(async () => {
  if (tmp) await fs.rm(tmp, { recursive: true, force: true });
  tmp = undefined;
});

describe('enrichNote', () => {
  it('appends Vietnamese LLM sections from a mocked completion', async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'note-'));
    const notePath = path.join(tmp, 'note.md');
    await fs.writeFile(notePath, '# Hi\n\n', 'utf8');

    const client = {
      chat: {
        completions: {
          create: async () => ({
            choices: [
              {
                message: {
                  content:
                    '## Tóm tắt\nNguồn nói về X.\n\n## Insight (LLM) — suy luận\nCó thể liên quan Y (suy luận).\n\n## Câu hỏi mở\n- Câu 1?\n- Câu 2?',
                },
              },
            ],
          }),
        },
      },
    };

    await enrichNote({
      notePath,
      sourceExcerpt: 'Raw excerpt',
      apiKey: 'sk-test',
      model: 'gpt-4o-mini',
      client,
    });

    const out = await fs.readFile(notePath, 'utf8');
    expect(out).toContain('## Tóm tắt');
    expect(out).toContain('## Insight (LLM)');
    expect(out).toContain('## Câu hỏi mở');
    expect(out).toContain('Câu 1?');
  });
});
