import { describe, expect, it } from 'vitest';
import {
  generateChallengeJson,
  parseDigestMarkdown,
  renderChallengeMarkdown,
  resolveDigestPathForWeek,
} from '../../src/challenge/fromDigest.js';
import type { OpenAIClientLike } from '../../src/llm/enrich.js';

describe('parseDigestMarkdown', () => {
  it('splits frontmatter and body', () => {
    const raw = `---
type: digest
week: 2026-W11
---
# Digest

Body here.`;
    const { frontmatter, body } = parseDigestMarkdown(raw);
    expect(frontmatter.type).toBe('digest');
    expect(frontmatter.week).toBe('2026-W11');
    expect(body).toContain('Body here');
  });
});

describe('resolveDigestPathForWeek', () => {
  it('builds Digests path', () => {
    expect(resolveDigestPathForWeek('/vault', '2026-W12')).toBe('/vault/Digests/2026-W12.md');
    expect(resolveDigestPathForWeek('/vault', '2026-w03')).toBe('/vault/Digests/2026-W03.md');
  });

  it('rejects bad week', () => {
    expect(() => resolveDigestPathForWeek('/v', 'bad')).toThrow(/2026-W12/);
  });
});

describe('generateChallengeJson + renderChallengeMarkdown', () => {
  it('uses mocked LLM JSON and renders markdown sections', async () => {
    const client: OpenAIClientLike = {
      chat: {
        completions: {
          create: async () => ({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    difficulty: 'easy',
                    questions: [
                      { question: 'Q1?', answer_key: 'A1' },
                      { question: 'Q2?', answer_key: 'A2' },
                      { question: 'Q3?', answer_key: 'A3' },
                    ],
                  }),
                },
              },
            ],
          }),
        },
      },
    };

    const json = await generateChallengeJson('digest body', client, 'gpt-4o-mini');
    expect(json.questions).toHaveLength(3);

    const md = renderChallengeMarkdown(json, {
      digestRelPath: 'Digests/2026-W11.md',
      model: 'gpt-4o-mini',
      weekId: '2026-W11',
    });
    expect(md).toContain('type: "challenge"');
    expect(md).toContain('## Câu hỏi');
    expect(md).toContain('## Gợi ý đáp án');
    expect(md).toContain('Q1?');
    expect(md).toContain('**1.** A1');
  });
});
