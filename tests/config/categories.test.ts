import { describe, expect, it } from 'vitest';
import {
  getAllowedCategoryIdsSorted,
  loadCategoriesFromYamlText,
  parseCategoriesYaml,
} from '../../cli/src/config/categories.js';

const exampleFixture = `items:
  - id: machine-learning
    label: Machine Learning
  - id: data-engineering
    label: Data Engineering
  - id: security
    label: Security
  - id: management
    label: Management
  - id: uncategorized
    label: Khác / Chưa phân loại
`;

describe('parseCategoriesYaml', () => {
  it('parses items with id and label', () => {
    const entries = parseCategoriesYaml(exampleFixture);
    expect(entries).toHaveLength(5);
    expect(entries.map(e => e.id)).toContain('uncategorized');
    expect(new Set(entries.map(e => e.id)).size).toBe(5);
  });

  it('throws on duplicate ids', () => {
    expect(() =>
      parseCategoriesYaml(`items:
  - id: a
    label: A
  - id: a
    label: B
`),
    ).toThrow(/duplicate/i);
  });
});

describe('getAllowedCategoryIdsSorted', () => {
  it('returns sorted unique ids', () => {
    const entries = parseCategoriesYaml(exampleFixture);
    expect(getAllowedCategoryIdsSorted(entries)).toEqual([
      'data-engineering',
      'machine-learning',
      'management',
      'security',
      'uncategorized',
    ]);
  });
});

describe('loadCategoriesFromYamlText', () => {
  it('delegates to parseCategoriesYaml', () => {
    expect(loadCategoriesFromYamlText(exampleFixture)).toEqual(parseCategoriesYaml(exampleFixture));
  });
});
