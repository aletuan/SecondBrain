# Yêu cầu thay đổi: đồng bộ tiến trình ingest (SSE) — nhánh `feature/sse`

**Trạng thái:** Bản nháp để bạn xem xét và xác nhận trước khi triển khai code.  
**Ngày:** 2026-03-21  
**Liên quan:** Reader Web (`reader-web`), API vault (`reader-web/vault`), pipeline Brain (`src/ingest/runIngest.ts`, CLI `src/cli.ts`).

---

## 1. Bối cảnh

- Reader Web gọi **`POST /api/ingest`** một lần; server chạy **`runIngestCli`** (spawn `node …/tsx … ingest …`) và chờ đến khi tiến trình kết thúc mới trả JSON (`captureDir`, v.v.).
- Panel **Agent** trên UI dùng **`startIngestAgentStepTicker`**: các bước (Fetch, Vault, Dịch transcript, Enrich) được đánh dấu theo **thời gian cố định (setInterval)** — **không** phản ánh thứ tự / thời điểm thật của pipeline trong `runIngest`.
- Người dùng muốn **đồng bộ trạng thái** giữa UI và luồng ingest thật; hướng đề xuất là **Server-Sent Events (SSE)** hoặc tương đương (stream sự kiện một chiều server → browser).

---

## 2. Vấn đề cần giải quyết

| Hiện trạng | Mong muốn |
|------------|-----------|
| Chỉ biết “đang chạy” cho đến khi HTTP trả về | Thấy bước đang active / done / error khớp pipeline |
| Ticker giả lập tiến độ | Sự kiện do server phát ra theo mốc thật |
| Không có log tiến trình có cấu trúc từ CLI | Có **sự kiện có schema** (JSON) để map sang UI |

---

## 3. Mục tiêu (scope)

1. **Phát sự kiện tiến trình** từ phía server trong lúc ingest đang chạy (ít nhất: bắt đầu / kết thúc từng phase chính, lỗi rõ ràng).
2. **Client** (Reader) dùng **`EventSource`** hoặc `fetch` + `ReadableStream` để nhận và cập nhật panel Agent **không** dùng ticker giả.
3. **Giữ tương thích:** khi SSE không khả dụng hoặc lỗi, vẫn có thể fallback về hành vi hiện tại (chờ `POST` hoặc hiển thị trạng thái chung).

**Ngoài scope (giai đoạn 1):** hiển thị phần trăm chi tiết, log đầy đủ stdout cho user, multi-tab ingest song song (có thể để giai đoạn sau).

---

## 4. Ánh xạ phase pipeline ↔ bước UI

Theo `src/ingest/runIngest.ts`, thứ tự logic gợi ý:

| Phase (mã) | Ý nghĩa | Bước UI (`data-step`) |
|------------|---------|------------------------|
| `route` | Đọc routing, chọn strategy | Có thể gộp vào “Fetch” hoặc sự kiện `fetch_start` |
| `fetch` | Adapter (HTTP / Apify / YouTube / X) | `fetch` |
| `translate` | `translateTranscriptSegments` (chỉ YouTube + điều kiện) | `translate` (ẩn nếu không phải YouTube) |
| `vault` | `writeCapture` + `downloadImagesToAssets` | `vault` |
| `enrich` | `enrichNote` (LLM) | `llm` |
| `done` | Trả `captureDir` | Đánh dấu hoàn tất + link capture |

Cần thống nhất **một bảng enum** (ví dụ `IngestProgressPhase`) dùng chung giữa CLI / server / client (hoặc string literal ổn định trong JSON).

---

## 5. Phương án kiến trúc đề xuất

### 5.1. Luồng HTTP khuyến nghị

**Cách A — Một endpoint SSE gắn với job (dễ tách biệt, dễ hủy sau này):**

1. `POST /api/ingest/start` — body: `{ url, noLlm?, translateTranscript? }` — trả `{ jobId }` ngay (202 hoặc 200).
2. `GET /api/ingest/stream?jobId=…` — header `Content-Type: text/event-stream`, giữ kết nối mở, gửi các dòng SSE (`data: {JSON}\n\n`).
3. Server chạy ingest (spawn hoặc in-process) trong background; khi xong gửi sự kiện `done` hoặc `error` rồi đóng stream.

**Cách B — POST trả luôn stream (ít request hơn):**

- Client `fetch` với `Accept: text/event-stream` hoặc dùng body POST + response là SSE (cần cẩn thận proxy/cache; Vite dev proxy phải tắt buffer cho route này).

**Khuyến nghị cho Reader:** **Cách A** — tách `start` và `stream` rõ ràng, dễ set header và tránh một số hạn chế của `EventSource` với POST.

### 5.2. Nguồn sự kiện (cách lấy “phase thật”)

**Phương án 1 — Bổ sung tiến trình trong CLI (spawn giữ nguyên):**

