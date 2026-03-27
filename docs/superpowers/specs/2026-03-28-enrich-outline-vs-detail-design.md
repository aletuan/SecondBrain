# Design: Tóm tắt enrich — từ outline (liệt kê) sang mở chi tiết theo nguồn

**Ngày:** 2026-03-28  
**Trạng thái:** Đã duyệt — plan: `docs/superpowers/plans/2026-03-28-enrich-outline-vs-detail.md`

**Liên quan:** `src/llm/enrich.ts` (`ENRICH_SYSTEM_PROMPT`), `src/llm/enrichSource.ts` (`truncateSourceForEnrich`, `ENRICH_MAX_CHARS`).

---

## 1. Vấn đề (từ phản hồi)

Sau cải thiện vòng 1, với bài X dạng **nhiều ví dụ / nhiều luận điểm song song** (vd. [post minh họa](https://x.com/heynavtoor/status/2037200578842157462)), phần **Tóm tắt** vẫn có thể chỉ nêu **khung** kiểu: “có năm điểm cấu hình: system prompt, skills, MCP servers, sub-agents, hooks” **mà không giải thích** từng điển là gì, vai trò ra sao, hoặc **không gắn ví dụ** mà tác giả đã đưa trong nguồn.

Kỳ vọng người dùng: khi nguồn **đã có** định nghĩa/ví dụ cho từng mục, tóm tắt phải **phản ánh mức đó** (ít nhất một cây khái quát + **mở ngắn từng mục**), không dừng ở danh sách tên.

---

## 2. Nguyên nhân (phân tích)

| Yếu tố | Tác động |
|--------|----------|
| **“Viết súc tích”** trong `## Tóm tắt` | Model nén mạnh → ưu tiên một dòng gom nhiều khái niệm. |
| **Ý chính = tối đa 7 gạch phẳng** | Không bắt buộc **mỗi gạch** chứa *định nghĩa ngắn hoặc ví dụ từ nguồn* khi bài là dạng liệt kê có mở rộng. |
| **Ưu tiên “tên công cụ, số liệu”** | Dễ hiểu nhầm là “nhắc tên đủ” = đủ cụ thể. |
| **Cắt ngữ cảnh** (`ENRICH_MAX_CHARS`, head+tail) | Ví dụ nằm **giữa** bài rất dài có thể không vào excerpt → tóm tắt thiếu “thịt”. (Kiểm tra: đọc `source.md` capture.) |
| **Không set `max_tokens`** cho lần gọi enrich | Hiếm nhưng có thể cắt output nếu model sinh dài. |

---

## 3. Mục tiêu

- Khi nguồn có cấu trúc **nhiều mục đồng cấp** (danh sách, “N điểm”, từng đoạn minh họa), **Tóm tắt** phải:
  - Tránh **chỉ** lặp lại tên các mục trong **một** câu gom;
  - **Ưu tiên**: mỗi mục **quan trọng** trong nguồn có **ít nhất một cụm ngắn** (sau dấu “—” hoặc gạch con) diễn đạt **vai trò / ý chính / một ví dụ** **lấy từ nguồn**, không bịa.
- Vẫn **một lần gọi API** enrich (không bắt buộc hai pha trong v1).
- Giữ ràng buộc **chỉ từ nguồn**; nếu nguồn không giải thích mục X, không bịa định nghĩa.

**Phi mục tiêu (v1 spec này)**

- Thread X đầy đủ (vẫn ngoài scope).
- Digest.

---

## 4. Ba hướng tiếp cận

### A — Chỉnh `ENRICH_SYSTEM_PROMPT` (khuyến nghị)

- Thêm quy tắc rõ: **Nếu nguồn trình bày nhiều khái niệm/luận điểm song song và có mở rộng:** không gom tất cả vào một gạch chỉ liệt tên; **mỗi gạch Ý chính tương ứng một mục (hoặc nhóm chặt)** và sau tên mục thêm **một đến hai câu** (hoặc gạch phụ ngắn) chỉ nội dung **có trong nguồn**.
- Điều chỉnh wording: thay vì nhấn “súc tích” mơ hồ → **“đủ để độc giả hiểu từng mục chính mà không cần mở lại nguồn ngay, miễn là nguồn đã cung cấp chi tiết”**; tránh lan man khi nguồn ngắn.
- Có thể giảm **tối đa 7** xuống **tối đa 5–6 gạch cấp một** nếu cần nhường chỗ cho **gạch phụ** (indent) — hoặc cho phép **một** subsection ngắn `**Theo từng mục:**` dưới Ý chính (chỉ khi nguồn dạng list có ví dụ).

**Ưu:** Không đổi kiến trúc, chỉ prompt + test string.  
**Nhược:** Output dài hơn, tốn token.

### B — Tham số hoàn thành

- Thêm `max_tokens` hợp lý cho `buildEnrichmentSections` (vd. 2k–4k tùy model) để tránh cắt giữa chừng khi prompt yêu cầu chi tiết hơn.
- Tùy chọn env `ENRICH_MAX_COMPLETION_TOKENS` với default an toàn.

**Ưu:** Giảm rủi ro output cụt.  
**Nhược:** Chi phí API tăng nhẹ.

### C — Heuristic theo độ dài nguồn / `fetchMethod`

- Gợi ý thêm trong user message khi `sourceExcerpt.length` vượt ngưỡng (vd. >6k): “Bài dài, có thể nhiều mục — ưu tiên mở từng mục chính.”

**Ưu:** Không làm note ngắn phình ra.  
**Nhược:** Thêm logic và test.

**Khuyến nghị:** **A + B** trong cùng PR nhỏ; **C** tùy chọn sau khi A+B đo lường.

---

## 5. Thiết kế kỹ thuật (đề xuất triển khai)

1. **Sửa `ENRICH_SYSTEM_PROMPT`** theo mục 4A — cập nhật `tests/llm/enrich.test.ts` (substring/assertions cho quy tắc mới).
2. **`buildEnrichmentSections`:** truyền `max_tokens` (hằng số hoặc `resolveEnrichMaxCompletionTokens()` từ env).
3. **README / CLAUDE.md:** một dòng cho biến env mới nếu có.
4. **Kiểm tra thủ công:** 1 URL X long post kiểu “nhiều ví dụ”; so sánh `note.md` trước/sau.

---

## 6. Rủi ro

| Rủi ro | Giảm thiểu |
|--------|------------|
| Note quá dài | Giữ Insight/Câu hỏi mở không phình; chỉ Tóm tắt/Ý chính chi tiết hơn. |
| Bịa chi tiết | Giữ câu “chỉ từ nguồn”; nhắc “nếu nguồn không định nghĩa mục X thì chỉ nêu tên + ‘chi tiết không nêu trong nguồn’”. |
| Chi phí | `max_tokens` có trần; có thể tài liệu `ENRICH_MODEL` mạnh hơn là tùy chọn. |

---

## 7. Bước tiếp theo

1. Duyệt spec này (và trả lời câu hỏi độ dài A/B/C ở trên nếu muốn chốt mặc định).  
2. Viết plan ngắn hoặc gộp vào task implement trên nhánh feature.  
3. Implement + `pnpm test` + `pnpm typecheck`.
