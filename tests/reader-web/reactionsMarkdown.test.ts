import { describe, expect, it } from 'vitest';
import {
  appendToReactionsFile,
  formatReactionEntry,
  parseReactionsMarkdown,
  ratingToStarLine,
} from '../../reader-web/vault/reactionsMarkdown.js';

describe('reactionsMarkdown', () => {
  it('ratingToStarLine covers 1 and 5', () => {
    expect(ratingToStarLine(1)).toContain('(1/5)');
    expect(ratingToStarLine(5)).toBe('★★★★★ (5/5)');
  });

  it('parses spec example (two entries, second without comment)', () => {
    const raw = `# Reader reactions

### 2026-03-27T10:00:00+07:00

**Đánh giá:** ★★★★★ (5/5)

Hay, sẽ đọc lại.

---

### 2026-03-27T15:20:00+07:00

**Đánh giá:** ★★★☆☆ (3/5)
`;
    const { entries } = parseReactionsMarkdown(raw);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      at: '2026-03-27T10:00:00+07:00',
      rating: 5,
      text: 'Hay, sẽ đọc lại.',
    });
    expect(entries[1]).toMatchObject({
      at: '2026-03-27T15:20:00+07:00',
      rating: 3,
    });
    expect(entries[1]!.text).toBeUndefined();
  });

  it('round-trip append preserves parse', () => {
    const first = appendToReactionsFile(null, 4, 'ok', new Date('2026-01-15T12:00:00Z'));
    const second = appendToReactionsFile(first, 2, undefined, new Date('2026-01-16T12:00:00Z'));
    const { entries } = parseReactionsMarkdown(second);
    expect(entries).toHaveLength(2);
    expect(entries[0]!.rating).toBe(4);
    expect(entries[0]!.text).toBe('ok');
    expect(entries[1]!.rating).toBe(2);
    expect(entries[1]!.text).toBeUndefined();
  });

  it('formatReactionEntry has no comment block when empty', () => {
    const block = formatReactionEntry(3, undefined, new Date('2026-06-01T08:00:00+00:00'));
    expect(block).toContain('**Đánh giá:**');
    expect(block).toContain('(3/5)');
    expect(block.split('\n').some((l) => l.trim() === '')).toBe(true);
    const { entries } = parseReactionsMarkdown(`# Reader reactions\n\n${block}`);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.text).toBeUndefined();
  });
});
