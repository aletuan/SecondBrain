import { describe, expect, it } from 'vitest';
import { stripCauHoiMoSection } from '../../src/vault/stripCauHoiMoSection.js';

describe('stripCauHoiMoSection', () => {
  it('returns unchanged when heading is absent', () => {
    const md = '# T\n\n## Tóm tắt\nA\n';
    const { text, changed } = stripCauHoiMoSection(md);
    expect(changed).toBe(false);
    expect(text).toBe(md);
  });

  it('removes ## Câu hỏi mở through line before next H2', () => {
    const md = `## Insight\nX\n\n## Câu hỏi mở\n- a?\n- b?\n\n## Hình ảnh\n![[x]]\n`;
    const { text, changed } = stripCauHoiMoSection(md);
    expect(changed).toBe(true);
    expect(text).not.toContain('Câu hỏi mở');
    expect(text).not.toContain('a?');
    expect(text).toContain('## Insight');
    expect(text).toContain('## Hình ảnh');
  });

  it('removes optional --- immediately before the section', () => {
    const md = `## Insight\nok\n\n---\n\n## Câu hỏi mở\n- q?\n`;
    const { text, changed } = stripCauHoiMoSection(md);
    expect(changed).toBe(true);
    expect(text).not.toContain('Câu hỏi mở');
    expect(text.trimEnd()).toMatch(/Insight\nok$/);
  });

  it('handles ### Câu hỏi mở heading', () => {
    const md = `## Insight\nx\n\n### Câu hỏi mở\n- z?\n`;
    const { text, changed } = stripCauHoiMoSection(md);
    expect(changed).toBe(true);
    expect(text).not.toContain('z?');
  });
});
