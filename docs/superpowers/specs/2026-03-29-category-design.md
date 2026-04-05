# Design: Category taxonomy for captures (auto + reader-web)

**Ngày:** 2026-03-29  
**Trạng thái:** Đã chốt qua brainstorming — implementation plan: `docs/superpowers/plans/2026-03-29-category.md`

**Liên quan:** `cli/src/ingest/runIngest.ts`, `cli/src/llm/enrich.ts`, `cli/src/vault/writer.ts`, `reader-web/src/main.ts` (frontmatter + capture detail).

---

## 1. Vấn đề / mục tiêu

Khi **ingest**, capture cần được **gán category** (multi-label) theo **taxonomy cố định**, dựa trên **phân tích nội dung** (LLM). Người dùng có thể **sửa lại trong reader-web** nếu sai. **Không** có lệnh batch re-classify trong phạm vi này (chỉ tại thời điểm ingest khi có API key).

---

## 2. Quyết định đã chốt (brainstorming)

| Chủ đề | Lựa chọn |
|--------|----------|
| Taxonomy | **A:** Danh sách cố định trong repo (ví dụ Machine Learning, Data Engineering, Management). |
| Cardinality | **Multi-label:** `categories` là mảng các `id`. |
| Không khớp / không chắc | Có thể **không** gán category (`[]` hoặc bỏ key); khi không chắc có thể dùng id **`uncategorized`** (label hiển thị kiểu “Khác / Chưa phân loại”) trong cùng file config. |
| Chỉnh tay | **B:** Chủ yếu **reader-web** — UI chọn/bỏ, ghi lại `*.note.md`. |
| Kích hoạt auto | **i:** Chỉ khi **ingest** (capture mới hoặc re-ingest ghi đè). |
| Re-ingest | **Ghi đè:** mỗi lần ingest/re-ingest chạy phân loại lại; **category do tay sửa trước đó không được giữ** (chấp nhận). |

---

## 3. Cấu hình taxonomy

- **`config/categories.example.yaml`** (commit): danh sách mục, mỗi mục tối thiểu:
  - **`id`:** slug ổn định (ASCII, ví dụ `machine-learning`, `uncategorized`).
  - **`label`:** chuỗi hiển thị (có thể có khoảng trắng / Unicode).
- **`config/categories.yaml`:** bản local (gitignore, cùng mô hình `config/routing.yaml`); copy từ example nếu chưa có.
- Loader (Node): resolve path từ cwd/env nhất quán với các config khác; lỗi parse → fail rõ ràng hoặc fallback tùy policy trong plan (ưu tiên fail fast khi bật feature).

---

## 4. Lưu trữ trong vault

- **Chỉ `*.note.md`** (không bắt buộc mirror sang `*.source.md`).
- Frontmatter key: **`categories`** — YAML array of strings, mỗi phần tử là **`id`** đã khai báo trong taxonomy (sau khi validate).

Ví dụ:

```yaml
categories: [machine-learning, data-engineering]
```

- Thiếu key hoặc `categories: []` = không gán category (hợp lệ).
- **`uncategorized`** là một `id` bình thường trong taxonomy; LLM được hướng dẫn dùng khi không chắc (thay vì bịa id khác).

---

## 5. Pipeline ingest (tự động)

- **Điều kiện:** `OPENAI_API_KEY` có — cùng cổng với enrich/tags hiện tại (`runIngest`).
- **Đầu vào phân loại:** Cùng kiểu excerpt đã dùng cho enrich/tags (body `source.md` sau khi strip frontmatter, có thể truncate giống `truncateSourceForEnrich` hoặc giới hạn tương đương — chi tiết trong plan).
- **Cách làm đề xuất:** LLM **riêng** (prompt JSON), map sang mảng `id`, **lọc** chỉ `id` ∈ taxonomy; loại trùng; thứ tự ổn định (sort theo id hoặc thứ tự trong file config).
- **Ghi file:** Hàm **`setCategoriesInNoteFrontmatter(notePath, ids)`** — **set/replace** key `categories` (idempotent, không nhân đôi key). Chạy trong cùng nhánh async với enrich/tags nếu phù hợp (ví dụ `Promise.all` với `extractTags`), thứ tự commit disk: đảm bảo không làm hỏng frontmatter trước khi `enrichNote` append body (hiện enrich **append** sau frontmatter — category nằm trong frontmatter block đầu file).
- **Không có API key:** Không ghi `categories` tự động (user có thể thêm sau trong reader-web).

### 5.1 Re-ingest

- **Overwrite:** Mỗi lần ingest hoàn tất bước LLM, `categories` trong note được **ghi đè** bởi kết quả phân loại mới (không merge với chỉnh tay trước đó).

---

## 6. Reader-web

- Đọc `categories` từ frontmatter note (cùng parser/scalar style với `tags`).
- UI: multi-select / chip theo **label** từ taxonomy (load từ file config phía server hoặc bundle dev — một nguồn với CLI).
- Lưu: cập nhật YAML trong note, giữ các field khác; validate `id` trước khi ghi (client hoặc API).
- Hiển thị list/thư viện: có thể lọc theo category ở phase sau (YAGNI nếu chưa trong plan tối thiểu).

---

## 7. LLM: hành vi lỗi / an toàn

- Response không parse được → coi như **không phân loại** (`[]` hoặc không ghi — chốt trong plan; ưu tiên không ghi hoặc `[]`).
- Id lạ sau lọc → bỏ; nếu mảng rỗng sau lọc → tương đương không gán (hoặc chỉ `uncategorized` nếu prompt yêu cầu “luôn có fallback” — mặc định đề xuất: **không** ép `uncategorized` khi parse hỏng, để phân biệt “lỗi” vs “thật sự trống”).

---

## 8. Kiểm thử (TDD)

- Unit: load taxonomy, validate & normalize mảng id, `setCategoriesInNoteFrontmatter` round-trip trên file mẫu.
- Mock LLM: JSON cố định → kết quả frontmatter mong đợi.
- reader-web: test phần pure (parse/format) nếu tách được; E2E tùy độ ưu tiên.

---

## 9. Phạm vi ngoài (YAGNI)

- CLI `categorize` / quét batch toàn vault.
- Đồng bộ category sang `source.md`.
- Khóa `categories` khi re-ingest.