- Thêm cờ ví dụ **`--progress-json`** (hoặc biến môi trường `BRAIN_INGEST_PROGRESS=1`): in **một dòng JSON trên stderr** mỗi khi đổi phase, ví dụ:
  - `{"type":"phase","phase":"fetch","status":"start"}`
  - `{"type":"phase","phase":"fetch","status":"done"}`
- `runIngestCli` hoặc middleware đọc **stderr theo dòng**, parse JSON, forward qua SSE.
- **Ưu:** Tách process, không cần Reader import trực tiếp `runIngest` từ repo Brain.  
- **Nhược:** Phải duy trì format JSON và test snapshot stderr.

**Phương án 2 — Gọi `runIngest` in-process trong middleware (khi `READER_BRAIN_ROOT` trỏ đúng repo):**

- Dynamic import `runIngest` (hoặc hàm bọc) với **callback / `AsyncGenerator`** báo phase.
- **Ưu:** Kiểm soát type chặt, không parse stderr.  
- **Nhược:** Ràng buộc version/build; phức tạp hơn với đường dẫn ESM.

**Đề xuất triển khai từng bước:** bắt đầu với **Phương án 1** (ít đụng bundler Reader), sau đó có thể refactor sang Phương án 2 nếu cần.

### 5.3. Định dạng sự kiện SSE (gợi ý)

Mỗi message một object JSON:

```json
{ "v": 1, "kind": "phase", "phase": "fetch", "state": "active" }
{ "v": 1, "kind": "phase", "phase": "fetch", "state": "done" }
{ "v": 1, "kind": "done", "captureDir": "/path/…", "captureId": "…" }
{ "v": 1, "kind": "error", "message": "…", "phase": "enrich" }
```

- `v`: version schema để client tương thích sau này.

---

## 6. Thay đổi file dự kiến (sau khi bạn duyệt)

| Khu vực | File / nội dung |
|---------|------------------|
| Brain CLI | `src/cli.ts`, `src/ingest/runIngest.ts` — hook phase + `--progress-json` (stderr) |
| Reader API | `reader-web/vault/apiMiddleware.ts` — route `start` + `stream`, không buffer body SSE |
| Reader spawn | `reader-web/vault/runIngestCli.ts` — tùy chọn streaming stderr |
| Vite / serve | `reader-web/vite.config.ts`, `reader-web/serve.ts` — proxy SSE no-buffer nếu cần |
| UI | `reader-web/src/main.ts` — `EventSource`, map `phase` → `ingestAgentSetStep`, bỏ ticker khi SSE OK |
| Docs | `docs/reader-web.md` — mô tả API mới, env, hạn chế |

---

## 7. Bảo mật và vận hành

- Ingest chỉ bật khi **`READER_ALLOW_INGEST`** (theo logic hiện tại); SSE **không** mở thêm quyền mới nếu vẫn dùng cùng điều kiện + `jobId` không đoán được (UUID).
- Tránh lộ đường dẫn tuyệt đối chi tiết trong sự kiện nếu deploy qua mạng; có thể chỉ gửi `captureId` tương đối vault.
- **Một job một kết nối:** giới hạn số job đồng thời (tùy chọn) để tránh spawn storm.

---

## 8. Kiểm thử

- Unit: parse dòng progress JSON từ stderr (fixture).
- Integration nhẹ: mock child process phát stderr, assert SSE chunks.
- Thủ công: ingest URL web + YouTube (có/không translate) và quan sát bước UI.

---

## 9. Tiêu chí chấp nhận (acceptance)

1. Trong lúc ingest chạy, bước **Fetch** chuyển **done** trước khi **Vault** bắt đầu (trừ khi lỗi sớm).
2. Với YouTube và bật dịch, bước **Dịch transcript** hiển thị **active** trong khoảng thời gian thật của `translateTranscriptSegments`, không theo timer cố định.
3. Lỗi pipeline (throw) → một sự kiện **error** + UI đánh dấu bước / trạng thái lỗi rõ.
4. Tắt SSE (feature flag) → hành vi giống hiện tại: chỉ `POST` và spinner / kết quả cuối.

---

## 10. Câu hỏi mở (cần bạn xác nhận)

1. **API:** Chọn **Cách A** (`/start` + `/stream?jobId=`) hay **Cách B** (một POST stream)?
2. **Nguồn phase:** Ưu tiên **Phương án 1** (stderr JSON từ CLI) hay muốn luôn **in-process** (Phương án 2)?
3. **Fallback:** Có cần giữ ticker làm “hoạt ảnh nhẹ” khi không có SSE, hay chỉ hiển thị “Đang chạy…” đơn giản?

---

## 11. Bước tiếp theo sau khi bạn duyệt

1. Trả lời / chỉnh sửa mục 10 trong PR hoặc reply.
2. Triển khai theo mục 5–6 trên nhánh `feature/sse`.
3. Cập nhật tài liệu Reader và chạy `pnpm test` / smoke ingest thủ công.

---

*Tài liệu này chỉ mô tả giải pháp đề xuất; chưa bao gồm diff code cho đến khi bạn xác nhận.*
