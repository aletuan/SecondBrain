# Design: Re-ingest capture in place (CLI + Reader)

**Ngày:** 2026-03-28  
**Trạng thái:** Đã chốt qua brainstorming — chờ triển khai / implementation plan

**Liên quan:** `cli/src/ingest/runIngest.ts`, `cli/src/vault/writer.ts`, `cli/src/cli.ts`, `reader/vault/runIngestCli.ts`, `reader/vault/apiMiddleware.ts`, `reader/src/main.ts` (capture detail).

---

## 1. Vấn đề / mục tiêu

Trên màn **chi tiết capture** trong Reader, người dùng cần **chạy lại ingest** cho **đúng thư mục capture đang xem**, ghi đè **nội dung vault** (source/note/assets theo pipeline hiện tại), có **xác nhận** trước khi thực hiện.

**Ràng buộc đã chốt (brainstorming):**

| Quyết định | Lựa chọn |
|------------|----------|
| Phạm vi ghi | **A — In-place only:** luôn ghi vào **`Captures/<id>/`** đang mở, không dựa vào việc `ingest <url>` tự tính lại tên thư mục (tránh trùng lặp / thư mục mới khi ngày hoặc slug thay đổi). |
| Cơ chế CLI | **1 + 2:** (1) cờ trên lệnh `ingest`; (2) subcommand **`reingest`** gọi cùng lõi. |

---

## 2. Hai lệnh CLI (cùng lõi)

### 2.1 `ingest <url> --capture-dir <abs>`

- **Ý nghĩa:** Fetch + pipeline giống ingest hiện tại, nhưng **ghi kết quả vào thư mục capture đã có** (ghi đè), thay vì tạo `YYYY-MM-DD--slug--hash` mới từ `writeCapture` mặc định.
- **Ràng buộc đường dẫn:** `<abs>` phải là thư mục con hợp lệ của vault, dạng `…/vault/Captures/<captureId>/` (validate `safeCaptureId` / prefix `Captures` giống các API reader).
- **Tương thích:** Giữ `--progress-json` / stderr SSE như hiện tại cho Reader.

### 2.2 `reingest --capture <dir>`

- **Ý nghĩa:** Không cần truyền URL trên dòng lệnh: **đọc `url` từ frontmatter** của note (hoặc source) đã có trong `<dir>` (cùng quy ước `getCaptureFiles` / `stripFrontmatter`).
- **Hành vi nội bộ:** Resolve `captureDir` → đọc URL → gọi **cùng hàm** với `ingest <url> --capture-dir <resolvedAbs>`.
- **Lỗi:** Thiếu URL, URL không hợp lệ → exit ≠ 0, thông báo rõ.

---

## 3. Semantics ghi đè trong vault

### 3.1 File bị thay thế / tạo lại

- **`*.source.md` / `*.note.md`:** Ghi đè nội dung theo bundle mới + bước enrich/tags giống luồng `runIngest` hiện tại (dùng **đúng basename** đã có từ `getCaptureFiles(captureDir)` — **không đổi tên file** theo slug mới để tránh mồ côi file trong cùng thư mục).
- **`assets/`:** Coi là **có thể thay thế toàn bộ nội dung** cho phần ảnh ingest: trước khi tải ảnh mới, **xóa các file ảnh cũ** trong `assets/` (hoặc xóa cả thư mục rồi tạo lại) để tránh dư ảnh từ lần ingest trước. *(Chi tiết implementation: cùng contract với `downloadImagesToAssets`.)*

### 3.2 File được giữ (không xóa bởi re-ingest)

| File / pattern | Lý do |
|----------------|--------|
| **`{slug}.comment`** | Timeline đánh giá Reader — dữ liệu người dùng, không thuộc pipeline fetch. |
| **`milestones.yaml`** (nếu có) | Người dùng / tool có thể đã chỉnh; ingest mặc định không ghi đè. *(Nếu sau này có lệnh “regenerate milestones”, tách khỏi re-ingest.)* |

### 3.3 Tên thư mục capture

