# Remove publish UI + cột Đánh giá (Thư viện) — Implementation Plan

> **For agentic workers:** Implement task-by-task; steps use checkbox (`- [ ]`) syntax for tracking. Subagent-driven-development or executing-plans optional.

**Goal:** (A) Ẩn mọi UI “publish/private” và khóa `publish` trong frontmatter grid; giữ field `publish` trong API/types. (B) Thay cột “Trạng thái” bằng “Đánh giá” với trung bình từ `{slug}.comment`, định dạng **sao + số** (spec §3.2).

**Architecture:** `listCaptures` đọc thêm file comment (qua `getCommentPath`), `parseReactionsMarkdown` + `averageReactionStats`; UI `main.ts` render ô từ `reaction_avg` / `reaction_count`. Sao hiển thị: **chỉ** 5 ký tự ★/☆ — refactor nhỏ trong `reactionsMarkdown.ts` vì `ratingToStarLine` hiện nối thêm ` (n/5)` (không lặp số khi đã có `4.3`).

**Spec:** [`docs/superpowers/specs/2026-03-28-remove-publish-and-library-rating-column-design.md`](../specs/2026-03-28-remove-publish-and-library-rating-column-design.md)

---

## File map

| File | Vai trò |
|------|---------|
| `reader/vault/reactionsMarkdown.ts` | `averageReactionStats`, helper sao chỉ-visual (vd. `ratingStarsOnly`) dùng chung với `ratingToStarLine` |
| `reader/vault/service.ts` | `listCaptures`: sau mỗi item, đọc `.comment`, gắn `reaction_avg`, `reaction_count`; cập nhật `CaptureListItem` export |
| `reader/src/types.ts` | Đồng bộ `CaptureListItem` với service |
| `reader/src/main.ts` | FM skip `publish`, bỏ pill meta/detail, card tags, sidebar bullet; bảng + skeleton + loading header: cột Đánh giá + `formatLibraryRatingCell(r)` |
| `reader/src/style.css` | Class skeleton cột rating (đổi tên `--status` → `--rating` hoặc tái dùng width) |
| `reader/tests/reactionsMarkdown.test.ts` | Thêm test `averageReactionStats` (+ stars-only nếu cần) |

---

## Task 1: `averageReactionStats` + sao chỉ-visual

**Files:** `reader/vault/reactionsMarkdown.ts`, `reader/tests/reactionsMarkdown.test.ts`

- [ ] **Step 1:** Thêm `averageReactionStats(entries: ParsedReactionEntry[]): { avg: number | null; count: number }` — `count` = số entry có `rating` hợp lệ; `avg` = arithmetic mean hoặc `null` khi `count === 0`.
- [ ] **Step 2:** Refactor: tách phần `★…☆` từ `ratingToStarLine` thành hàm ví dụ `ratingStarsOnly(rating: number): string` (integer 1–5, cùng validation), `ratingToStarLine` = `ratingStarsOnly` + `` ` (${rating}/5)` ``.
- [ ] **Step 3:** Vitest: rỗng; một entry; nhiều entry; trung bình không nguyên (assert `avg`).
- [ ] **Step 4:** `pnpm vitest run reader/tests/reactionsMarkdown.test.ts`

- [ ] **Step 5:** Commit `feat(reader): average reaction stats and stars-only helper`

---

## Task 2: `listCaptures` + types

**Files:** `reader/vault/service.ts`, `reader/src/types.ts`

- [ ] **Step 1:** Mở rộng `CaptureListItem`: `reaction_avg: number | null`, `reaction_count: number` (0 khi không có dữ liệu).
- [ ] **Step 2:** Trong vòng lặp `listCaptures`, sau khi build item: `captureDir = path.join(capDir, id)`, `getCommentPath(captureDir)` → đọc UTF-8; nếu OK → `parseReactionsMarkdown` → `averageReactionStats`; catch/`ENOENT` → null/0.
- [ ] **Step 3:** Đồng bộ `reader/src/types.ts` (field names giống service).
- [ ] **Step 4:** `cd reader && pnpm exec tsc --noEmit`

- [ ] **Step 5:** Commit `feat(reader): listCaptures reaction average from vault comment file`

---

## Task 3: UI — gỡ publish + cột Đánh giá

**Files:** `reader/src/main.ts`, `reader/src/style.css`

- [ ] **Step 1:** `FM_SKIP_IN_GRID`: thêm `'publish'`.
- [ ] **Step 2:** `renderCaptureDetail` meta: bỏ biến `publish` và mảng `metaParts` chứa pill publish/private (giữ time, source, fetch, link nguồn).
- [ ] **Step 3:** `renderHome` cards: bỏ `pub` / `<span class="tag">publish|private</span>`; giữ `youtube` tag khi có.
- [ ] **Step 4:** `sideCaptures`: thay bullet `publish:false` bằng gợi ý trung lập (vd. chỉ “Refresh reader sau khi sửa note” hoặc gợi ý về vault path) — **không** nhắc publish.
- [ ] **Step 5:** Helper `formatLibraryRatingCell(r: CaptureListItem): string`: nếu `reaction_avg == null` hoặc `reaction_count === 0` → `—` (hoặc `<span class="fm-value-empty">—</span>` thống nhất bảng); else `ratingStarsOnly(clamp(round(reaction_avg)))` + khoảng trắng + `reaction_avg.toFixed(1)` — escape text khi nhúng vào HTML.
- [ ] **Step 6:** `renderCapturesTable`: `<th>Trạng thái</th>` → **Đánh giá**; `<td>` pill → innerHTML từ helper (chuỗi an toàn: chỉ số và ký tự sao đã kiểm soát).
- [ ] **Step 7:** Skeleton `skeletonTableRowsHtml` + loading view `view === 'captures'`: đổi `<th>Trạng thái</th>` → **Đánh giá**; CSS class `skeleton-row__bar--status` → `--rating` (cập nhật selector trong `style.css`, width ~4–5rem nếu cần).
- [ ] **Step 8:** Kiểm tra tay: `#/captures`, vault có/không `.comment`.

- [ ] **Step 9:** Commit `feat(reader): remove publish UI and add library rating column`

---

## Task 4: Docs + verification

- [ ] **Step 1:** Nếu `docs/reader.md` hoặc `reader/README.md` mô tả cột Trạng thái / publish — cập nhật một đoạn ngắn.
- [ ] **Step 2:** `cd reader && pnpm exec tsc --noEmit && pnpm exec vitest run`
- [ ] **Step 3:** Từ root: `pnpm test` (nếu CI gồm reader).

- [ ] **Step 4:** Commit doc/chore nếu có thay đổi; hoặc gộp vào task 3 nếu chỉ README nhỏ.

---

## Done khi

- Không còn UI publish/private ở các vị trí spec §2; frontmatter không hiện `publish`.
- Bảng Thư viện có cột Đánh giá đúng format B; API trả `reaction_avg` / `reaction_count`.
- Test parser/stats pass; typecheck reader pass.
