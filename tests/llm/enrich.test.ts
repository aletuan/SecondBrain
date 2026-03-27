import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildEnrichUserMessage,
  buildEnrichmentSections,
  ENRICH_SYSTEM_PROMPT,
  enrichNote,
  extractTags,
  resolveEnrichModel,
  resolveEnrichTemperature,
  TAG_SYSTEM_PROMPT,
} from '../../src/llm/enrich.js';

let tmp: string | undefined;

afterEach(async () => {
  if (tmp) await fs.rm(tmp, { recursive: true, force: true });
  tmp = undefined;
});

describe('ENRICH_SYSTEM_PROMPT', () => {
  it('asks for structured summary, insights, and concrete open questions', () => {
    expect(ENRICH_SYSTEM_PROMPT).toContain('## Tóm tắt');
    expect(ENRICH_SYSTEM_PROMPT).toContain('Ý chính');
    expect(ENRICH_SYSTEM_PROMPT).toContain('tối đa 7');
    expect(ENRICH_SYSTEM_PROMPT).toContain('ngoặc kép');
    expect(ENRICH_SYSTEM_PROMPT).toContain('## Insight (LLM)');
    expect(ENRICH_SYSTEM_PROMPT).toMatch(/tối đa 4/i);
    expect(ENRICH_SYSTEM_PROMPT).toContain('## Câu hỏi mở');
    expect(ENRICH_SYSTEM_PROMPT).toMatch(/tối đa 8/i);
  });
});

describe('buildEnrichUserMessage', () => {
  it('prefixes title and url when provided', () => {
    const u = buildEnrichUserMessage('BODY', {
      title: 'My Article',
      url: 'https://example.com/a',
    });
    expect(u).toContain('Tiêu đề: My Article');
    expect(u).toContain('URL: https://example.com/a');
    expect(u).toContain('BODY');
  });

  it('adds fetchMethod hint for x_api', () => {
    const u = buildEnrichUserMessage('POST', { fetchMethod: 'x_api' });
    expect(u).toContain('Loại nguồn (X API)');
    expect(u).toContain('POST');
  });
});

describe('resolveEnrichTemperature', () => {
  it('defaults to 0.3 when unset or invalid; accepts 0–2', () => {
    const prev = process.env.ENRICH_TEMPERATURE;
    try {
      delete process.env.ENRICH_TEMPERATURE;
      expect(resolveEnrichTemperature()).toBe(0.3);
      process.env.ENRICH_TEMPERATURE = '0.2';
      expect(resolveEnrichTemperature()).toBe(0.2);
      process.env.ENRICH_TEMPERATURE = 'invalid';
      expect(resolveEnrichTemperature()).toBe(0.3);
      process.env.ENRICH_TEMPERATURE = '99';
      expect(resolveEnrichTemperature()).toBe(0.3);
      process.env.ENRICH_TEMPERATURE = '2';
      expect(resolveEnrichTemperature()).toBe(2);
    } finally {
      if (prev !== undefined) process.env.ENRICH_TEMPERATURE = prev;
      else delete process.env.ENRICH_TEMPERATURE;
    }
  });
});

describe('resolveEnrichModel', () => {
  it('prefers explicit override then ENRICH_MODEL then OPENAI_MODEL', () => {
    expect(resolveEnrichModel('x-1')).toBe('x-1');
    const pe = process.env.ENRICH_MODEL;
    const po = process.env.OPENAI_MODEL;
    try {
      delete process.env.ENRICH_MODEL;
      delete process.env.OPENAI_MODEL;
      expect(resolveEnrichModel()).toBe('gpt-4o-mini');
      process.env.OPENAI_MODEL = 'omni';
      expect(resolveEnrichModel()).toBe('omni');
      process.env.ENRICH_MODEL = 'enrich-only';
      expect(resolveEnrichModel()).toBe('enrich-only');
    } finally {
      if (pe !== undefined) process.env.ENRICH_MODEL = pe;
      else delete process.env.ENRICH_MODEL;
      if (po !== undefined) process.env.OPENAI_MODEL = po;
      else delete process.env.OPENAI_MODEL;
    }
  });
});

