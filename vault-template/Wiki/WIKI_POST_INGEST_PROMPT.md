# Post-ingest: cập nhật wiki (prompt copy-paste)

Dán khối dưới đây vào Cursor / Claude Code **sau khi ingest xong**. Thay các chỗ `PASTE_…` bằng giá trị thật.

**Ngôn ngữ:** mọi nội dung **bạn thêm vào wiki** (mục `log.md`, bullet **Highlights** / mô tả **Sources in vault** trong `topics/*`, nhãn backlink trên `.note.md`, và phần tóm tắt trong tin nhắn trả lời) phải viết **bằng tiếng Việt**. Giữ nguyên URL, đường dẫn file, và tên file markdown.

---

```
Vault Brain của tôi có `Captures/` và `Wiki/` cạnh nhau ở gốc vault.

Tôi vừa ingest xong một capture. Hãy cập nhật wiki theo `Wiki/SCHEMA.md` (Phase 1 — post-ingest checklist).

Ngôn ngữ: toàn bộ nội dung mới trong Wiki (log, highlights, mô tả nguồn, nhãn backlink trên note) viết bằng TIẾNG VIỆT. Không sửa *.source.md.

Đường dẫn thư mục capture (relative từ gốc vault, bắt buộc có tiền tố Captures/): PASTE_VD_Captures/2026-04-06--slug--abc123/

Ngữ cảnh thêm từ tôi (category, vì sao lưu): PASTE_OR_XÓA

Việc cần làm:
1. Đọc *.note.md trong thư mục đó; chỉ skim *.note.md / tiêu đề *.source.md khi cần.
2. Append `Wiki/log.md` một entry ingest mới (đúng format trong file đó); tiêu đề và bullet mô tả bằng tiếng Việt.
3. Cập nhật `Wiki/topics/<category>.md` chính (và tối đa một topic phụ hoặc một entity) — bullet highlight + link vault; văn bản tiếng Việt.
4. (Tuỳ chọn) Thêm backlink trên *.note.md của capture tới trang topic; nhãn tiếng Việt (ví dụ "Trang wiki liên quan:").
5. Tối đa 6 file markdown dưới Wiki/; không chỉnh *.source.md.
6. Trả lời ngắn: danh sách file đã sửa + một câu tóm tắt bằng tiếng Việt.

Đường dẫn tuyệt đối vault nếu cần: /Users/andy/Workspace/Brain/vault
```

---

Xóa dòng cuối nếu agent đã mở đúng workspace chứa `vault/`.