- **Không đổi** `captureId` / tên folder (vẫn `YYYY-MM-DD--slug--hash` cũ). Wikilinks và URL Reader `#/capture/<id>` ổn định.

### 3.4 URL và canonical

- Re-ingest dùng URL đọc từ vault (hoặc URL truyền vào `ingest --capture-dir`). Nếu nguồn đổi `canonicalUrl` nhẹ, pipeline vẫn fetch theo URL đó; **hash 6 ký tự trong tên folder không cần khớp** lại URL mới (đã chấp nhận từ thiết kế “giữ folder”).

---

## 4. Reader (API + UI)

### 4.1 API

- **Endpoint gợi ý:** `POST /api/captures/:id/reingest` (hoặc `/api/ingest/recapture` với body `{ captureId }` — chọn một, ưu tiên RESTful dưới `/api/captures/`).
- **Điều kiện:** Cùng gate `READER_ALLOW_INGEST` như ingest hiện tại; resolve `vaultRoot` + `Captures/<id>/`.
- **Thực thi:** Spawn CLI tương tự `runIngestCli`, nhưng tham số là **`reingest --capture <absDir>`** hoặc `ingest <url> --capture-dir …` sau khi đọc URL server-side (trùng logic CLI `reingest` để một nguồn sự thật).
- **SSE / progress:** Tái sử dụng `--progress-json` + stream nếu đã có pattern job (hoặc mở rộng tối thiểu: ít nhất stdout/stderr cuối khi lỗi).

### 4.2 UI (capture detail)

- **Vị trí:** Thanh toolbar chi tiết capture (cạnh nút hiện có), nhãn kiểu **“Ingest lại”** / **“Làm mới từ nguồn”** (copy chốt khi implement).
- **Luồng:** Click → **hộp thoại xác nhận** (tiếng Việt): cảnh báo ghi đè note/source/assets; nhắc giữ file `.comment`; nút Hủy / Xác nhận.
- **Trạng thái:** Disable nút khi đang chạy; hiển thị tiến trình (reuse pattern agent step / thông báo lỗi giống ingest trang chủ).
- **Sau thành công:** Reload chi tiết capture (fetch lại `GET /api/captures/:id`) hoặc điều hướng cùng hash.

### 4.3 UI/UX (frontend-design)

- Giữ **nhất quán** với reader hiện tại (mono, token màu, không “AI gradient” mặc định).
- Nút mang tính **destructive secondary** (viền / màu cảnh báo nhẹ), không cạnh tranh với CTA chính.
- Modal: focus trap, đóng bằng Esc, `aria-modal`, label rõ ràng.

---

## 5. Rủi ro & lỗi

| Tình huống | Hành vi |
|------------|---------|
| Ingest tắt | 403 + gợi ý `READER_ALLOW_INGEST` / CLI |
| Thiếu URL trong frontmatter | Lỗi có message tiếng Việt |
| Ingest đang chạy / giới hạn job | 503 hoặc queue — đồng bộ với policy hiện tại của `/api/ingest/start` |
| Lỗi giữa chừng | Không xóa `.comment`; tối đa ghi log; nếu ghi part-way, ghi rõ trong tài liệu triển khai (ưu tiên không để source rỗng mà không báo) |

---

## 6. Kiểm thử (gợi ý)

- Unit / integration: CLI `reingest` với thư mục tạm vault có URL trong note → ghi đè file, giữ `.comment`.
- Reader: mock API hoặc e2e nhẹ: nút chỉ hiện khi `ingestAvailable`.

---

## 7. Ngoài phạm vi (v1)

- Đổi tên thư mục capture sau khi đổi title.
- Re-ingest hàng loạt từ thư viện.
- Tự động merge milestones từ transcript mới (lệnh riêng).

---

## 8. Bước tiếp theo

1. Duyệt spec này (bạn).  
2. Viết **implementation plan** (`docs/superpowers/plans/2026-03-28-reingest-capture.md`) — gọi skill **writing-plans** khi bắt đầu code.  
3. Triển khai: **Brain CLI + writer** trước, sau đó **reader API + UI**.
