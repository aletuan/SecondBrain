import fs from 'node:fs/promises';
import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import type { FetchMethod } from '../types/capture.js';

export type ChatCompletionsLike = {
  create: (args: {
    model: string;
    messages: ChatCompletionMessageParam[];
    temperature?: number;
    max_tokens?: number;
  }) => Promise<{
    choices: Array<{ message?: { content?: string | null } | null }>;
  }>;
};

export type OpenAIClientLike = {
  chat: { completions: ChatCompletionsLike };
};

/** Exported for tests — structured summary + deeper insight + concrete open questions. */
export const ENRICH_SYSTEM_PROMPT = `Bạn là trợ lý ghi chú chuyên nghiệp. Chỉ được dựa trên khối nguồn (và tiêu đề/URL nếu có) mà người dùng gửi; không bịa số liệu hay trích dẫn không có trong nguồn.

Trả lời bằng Markdown với đúng ba section theo thứ tự (giữ nguyên tiêu đề cấp 2):

## Tóm tắt
Viết tiếng Việt, súc tích, có cấu trúc:
- **Chủ đề / bối cảnh** — một câu: bài nói về cái gì, cho ai.
- **Ý chính** — từ **một** đến **tối đa 7** gạch đầu dòng; mỗi dòng một luận điểm, kết quả, bước hoặc khuyến nghị **lấy từ nguồn**. Ưu tiên **tên công cụ, số liệu, bước cụ thể** có trong nguồn. **Không** thêm ý chỉ để đủ số dòng — nếu nguồn ngắn hoặc ít ý, viết ít gạch hơn là bịa.
- **Trích ngắn (tùy chọn)** — Nếu nguồn có số liệu hoặc claim quan trọng, có thể thêm **một hoặc hai** cụm trích ngắn trong ngoặc kép — **chỉ** từ nguồn; nếu không có gì đáng trích, bỏ qua hoặc ghi *(Không có trích ngắn.)*
- **Kết luận hoặc thông điệp trung tâm** — 1–2 câu, bám sát nguồn.
- **Thuật ngữ, số liệu hoặc claim đáng nhớ** — nếu nguồn có: 2–5 gạch đầu dòng ngắn (chỉ điều thật sự xuất hiện). Nếu không có gì nổi bật, ghi một dòng: *(Không có mục riêng — nội dung mang tính mô tả chung.)*

## Insight (LLM) — suy luận
- **Tối đa 4** gạch đầu dòng: hệ quả, rủi ro, hạn chế phương pháp, liên hệ với bối cảnh rộng — **đây là suy luận của bạn**, không trình như trích dẫn trực tiếp từ nguồn. Tránh lặp lại nguyên si phần Tóm tắt; khi có thể, gắn suy luận với chi tiết đã nêu ở Tóm tắt.
- Có thể dùng công thức "Nếu … thì …" hoặc "Điểm cần kiểm chứng thêm: …" khi phù hợp.

## Câu hỏi mở
- **Tối đa 8** câu hỏi cụ thể (gạch đầu dòng) để độc giả đào sâu, áp dụng hoặc kiểm chứng — **tối thiểu 4** nếu nguồn đủ dư địa; nếu nguồn hẹp, 4 câu cũng được. Tránh câu hỏi siêu chung; **không** thêm câu chỉ để đủ số.`;

export type EnrichSourceContext = {
  title?: string;
  url?: string;
  fetchMethod?: FetchMethod;
};

function fetchMethodHint(method: FetchMethod): string {
  switch (method) {
    case 'x_api':
      return 'Loại nguồn (X API): ưu tiên các bước, số liệu và tên công cụ xuất hiện trong post (tweet/long post); không suy diễn ngoài nguồn.';
    case 'http_readability':
      return 'Loại nguồn (trang web): ưu tiên luận điểm, số liệu và tên riêng trong bài đã trích.';
    case 'apify':
      return 'Loại nguồn (Apify crawl): ưu tiên chi tiết có trong nội dung đã trích; không thêm giả định ngoài ngữ cảnh nguồn.';
    default: {
      const _exhaustive: never = method;
      return _exhaustive;
    }
  }
}