describe('buildEnrichmentSections', () => {
  it('sends system prompt and user message with context to the client', async () => {
    const prevTemp = process.env.ENRICH_TEMPERATURE;
    try {
      delete process.env.ENRICH_TEMPERATURE;
      let captured: ChatCompletionMessageParam[] | undefined;
      let capturedTemperature: number | undefined;
      const client = {
        chat: {
          completions: {
            create: async (args: {
              messages: ChatCompletionMessageParam[];
              temperature?: number;
            }) => {
              captured = args.messages;
              capturedTemperature = args.temperature;
              return {
                choices: [
                  {
                    message: {
                      content:
                        '## Tóm tắt\n- **Chủ đề / bối cảnh** — Test.\n- **Ý chính**\n- a\n## Insight (LLM) — suy luận\n- x\n## Câu hỏi mở\n- y?',
                    },
                  },
                ],
              };
            },
          },
        },
      };

      const out = await buildEnrichmentSections(
        'excerpt text',
        client,
        'gpt-4o-mini',
        { title: 'T', url: 'https://u' },
      );
      expect(out).toContain('## Tóm tắt');
      expect(captured).toBeDefined();
      expect(captured![0]!.role).toBe('system');
      expect(String(captured![0]!.content)).toContain('Ý chính');
      expect(captured![1]!.role).toBe('user');
      expect(String(captured![1]!.content)).toContain('Tiêu đề: T');
      expect(String(captured![1]!.content)).toContain('https://u');
      expect(String(captured![1]!.content)).toContain('excerpt text');
      expect(capturedTemperature).toBe(0.3);
    } finally {
      if (prevTemp !== undefined) process.env.ENRICH_TEMPERATURE = prevTemp;
      else delete process.env.ENRICH_TEMPERATURE;
    }
  });
});

describe('TAG_SYSTEM_PROMPT', () => {
  it('asks for JSON array of tags', () => {
    expect(TAG_SYSTEM_PROMPT).toContain('JSON array');
    expect(TAG_SYSTEM_PROMPT).toContain('lowercase');
    expect(TAG_SYSTEM_PROMPT).toContain('hyphen');
  });
});

describe('extractTags', () => {
  function makeClient(content: string) {
    return {
      chat: {
        completions: {
          create: async () => ({ choices: [{ message: { content } }] }),
        },
      },
    };
  }

  it('parses a plain JSON array response', async () => {
    const tags = await extractTags('text', makeClient('["ai", "machine-learning", "nlp"]'), 'gpt-4o-mini');
    expect(tags).toEqual(['ai', 'machine-learning', 'nlp']);
  });

  it('strips code fences before parsing', async () => {
    const tags = await extractTags('text', makeClient('```json\n["foo", "bar"]\n```'), 'gpt-4o-mini');
    expect(tags).toEqual(['foo', 'bar']);
  });

  it('caps at 5 tags', async () => {
    const client = makeClient('["a","b","c","d","e","f","g"]');
    const tags = await extractTags('text', client, 'gpt-4o-mini');
    expect(tags).toHaveLength(5);
  });

  it('returns [] on invalid JSON', async () => {
    const tags = await extractTags('text', makeClient('not json'), 'gpt-4o-mini');
    expect(tags).toEqual([]);
  });

  it('returns [] when completion is empty', async () => {
    const client = { chat: { completions: { create: async () => ({ choices: [] }) } } };
    const tags = await extractTags('text', client, 'gpt-4o-mini');
    expect(tags).toEqual([]);
  });
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
                    '## Tóm tắt\n- **Chủ đề / bối cảnh** — X.\n- **Ý chính**\n- một\n## Insight (LLM) — suy luận\nCó thể liên quan Y (suy luận).\n\n## Câu hỏi mở\n- Câu 1?\n- Câu 2?',
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
      title: 'Doc title',
      url: 'https://example.com',
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
