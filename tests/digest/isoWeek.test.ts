import { describe, expect, it } from 'vitest';
import { utcDigestWeekId } from '../../src/digest/isoWeek.js';

describe('utcDigestWeekId', () => {
  it('matches ISO week for known UTC dates', () => {
    expect(utcDigestWeekId(new Date('2026-03-15T12:00:00.000Z'))).toBe('2026-W11');
    expect(utcDigestWeekId(new Date('2026-03-20T12:00:00.000Z'))).toBe('2026-W12');
  });
});