export function buildEnrichUserMessage(excerpt: string, ctx: EnrichSourceContext = {}): string {
  const lines: string[] = [];
  if (ctx.title?.trim()) lines.push(`Tiêu đề: ${ctx.title.trim()}`);
  if (ctx.url?.trim()) lines.push(`URL: ${ctx.url.trim()}`);
  if (ctx.fetchMethod) lines.push(fetchMethodHint(ctx.fetchMethod));
  const header =
    lines.length > 0
      ? `${lines.join('\n')}\n\n---\n\n`
      : '';
  return `${header}Nội dung nguồn (Markdown; có thể đã rút gọn giữa đầu và cuối):\n\n${excerpt}`;
}

export function resolveEnrichModel(override?: string): string {
  const fromOpt = override?.trim();
  if (fromOpt) return fromOpt;
  const enrich = process.env.ENRICH_MODEL?.trim();
  if (enrich) return enrich;
  return process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini';
}

const DEFAULT_ENRICH_TEMPERATURE = 0.3;

/** OpenAI chat completions allow 0–2; invalid/unset → default 0.3. */
export function resolveEnrichTemperature(): number {
  const raw = process.env.ENRICH_TEMPERATURE?.trim();
  if (!raw) return DEFAULT_ENRICH_TEMPERATURE;
  const n = Number.parseFloat(raw);
  if (Number.isFinite(n) && n >= 0 && n <= 2) return n;
  return DEFAULT_ENRICH_TEMPERATURE;
}

export async function buildEnrichmentSections(
  sourceExcerpt: string,
  client: OpenAIClientLike,
  model: string,
  ctx: EnrichSourceContext = {},
): Promise<string> {
  const userContent = buildEnrichUserMessage(sourceExcerpt, ctx);
  const res = await client.chat.completions.create({
    model,
    temperature: resolveEnrichTemperature(),
    messages: [
      { role: 'system', content: ENRICH_SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ],
  });
  const text = res.choices[0]?.message?.content;
  if (!text?.trim()) throw new Error('enrich: empty completion');
  return text.trim();
}

export const TAG_SYSTEM_PROMPT =
  'Từ nội dung sau, trả về 3-5 tags chủ đề dưới dạng JSON array. Tags phải ngắn gọn, lowercase, dùng hyphen. Chỉ trả về JSON array.';

export async function extractTags(
  excerpt: string,
  client: OpenAIClientLike,
  model: string,
): Promise<string[]> {
  try {
    const res = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: TAG_SYSTEM_PROMPT },
        { role: 'user', content: excerpt },
      ],
      temperature: 0.2,
      max_tokens: 100,
    });
    const raw = res.choices[0]?.message?.content?.trim() ?? '';
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((t): t is string => typeof t === 'string' && t.length > 0)
      .slice(0, 5);
  } catch {
    return [];
  }
}

export async function enrichNote(options: {
  notePath: string;
  sourceExcerpt: string;
  title?: string;
  url?: string;
  fetchMethod?: FetchMethod;
  apiKey?: string;
  model?: string;
  client?: OpenAIClientLike;
}): Promise<void> {
  const key = options.apiKey ?? process.env.OPENAI_API_KEY;
  if (!key?.trim()) throw new Error('enrich: OPENAI_API_KEY is not set');
  const model = resolveEnrichModel(options.model);
  const client = options.client ?? (new OpenAI({ apiKey: key }) as unknown as OpenAIClientLike);
  const body = await buildEnrichmentSections(
    options.sourceExcerpt,
    client,
    model,
    { title: options.title, url: options.url, fetchMethod: options.fetchMethod },
  );
  const block = `\n\n---\n\n${body}\n`;
  await fs.appendFile(options.notePath, block, 'utf8');
}
