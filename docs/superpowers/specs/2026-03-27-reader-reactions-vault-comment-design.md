# Design: Đánh giá bài (1–5 sao) + comment tùy chọn — lưu trong vault `{slug}.comment`

**Ngày:** 2026-03-27  
**Trạng thái:** Đã duyệt (brainstorming) — implementation plan: [`docs/superpowers/plans/2026-03-27-reader-reactions-vault-comment.md`](../plans/2026-03-27-reader-reactions-vault-comment.md)

**Liên quan:** `reader/vault/service.ts` (resolve `*.note.md` / `*.source.md`), `reader/vault/apiMiddleware.ts`, `reader/src/main.ts` (capture detail).

---

## 1. Vấn đề / mục tiêu

Người đọc muốn **chấm điểm 1–5 sao** cho từng capture và **ghi chú tùy chọn** sau mỗi lần đánh giá, với **lịch sử theo thời gian** (append), không ghi đè bản cũ.

**Ràng buộc đã chốt (brainstorming):**

| Quyết định | Lựa chọn |
|------------|----------|
| Lưu trữ | **Trong vault** — không Supabase |
| Mô hình dữ liệu | **Timeline / lịch sử** — mỗi lần gửi = một entry mới |
| Comment | **Tùy chọn** — có thể chỉ gửi sao |
| Vị trí file | Cùng thư mục `Captures/<date>--slug--hash/`, file **`{slug}.comment`** |
| Định dạng file | **Markdown (F2)** — đọc được trong Obsidian, có quy ước máy đọc |

---

## 2. Tên file và slug

- Thư mục capture: `YYYY-MM-DD--<slug>--<shortid>` (đã có trong vault).
- **Basename** của note/source trong repo hiện tại: `{slug}.note.md`, `{slug}.source.md` (xem `getCaptureFiles` trong `reader/vault/service.ts`).
- File phản hồi đọc giả: **`path.join(captureDir, `${slug}.comment`)`** trong đó `slug` là **cùng prefix** với cặp `.note.md` / `.source.md` (suy ra từ tên file note đã resolve).

**Ghi chú vault tùy biến:** Nếu bản thân vault dùng extension khác (ví dụ chỉ `.note` không `.md`), triển khai v1 vẫn dựa trên slug từ **`*.note.md` hoặc fallback `note.md`** như service hiện tại; mở rộng thêm nhánh `*.note` nếu cần — không chặn thiết kế sản phẩm, chỉ thêm resolver.

---

## 3. Quy ước Markdown trong `{slug}.comment`

### 3.1 Cấu trúc tổng thể

- File UTF-8, có thể **bắt đầu** bằng một dòng tiêu đề tùy chọn (khuyến nghị một dòng cố định để người dùng nhận ra file):

```markdown
# Reader reactions
```

- Mỗi **entry** gồm (theo thứ tự):
  1. Dòng trống (trừ entry đầu sau tiêu đề file — có thể bỏ qua linh hoạt khi parse).
  2. `### <ISO-8601>` — **bắt buộc** cho parser; timestamp **múi giờ địa phương hoặc offset** (ví dụ `2026-03-27T14:32:01+07:00`).
  3. Dòng trống.
  4. Dòng **`**Đánh giá:**`** theo sau là biểu diễn sao + phân số, ví dụ: `★★★★☆ (4/5)` — **chuỗi cố định** `Đánh giá:` (tiếng Việt) để parser ổn định.
  5. Nếu có comment: một đoạn tự do **sau một dòng trống** (có thể nhiều đoạn). Nếu không có comment: **không thêm** đoạn body (hoặc chỉ hai dòng heading + đánh giá).

- **Delimiter** giữa các entry (sau entry thứ nhất trở đi): một dòng chỉ chứa `---` (horizontal rule Markdown), rồi xuống dòng trước `###` tiếp theo.

### 3.2 Ví dụ (hai entry, entry thứ hai không comment)

```markdown
# Reader reactions

### 2026-03-27T10:00:00+07:00

**Đánh giá:** ★★★★★ (5/5)

Hay, sẽ đọc lại.

---

### 2026-03-27T15:20:00+07:00

**Đánh giá:** ★★★☆☆ (3/5)
```

### 3.3 Sao Unicode

- Map `rating` 1–5 → chuỗi 5 ký tự `★` / `☆` (ví dụ 4 → `★★★★☆`).

### 3.4 Parse (máy)

- Split theo delimiter `---` **hoặc** theo regex `^### ` (multiline) — cần một module parse thống nhất trả về `{ at: string, rating: number, text?: string }[]`.
- `rating` suy ra từ phần `(n/5)` trong dòng **Đánh giá** (ưu tiên) hoặc đếm `★`.
- Comment = toàn bộ nội dung sau khối đánh giá của entry, trim; rỗng → `undefined`.

---

## 4. API (reader middleware)

Tất cả chỉ hoạt động khi server có quyền đọc/ghi vault (cùng mô hình các route `/api/captures/...`).

| Phương thức | Đường dẫn đề xuất | Hành vi |
|-------------|-------------------|---------|
| `GET` | `/api/captures/:id/reactions` | Đọc `{slug}.comment` nếu có; trả JSON `{ entries: [...] }` hoặc `{ entries: [], raw?: "" }`. `404` nếu capture không tồn tại; file thiếu → `entries: []`. |
| `POST` | `/api/captures/:id/reactions` | Body JSON `{ "rating": 1-5, "comment"?: string }`. Validate; chuẩn hóa text (trim, max length, tùy chọn chặn chỉ khoảng trắng). Đọc file hiện tại (nếu có), **append** entry mới theo mục 3, ghi lại. Trả `{ ok: true }` hoặc lỗi 4xx/5xx. |

**Bảo mật / vận hành:**

- Giới hạn độ dài `comment` (ví dụ 4k–8k ký tự — chốt trong plan).
- Không chấp nhận HTML thô từ client làm “an toàn”; khi render trong DOM dùng escape hoặc pipeline text → HTML đã có sẵn (`esc` / prose).
- **Đồng thời:** giả định một người; hai tab gửi cùng lúc có thể mất mất entry (read-modify-write). Ghi nhận trong spec: **best-effort**; tùy chọn sau: file lock hoặc merge an toàn hơn.

---

## 5. UI (reader) — triển khai sau, áp dụng frontend-design

- Vị trí: **cuối** view chi tiết capture (sau khối `note` / phù hợp TOC), section riêng ví dụ “Phản hồi”.
- Điều khiển: chọn **1–5 sao**, textarea **tùy chọn**, nút **Gửi**.
- Dưới đó: **timeline** các entry (mới nhất trên cùng hoặc dưới — chốt một kiểu trong implement; mặc định đề xuất **mới nhất trên cùng** sau khi sort theo `at`).
- Trạng thái: loading / lỗi / empty state.

---

## 6. Phi mục tiêu (v1)

- Đồng bộ giữa nhiều thiết bị qua Git (chỉ file vault; không real-time).
- Chỉnh sửa / xóa entry cũ trong UI (có thể sửa tay file trong Obsidian).
- Tổng hợp điểm trung bình toàn vault.

---

## 7. Kiểm thử gợi ý

- Unit test parser Markdown (chuỗi mẫu mục 3.2 + edge: không comment, nhiều đoạn).
- Test tích hợp nhẹ middleware: POST rồi GET trả đúng số entry và `rating`.

---

## 8. Bước tiếp theo

1. Plan triển khai: `docs/superpowers/plans/2026-03-27-reader-reactions-vault-comment.md`.
2. Implement theo plan; UI dùng skill **frontend-design** khi code giao diện.
