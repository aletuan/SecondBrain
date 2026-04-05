import { describe, expect, it } from 'vitest';
import type { OpenAIClientLike } from '../../cli/src/llm/enrich.js';
import {
  extractJsonStringArray,
  injectViTranscriptSection,
  parseEnTranscriptFromSourceMarkdown,
  translateTranscriptSegments,
} from '../../cli/src/llm/translateTranscript.js';

describe('extractJsonStringArray', () => {
  it('parses raw JSON array', () => {
    expect(extractJsonStringArray('["a","b"]')).toEqual(['a', 'b']);
  });

  it('strips markdown fence', () => {
    expect(
      extractJsonStringArray('```json\n["x"]\n```'),
    ).toEqual(['x']);
  });

  it('extracts first array when extra trailing text', () => {
    expect(extractJsonStringArray('["ok"] trailing')).toEqual(['ok']);
  });

  it('parses JSON object with lines key', () => {
    expect(extractJsonStringArray('{"lines":["a","b"]}')).toEqual(['a', 'b']);
  });

  it('strips fence around JSON object', () => {
    expect(
      extractJsonStringArray('```json\n{"lines":["x"]}\n```'),
    ).toEqual(['x']);
  });
});

describe('parseEnTranscriptFromSourceMarkdown', () => {
  it('reads timestamp lines', () => {
    const md = `---
type: capture
---
## Transcript (en)

**0:03** Hello
**1:00** World
`;
    expect(parseEnTranscriptFromSourceMarkdown(md)).toEqual([
      { startSec: 3, text: 'Hello' },
      { startSec: 60, text: 'World' },
    ]);
  });
});

describe('injectViTranscriptSection', () => {
  it('appends vi block', () => {
    const base = '# T\n\n## Transcript (en)\n\n**0:01** Hi\n';
    const next = injectViTranscriptSection(base, [{ startSec: 1, text: 'Chào' }]);
    expect(next).toContain('## Transcript (vi)');
    expect(next).toContain('**0:01** Chào');
  });

  it('replaces existing vi section', () => {
    const base =
      '# T\n\n## Transcript (en)\n\n**0:01** Hi\n\n## Transcript (vi) — bản dịch (LLM)\n\nOld\n\n## Other\n\nX\n';
    const next = injectViTranscriptSection(base, [{ startSec: 1, text: 'Mới' }]);
    expect(next).toContain('**0:01** Mới');
    expect(next).not.toContain('Old');
    expect(next).toContain('## Other');
  });
});

describe('translateTranscriptSegments', () => {
  it('maps batches through mock client', async () => {
    const client: OpenAIClientLike = {
      chat: {
        completions: {
          create: async () => ({
            choices: [
              {
                message: {
                  content: JSON.stringify({ lines: ['Một', 'Hai'] }),
                },
              },
            ],
          }),
        },
      },
    };
    const out = await translateTranscriptSegments(
      [
        { startSec: 0, text: 'One' },
        { startSec: 1, text: 'Two' },
      ],
      { client, model: 'mock', batchSize: 20 },
    );
    expect(out).toEqual([
      { startSec: 0, text: 'Một' },
      { startSec: 1, text: 'Hai' },
    ]);
  });
});
