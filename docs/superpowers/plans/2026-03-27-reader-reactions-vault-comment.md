# Reader reactions (vault `{slug}.comment`) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cho phép người đọc chấm 1–5 sao và ghi chú tùy chọn mỗi lần, lưu lịch sử append vào `{slug}.comment` (Markdown) trong thư mục capture; hiển thị và gửi qua reader-web API + UI cuối trang capture.

**Architecture:** Resolver slug từ `getCaptureFiles` → đường dẫn `commentPath`. Module parse/format Markdown theo spec. `GET/POST /api/captures/:id/reactions` đọc/ghi file UTF-8. UI vanilla TS trong `main.ts` (hoặc module nhỏ mới) gọi API và render timeline; khi làm UI áp dụng skill **frontend-design**.

**Tech Stack:** TypeScript, `reader-web` Vite, Node `fs` trong vault service / middleware, Vitest cho parser.

**Spec:** `docs/superpowers/specs/2026-03-27-reader-reactions-vault-comment-design.md`

---

## File map

| File | Vai trò |
|------|---------|
| `reader-web/vault/reactionsMarkdown.ts` (mới) | `parseReactionsMarkdown`, `appendReactionEntry`, hằng số template, `MAX_COMMENT_CHARS` |
| `reader-web/vault/service.ts` | Export `getCommentPath(captureDir)` hoặc dùng chung logic với `getCaptureFiles` |
| `reader-web/vault/apiMiddleware.ts` | `GET` + `POST` `/api/captures/:id/reactions` |
| `reader-web/src/types.ts` | Type `ReactionEntry` nếu cần chia sẻ |
| `reader-web/src/main.ts` | Section HTML trong `renderCaptureDetail`, bind sau load, gọi API |
| `reader-web/src/style.css` | Style khối reactions + timeline |
| `reader-web/tests/reactionsMarkdown.test.ts` (mới) | Parser + append round-trip |

---

### Task 1: Parser + append Markdown

**Files:**
- Create: `reader-web/vault/reactionsMarkdown.ts`
- Create: `reader-web/tests/reactionsMarkdown.test.ts`

- [ ] **Step 1:** Implement `parseReactionsMarkdown(raw: string): { entries: Array<{ at: string; rating: number; text?: string }> }` theo spec (split `---`, parse `### ISO`, dòng `**Đánh giá:**`, `(n/5)`).
- [ ] **Step 2:** Implement `formatReactionEntry(rating: number, comment: string | undefined, at: Date): string` — một block entry **không** gồm delimiter đầu (caller thêm `---` khi append sau nội dung cũ).
- [ ] **Step 3:** Implement `appendToReactionsFile(existing: string | null, rating, comment?, at?: Date): string` — nếu file rỗng/mới, có thể thêm `# Reader reactions\n\n`; append `---\n\n` trước entry mới khi `existing` đã có nội dung sau header.
- [ ] **Step 4:** Viết Vitest: ví dụ spec mục 3.2, entry không comment, rating 1 và 5.
- [ ] **Step 5:** Chạy `cd reader-web && pnpm exec vitest run tests/reactionsMarkdown.test.ts`

- [ ] **Step 6:** Commit `feat(reader-web): reactions markdown parse and append`

---

### Task 2: `commentPath` trong service

**Files:**
- Modify: `reader-web/vault/service.ts`

- [ ] **Step 1:** Thêm hàm async hoặc sync lấy `commentPath` từ `captureDir`: đọc `getCaptureFiles`, suy ra basename từ `notePath` (ví dụ `strip .note.md` / `note.md` → slug prefix), return `path.join(captureDir, `${slug}.comment`)`.
- [ ] **Step 2:** Export để middleware dùng.

- [ ] **Step 3:** `pnpm exec tsc --noEmit` trong `reader-web`

- [ ] **Step 4:** Commit `feat(reader-web): resolve capture comment file path`

---

### Task 3: API GET/POST reactions

**Files:**
- Modify: `reader-web/vault/apiMiddleware.ts`
- May use: `reader-web/vault/reactionsMarkdown.ts`, `service.ts`

- [ ] **Step 1:** `GET /api/captures/:id/reactions` — resolve capture dir, đọc file nếu có, `parseReactionsMarkdown`, JSON `{ entries }`. Capture không tồn tại → 404.
- [ ] **Step 2:** `POST /api/captures/:id/reactions` — `readJsonBody`, validate `rating` integer 1–5, `comment` optional string trim, reject nếu quá `MAX_COMMENT_CHARS`.
- [ ] **Step 3:** Read existing file, `appendToReactionsFile`, `fs.writeFile`. Trả `{ ok: true }`.
- [ ] **Step 4:** Xử lý lỗi đọc/ghi (500 + message ngắn).

- [ ] **Step 5:** Cập nhật `reader-web/README.md` — hai endpoint mới (một đoạn trong API).

- [ ] **Step 6:** Commit `feat(reader-web): API for vault reactions file`

---

### Task 4: UI capture detail + timeline

**Files:**
- Modify: `reader-web/src/main.ts`
- Modify: `reader-web/src/style.css`

- [ ] **Step 1:** Trong `renderCaptureDetail`, thêm section `#cap-reactions` (hoặc tương đương) với skeleton: nhãn, 5 nút sao hoặc input range/star UI, textarea, nút Gửi, container timeline.
- [ ] **Step 2:** Sau khi inject note prose, `fetch` GET reactions, render danh sách entry (thời gian, sao, text đã escape). Sort **mới nhất trên cùng** (sort theo `at` desc).
- [ ] **Step 3:** Bind submit → POST, sau đó refresh GET hoặc append DOM lạc quan.
- [ ] **Step 4:** Áp dụng **frontend-design** (typography, spacing, trạng thái empty/error) — không phá vỡ theme hiện có (`--signal`, v.v.).

- [ ] **Step 5:** Kiểm tra tay: `pnpm dev`, mở một capture, gửi vài lần, mở file `.comment` trong vault trong Obsidian.

- [ ] **Step 6:** Commit `feat(reader-web): capture reactions UI and timeline`

---

### Task 5: Verification

- [ ] **Step 1:** `cd reader-web && pnpm exec tsc --noEmit`
- [ ] **Step 2:** `pnpm test` từ root repo (nếu có script chạy cả reader-web tests) hoặc `cd reader-web && pnpm exec vitest run`
- [ ] **Step 3:** Commit nếu chỉ sửa lỗi nhỏ; hoặc `chore: verify reader reactions`

---

## Plan review

- [ ] Đối chiếu lại với spec §3 (delimiter, nhãn `Đánh giá:`) trước khi merge.
