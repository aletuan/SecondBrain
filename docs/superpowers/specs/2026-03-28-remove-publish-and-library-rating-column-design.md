# Design: Gỡ publish khỏi reader UI + cột Đánh giá (trung bình) trong Thư viện Captures

**Ngày:** 2026-03-28  
**Trạng thái:** Đã duyệt — implementation plan: [`docs/superpowers/plans/2026-03-28-remove-publish-and-library-rating-column.md`](../plans/2026-03-28-remove-publish-and-library-rating-column.md) (nhánh gợi ý: `feature/remove-publish`)

**Liên quan:**  
- Spec reactions vault: [`2026-03-27-reader-reactions-vault-comment-design.md`](./2026-03-27-reader-reactions-vault-comment-design.md) (`{slug}.comment`, `parseReactionsMarkdown`).  
- `reader-web/vault/service.ts` (`listCaptures`, `getCommentPath`), `reader-web/vault/reactionsMarkdown.ts`, `reader-web/src/main.ts`, `reader-web/src/types.ts`.

---

## 1. Mục tiêu

1. **Không còn hiển thị “publish / private”** trong reader-web (pill meta, cột thư viện, tag trên card trang chủ, v.v.), và **ẩn khóa `publish` trong bảng Frontmatter** (đã chọn **A** — skip giống `url` / `fetch_method`).
2. **Thay cột “Trạng thái”** trong bảng Thư viện Captures bằng cột **“Đánh giá”**, hiển thị **trung bình vote** từ file `{slug}.comment` (định dạng **B**: **sao rút gọn + số** trong cùng ô).

**Phi mục tiêu (v1):** Sắp xếp theo điểm; chỉnh ingest/CLI để ghi `publish`; thay đổi schema API lớn (gỡ hẳn field `publish` khỏi JSON).

---

## 2. Phần A — Gỡ publish (UI only)

**Tiếp cận:** Chỉ thay **presentation**; giữ `publish` trong payload `GET /api/captures` và trong `listCaptures()` như hiện tại (ít phá vỡ; có thể dọn field sau).

| Vị trí | Hành động |
|--------|-----------|
| Frontmatter (note) | Thêm `publish` vào tập skip (`FM_SKIP_IN_GRID` hoặc tương đương) — không render dòng `publish`. |
| Chi tiết capture — dòng meta | Bỏ pill publish/private. |
| Thư viện — cột cũ “Trạng thái” | **Thay** bằng cột Đánh giá (xem §3); không còn pill publish/private. |
| Trang Ingest — card “Captures gần đây” | Bỏ tag `publish` / `private`; giữ tag `youtube` khi có. |
| Sidebar Thư viện (`sideCaptures`) | Bỏ/replace bullet nhắc `publish:false`. |
| Copy trợ giúp ingest | Bỏ hoặc sửa dòng nhắc `publish:false` nếu còn. |
| README reader-web | Cập nhật nếu đề cập cột trạng thái / publish. |

---

## 3. Phần B — Cột Đánh giá (trung bình), định dạng B

### 3.1 Nguồn dữ liệu

- Mỗi capture có thể có file **`{slug}.comment`** (cùng quy ước `getCommentPath` như spec reactions).
- Dùng **`parseReactionsMarkdown`** → danh sách `{ rating, at, text? }`.
- **Trung bình:** `avg = sum(rating) / n` với `n` = số entry có `rating` hợp lệ; làm tròn **hiển thị** số **một chữ số thập phân** (ví dụ `4.3`).
- **Không có file**, file rỗng, hoặc **không có entry hợp lệ:** hiển thị placeholder **—** (hoặc `–`, thống nhất với bảng).

### 3.2 Định dạng B (đã chốt)

Trong **một ô** cùng lúc:

1. **Chuỗi sao rút gọn** — **5 ký tự ★/☆** (không kèm ` (n/5)` vì số thập phân hiển thị bên cạnh). Helper **`ratingStarsOnly(b)`** (hoặc tương đương) với `b = Math.round(avg)` giới hạn **1–5** — refactor từ `ratingToStarLine` (xem plan).
2. **Số** — `avg` format **một chữ số thập phân** (locale invariable: dấu `.`), ví dụ `4.3`.

Thứ tự gợi ý trong ô: **sao** rồi **khoảng trắng** rồi **số** (ví dụ `★★★★☆ 4.3`). Khoảng cách / `font-size` do CSS thống nhất với bảng.

**Ghi chú:** Có thể có lệch nhẹ giữa sao (làm tròn nguyên) và số thập phân — chấp nhận trong v1; có thể tinh chỉnh sau (floor cho sao, v.v.).

### 3.3 API / model

- Mở rộng **`CaptureListItem`** (và payload `GET /api/captures`) với các field tối thiểu, ví dụ:
  - `reaction_avg: number | null` — `null` khi không có dữ liệu;
  - `reaction_count: number` — `0` khi không có entry.
- Tên field có thể rút gọn (`rating_avg` / `rating_n`) miễn **thống nhất** trong types + `listCaptures`.

### 3.4 Server: `listCaptures`

- Sau khi đọc note và build item như hiện tại, với mỗi capture:
  - Resolve `commentPath` = `getCommentPath(captureDir)`.
  - Nếu đọc được UTF-8 → `parseReactionsMarkdown` → tính avg + count.
  - Nếu `ENOENT` hoặc lỗi đọc → `reaction_avg: null`, `reaction_count: 0`.
- **Hiệu năng:** Một lần đọc thêm tối đa **một file nhỏ** mỗi capture (chấp nhận cho vault cá nhân). Nếu sau này vault rất lớn, có thể tối ưu (cache, index) — ngoài v1.

### 3.5 UI bảng Thư viện

- Đổi `<th>` từ **Trạng thái** → **Đánh giá** (hoặc tương đương tiếng Việt ngắn).
- Ô nội dung: render theo §3.2; `esc` / class để tránh HTML injection (sao và số là dữ liệu server-derived).
- **Skeleton** loading: cột mới thay cột status (bỏ cột skeleton status cũ nếu có).
- **Tìm kiếm** (`#lib-search`): có thể giữ filter theo `textContent` hàng — không bắt buộc đổi logic.

### 3.6 Hàm tiện ích

- Thêm **`averageReactionStats(entries: ParsedReactionEntry[]): { avg: number | null; count: number }`** trong `reactionsMarkdown.ts` (hoặc `service.ts`) — **một nơi**, dễ test Vitest (trung bình, rỗng, một entry).

---

## 4. Kiểm thử gợi ý

- Unit: `averageReactionStats` với 0, 1, nhiều entry; làm tròn hiển thị.
- Thủ công: vault có/không `.comment`; bảng hiển thị đúng placeholder vs sao+số.

---

## 5. Bước tiếp theo

1. ~~Duyệt spec này.~~  
2. ~~Viết implementation plan~~ — [`2026-03-28-remove-publish-and-library-rating-column.md`](../plans/2026-03-28-remove-publish-and-library-rating-column.md).  
3. Implement trên nhánh `feature/remove-publish` (hoặc tách PR: remove publish trước, rating column sau — tùy team).
