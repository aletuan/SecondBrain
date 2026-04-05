import { describe, expect, it, vi } from 'vitest';
import type { OpenAIClientLike } from '../../cli/src/llm/enrich.js';
import { extractCategories } from '../../cli/src/llm/extractCategories.js';

function mockClient(content: string): OpenAIClientLike {
  return {
    chat: {
      completions: {
        create: vi.fn(async () => ({
          choices: [{ message: { content } }],
        })),
      },
    },
  };
}

describe('extractCategories', () => {
  it('filters to allowed ids, dedupes, sorts', async () => {
    const allowed = ['machine-learning', 'uncategorized'];
    const client = mockClient('["machine-learning","bogus","machine-learning"]');
    const out = await extractCategories('some excerpt', client, 'gpt-4o-mini', allowed);
    expect(out).toEqual(['machine-learning']);
  });

  it('returns empty on parse failure', async () => {
    const client = mockClient('not json');
    const out = await extractCategories('x', client, 'gpt-4o-mini', ['a']);
    expect(out).toEqual([]);
  });

  it('strips markdown fence from response', async () => {
    const client = mockClient('```json\n["uncategorized"]\n```');
    const out = await extractCategories('x', client, 'm', ['uncategorized']);
    expect(out).toEqual(['uncategorized']);
  });
});
