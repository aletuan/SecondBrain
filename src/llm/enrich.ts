import fs from 'node:fs/promises';
import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

export type ChatCompletionsLike = {
  create: (args: {
    model: string;
    messages: ChatCompletionMessageParam[];
  }) => Promise<{
    choices: Array<{ message?: { content?: string | null } | null }>;
  }>;
};

export type OpenAIClientLike = {
  chat: { completions: ChatCompletionsLike };
};

const SYSTEM = `Bạn là trợ lý ghi chú. Chỉ dùng nội dung nguồn người dùng cung cấp.
Trả lời bằng Markdown với đúng ba section theo thứ tự (tiêu đề giữ nguyên):
## Tóm tắt
(ý chính, trung thực với nguồn)

## Insight (LLM) — suy luận
(phần suy luận / liên hệ — ghi rõ đây không phải trích dẫn nguyên văn)

## Câu hỏi mở
(bullet list các câu hỏi tiếp theo)`;

export async function buildEnrichmentSections(
  sourceExcerpt: string,
  client: OpenAIClientLike,
  model: string,
): Promise<string> {
  const res = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: sourceExcerpt },
    ],
  });
  const text = res.choices[0]?.message?.content;
  if (!text?.trim()) throw new Error('enrich: empty completion');
  return text.trim();
}

export async function enrichNote(options: {
  notePath: string;
  sourceExcerpt: string;
  apiKey?: string;
  model?: string;
  client?: OpenAIClientLike;
}): Promise<void> {
  const key = options.apiKey ?? process.env.OPENAI_API_KEY;
  if (!key?.trim()) throw new Error('enrich: OPENAI_API_KEY is not set');
  const model = options.model ?? process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
  const client = options.client ?? (new OpenAI({ apiKey: key }) as unknown as OpenAIClientLike);
  const body = await buildEnrichmentSections(options.sourceExcerpt, client, model);
  const block = `\n\n---\n\n${body}\n`;
  await fs.appendFile(options.notePath, block, 'utf8');
}
