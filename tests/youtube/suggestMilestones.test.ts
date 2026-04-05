import { describe, expect, it } from 'vitest';
import type { OpenAIClientLike } from '../../cli/src/llm/enrich.js';
import { suggestMilestonesFromTranscript } from '../../cli/src/youtube/suggestMilestones.js';

describe('suggestMilestonesFromTranscript', () => {
  it('parses milestones from mock JSON', async () => {
    const client: OpenAIClientLike = {
      chat: {
        completions: {
          create: async () => ({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    milestones: [
                      { t: 0, label: 'Start', kind: 'chapter' },
                      { t: 30, label: 'Tip', kind: 'highlight' },
                    ],
                  }),
                },
              },
            ],
          }),
        },
      },
    };
    const out = await suggestMilestonesFromTranscript({
      segments: [
        { startSec: 0, text: 'Hello' },
        { startSec: 30, text: 'World' },
      ],
      maxSec: 120,
      client,
      model: 'mock',
    });
    expect(out).toEqual([
      { t: 0, label: 'Start', kind: 'chapter' },
      { t: 30, label: 'Tip', kind: 'highlight' },
    ]);
  });
});
