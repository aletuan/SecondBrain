import { describe, expect, it } from 'vitest';
import {
  mergeMilestones,
  milestonesToYaml,
  parseMilestonesYaml,
  validateMilestones,
} from '../../cli/src/youtube/milestones.js';

describe('parseMilestonesYaml', () => {
  it('parses milestones key', () => {
    const y = `milestones:
  - t: 10
    label: "Intro"
  - t: 90
    label: "Demo"
    kind: highlight
`;
    expect(parseMilestonesYaml(y)).toEqual([
      { t: 10, label: 'Intro' },
      { t: 90, label: 'Demo', kind: 'highlight' },
    ]);
  });

  it('parses bare array', () => {
    expect(parseMilestonesYaml('- t: 1\n  label: A')).toEqual([{ t: 1, label: 'A' }]);
  });
});

describe('mergeMilestones', () => {
  it('later wins on same t', () => {
    expect(
      mergeMilestones(
        [{ t: 1, label: 'a' }],
        [{ t: 1, label: 'b' }],
      ),
    ).toEqual([{ t: 1, label: 'b' }]);
  });
});

describe('validateMilestones', () => {
  it('filters by maxSec', () => {
    expect(
      validateMilestones(
        [
          { t: -1, label: 'x' },
          { t: 5, label: 'ok' },
          { t: 100, label: 'late' },
        ],
        60,
      ),
    ).toEqual([{ t: 5, label: 'ok' }]);
  });
});

describe('milestonesToYaml', () => {
  it('round-trips', () => {
    const ms = [
      { t: 2, label: 'Hi' },
      { t: 10, label: 'Chương', kind: 'chapter' as const },
    ];
    expect(parseMilestonesYaml(milestonesToYaml(ms))).toEqual(ms);
  });
});
