# Enrich outline → per-item detail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Khi nguồn có nhiều mục/ví dụ song song, **Tóm tắt** không dừng ở một dòng liệt tên; mỗi mục quan trọng có cụm ngắn từ nguồn. Đồng thời set **`max_tokens`** cho completion enrich để tránh cắt output.

**Architecture:** Chỉnh `ENRICH_SYSTEM_PROMPT` trong `src/llm/enrich.ts`; thêm `resolveEnrichMaxCompletionTokens()` đọc `ENRICH_MAX_COMPLETION_TOKENS` (default 4096); truyền vào `chat.completions.create` cho `buildEnrichmentSections` only.

**Tech Stack:** TypeScript, Vitest, OpenAI chat completions.

**Spec:** `docs/superpowers/specs/2026-03-28-enrich-outline-vs-detail-design.md`

---

### Task 1: `resolveEnrichMaxCompletionTokens` + `max_tokens` trên enrich

**Files:** `src/llm/enrich.ts`, `tests/llm/enrich.test.ts`

- [ ] Export `resolveEnrichMaxCompletionTokens(): number` — default **4096**; env `ENRICH_MAX_COMPLETION_TOKENS` integer trong **[256, 32000]** (hoặc tương đương an toàn); invalid → default.
- [ ] `buildEnrichmentSections`: thêm `max_tokens: resolveEnrichMaxCompletionTokens()`.
- [ ] Tests: describe mới cho resolver; mở rộng mock `create` để `expect(args.max_tokens).toBe(4096)` (và restore env).

### Task 2: Chỉnh `ENRICH_SYSTEM_PROMPT` (mục 4A spec)

**Files:** `src/llm/enrich.ts`, `tests/llm/enrich.test.ts`

- [ ] Thay wording **Tóm tắt**: bỏ nhấn “súc tích” mơ hồ; thêm quy tắc **nhiều mục song song** (không gom một gạch toàn tên; mỗi gạch — mở ngắn từ nguồn; nếu không có chi tiết thì ghi rõ không bịa).
- [ ] Cập nhật assertions `ENRICH_SYSTEM_PROMPT` (substring mới, vd. “song song”, “một hoặc hai câu”, hoặc “không gom”).

### Task 3: Docs env

**Files:** `CLAUDE.md`, `README.md`

- [ ] Bảng: `ENRICH_MAX_COMPLETION_TOKENS` — optional; default 4096; giới hạn parse.

### Task 4: Verify

- [ ] `pnpm test` && `pnpm typecheck`
- [ ] Commit: `feat(llm): enrich per-item detail prompt and max completion tokens`
