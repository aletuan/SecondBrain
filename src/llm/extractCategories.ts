import type { OpenAIClientLike } from './enrich.js';

/** Vietnamese prompt: classify into fixed taxonomy ids only. */
export function buildCategorySystemPrompt(allowedIdsSorted: string[]): string {
  const list = allowedIdsSorted.join(', ');
  return `Bạn phân loại nội dung theo các category sau (chỉ dùng đúng id, có thể chọn nhiều id).

Các id hợp lệ: ${list}

Trả về **duy nhất** một JSON array các chuỗi id (ví dụ: ["machine-learning","data-engineering"]). Không thêm id không nằm trong danh sách. Nếu không phù hợp rõ ràng category nào, có thể dùng "uncategorized" hoặc mảng rỗng []. Chỉ trả JSON array, không giải thích.`;
}

export async function extractCategories(
  excerpt: string,
  client: OpenAIClientLike,
  model: string,
  allowedIds: string[],
): Promise<string[]> {
  const allowedSet = new Set(allowedIds);
  const sortedIds = [...allowedIds].sort((a, b) => a.localeCompare(b));
  try {
    const res = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: buildCategorySystemPrompt(sortedIds) },
        { role: 'user', content: excerpt.slice(0, 120_000) },
      ],
      temperature: 0.2,
      max_tokens: 200,
    });
    const raw = res.choices[0]?.message?.content?.trim() ?? '';
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) return [];
    const out = parsed
      .filter((t): t is string => typeof t === 'string' && t.length > 0)
      .filter(id => allowedSet.has(id));
    const uniq = [...new Set(out)].sort((a, b) => a.localeCompare(b));
    return uniq;
  } catch {
    return [];
  }
}
