/** Default max chars of `source.md` body sent to the enrich LLM (after frontmatter strip). */
export const DEFAULT_ENRICH_MAX_CHARS = 12_000;

const SEP =
  '\n\n---\n*(Đoạn giữa đã lược bỏ để vừa giới hạn ngữ cảnh; ưu tiên phần đầu và phần cuối bài — thường chứa dẫn nhập và kết luận.)*\n---\n\n';

export function enrichMaxCharsFromEnv(): number {
  const n = Number(process.env.ENRICH_MAX_CHARS);
  if (Number.isFinite(n) && n >= 4_000 && n <= 200_000) return Math.floor(n);
  return DEFAULT_ENRICH_MAX_CHARS;
}

/**
 * If body exceeds `maxChars`, keep a head + tail window so conclusions/end of transcript stay in context.
 */
export function truncateSourceForEnrich(body: string, maxChars: number): string {
  if (body.length <= maxChars) return body;
  const budget = maxChars - SEP.length;
  if (budget < 500) return body.slice(0, maxChars);
  const head = Math.floor(budget * 0.62);
  const tail = budget - head;
  return body.slice(0, head) + SEP + body.slice(-tail);
}
