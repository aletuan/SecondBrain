# PLAN: Second brain theo mô hình wiki tích lũy

Tài liệu này ghi lại **các việc còn cần làm** để vault + tooling hiện tại (ingest URL → `Captures/`, reader, API Python) tiến gần hơn tới pattern **LLM-maintained wiki** như [Karpathy — LLM Wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f): kiến thức **biên soạn một lần, cập nhật liên tục**, có mục lục và nhật ký, không chỉ tích lũy từng capture đơn lẻ.

Mỗi mục gồm: **vì sao cần**, **hướng giải pháp**, **chia nhỏ task**.

---

## 1. Định nghĩa lớp `Wiki/` trong vault (tách khỏi `Captures/`)

### Vì sao cần

`Captures/` đang là **một thư mục / một URL** — đúng cho nguồn gốc và tra cứu theo lần ingest. Pattern wiki cần một **lớp markdown do “biên tập viên” (LLM hoặc quy trình) sở hữu**: trang chủ đề, thực thể, tổng hợp, được **sửa lại** khi có nguồn mới hoặc mâu thuẫn. Không tách lớp này thì mọi thứ vẫn giống “thư viện capture”, khó compound.

### Solution

Trong vault (ngoài repo nếu vault gitignored), quy ước cây thư mục ví dụ:

- `Wiki/index.md` — mục lục nội dung
- `Wiki/log.md` — nhật ký theo thời gian
- `Wiki/topics/` — trang theo chủ đề
- `Wiki/entities/` — người, sản phẩm, repo, khái niệm riêng (tùy domain)
- (tuỳ chọn) `Wiki/synthesis/` — bài tổng hợp nhiều nguồn

Liên kết hai chiều với capture qua Obsidian wikilinks / đường dẫn tương đối tới `Captures/...`.

### Task nhỏ

- [x] Chọn tên và cấu trúc thư mục cố định (ghi vào schema ở mục 6).
- [x] Tạo `Wiki/index.md` và `Wiki/log.md` với template tối thiểu (tiêu đề, hướng dẫn một dòng cho agent).
- [x] Tạo 3–5 trang `topics/` “seed” theo category/taxonomy bạn hay dùng.
- [x] Quy ước: **không** biên tập mass vào `.source.md`; synthesis chỉ ở `Wiki/**` (và phần bạn cho phép trong `.note.md`).

**Đã seed trong repo:** [`vault-template/Wiki/`](vault-template/Wiki/) — copy vào `./vault/Wiki/` (xem [`vault-template/README.md`](vault-template/README.md)).

---

## 2. Hợp đồng cập nhật sau mỗi ingest (agent trước, API sau)

### Vì sao cần

Gist mô tả một ingest có thể chạm **nhiều trang** wiki. Nếu không có quy tắc rõ (số file tối đa, thứ tự đọc/ghi, trích dẫn capture), agent hoặc code sẽ hoặc làm quá ít (wiki chết) hoặc làm loạn (ghi đè lung tung).

### Solution

**Giai đoạn 1 — Agent-driven:** một checklist trong vault (xem mục 6): sau mỗi capture mới, cập nhật `log.md`, cập nhật mục tương ứng trong `index.md`, cập nhật 1–3 trang topic/entity liên quan, thêm link từ `.note.md` sang wiki nếu hợp lý.

**Giai đoạn 2 (tuỳ chọn):** phase `wiki` trong `POST /v1/ingest` (bật bằng env), nhận excerpt/metadata + taxonomy, output **cấu trúc** (danh sách thao tác file) rồi writer Python áp dụng — giới hạn số file mỗi lần.

### Task nhỏ

- [x] Viết checklist “post-ingest wiki” trong schema vault (mục 6).
- [ ] Thử 5–10 ingest thật chỉ bằng agent; tinh chỉnh checklist.
- [ ] (Tuỳ chọn) Thiết kế JSON schema cho “wiki patch” (create/update paths + nội dung).
- [ ] (Tuỳ chọn) Thêm phase `wiki` trong `api` sau `vault`, có flag tắt mặc định, logging và giới hạn token/file.

---

## 3. `index.md` và `log.md` là artifact bắt buộc

### Vì sao cần

Theo gist: **index** để điều hướng theo nội dung; **log** để timeline và cho LLM biết gần đây đã làm gì. Không có hai file này, wiki lớn nhanh sẽ khó tìm và khó duy trì nhất quán.

### Solution

- `index.md`: nhóm theo loại (topics, entities, synthesis, …), mỗi dòng link + mô tả một dòng; cập nhật mỗi lần có trang mới hoặc đổi tên quan trọng.
- `log.md`: append-only, tiêu đề entry thống nhất (ví dụ `## [YYYY-MM-DD] ingest | …`) để có thể grep/tail.

### Task nhỏ

- [ ] Chuẩn hóa format một entry trong `log.md` (prefix + metadata tối thiểu: capture path hoặc URL).
- [ ] Chuẩn hóa section trong `index.md` (theo taxonomy Brain hoặc theo domain cá nhân).
- [ ] (Tuỳ chọn) Script nhỏ `grep`/Node/Python in ra 5 entry cuối của `log.md` để agent/user nhanh.

---

## 4. Luồng Query: câu trả lời phải “để lại dấu vết” trong vault

### Vì sao cần

RAG/chat làm kiến thức tan trong lịch sử hội thoại. Phần cốt lõi của second brain compound là **mỗi phân tích hay** trở thành trang wiki hoặc cập nhật trang có sẵn (gist: *good answers can be filed back*).

### Solution

Quy ước trong schema: mỗi session “hỏi đáp” nghiêm túc kết thúc bằng một trong các hành động:

- tạo `Wiki/synthesis/...` hoặc cập nhật topic;
- append một dòng vào `log.md` (query | tóm tắt | link trang kết quả);
- cập nhật `index.md` nếu có trang mới.

### Task nhỏ

- [ ] Thêm mục “Query → file” vào schema vault với ví dụ 1–2 lần chạy mẫu.
- [ ] Quyết định khi nào tạo trang mới vs chỉ sửa trang cũ (ngưỡng độ dài / độ “tái sử dụng”).
- [ ] (Tuỳ chọn) Template trang “answer stub” (frontmatter: `type: synthesis`, `sources: [...]`).

---

## 5. Lint định kỳ cho wiki

### Vì sao cần

Wiki lớn dễ có trang mồ côi, link gãy, claim cũ mâu thuẫn nguồn mới, khái niệm trùng tên. Gist đề xuất **lint** như một operation; Brain chưa có việc này trong product.

### Solution

Định kỳ (hoặc theo lệnh) agent chạy checklist: mâu thuẫn, stale, orphan, khái niệm chưa có trang, cross-link thiếu. Có thể bắt đầu **chỉ bằng prompt + đọc `index.md` + graph Obsidian**; sau mới tự động hóa.

### Task nhỏ

- [ ] Viết checklist lint trong schema (5–10 bullet cụ thể).
- [ ] Lên lịch (ví dụ mỗi tuần) hoặc lệnh “lint wiki” trong session agent.
- [ ] (Tuỳ chọn) Script quét vault: broken `[[...]]`, file trong `Wiki/` không có inbound link từ index (heuristic).

---

## 6. Schema “wiki maintainer” (tách với `AGENTS.md` của repo code)

### Vì sao cần

`AGENTS.md` trong repo đang phục vụ **agent làm code**. Pattern wiki cần **schema trong vault** (hoặc tài liệu đồng bộ vault) mô tả: cấu trúc thư mục, quy ước frontmatter, ingest/query/lint, giới hạn số file mỗi lần sửa.

### Solution

Một file trong vault root hoặc trong `Wiki/`, ví dụ `Wiki/SCHEMA.md` hoặc `VAULT_AGENTS.md`, là nguồn sự thật cho mọi phiên “curator”. Repo có thể chỉ **link hoặc nhắc** trong `README.md` / `CLAUDE.md` (một dòng: “vault schema tại …”) để dev không nhầm với `AGENTS.md` code.

### Task nhỏ

- [x] Viết `Wiki/SCHEMA.md` (hoặc tên bạn chọn): mục tiêu, cây thư mục, quy tắc link tới `Captures/`, checklist ingest/query/lint.
- [x] Ghi rõ **mapping taxonomy/category** → ưu tiên file topic nào (bám `config/categories` hoặc taxonomy API nếu có).
- [x] (Tuỳ chọn) Một đoạn ngắn trong `CLAUDE.md` trỏ tới file schema vault để session code biết chỗ tìm.

---

## 7. Ontology và liên kết có kiểu (nâng cao)

### Vì sao cần

Liên kết tự do dễ trùng khái niệm (“attention” vs “self-attention”) và khó reasoning. Typed edges (gợi ý từ thảo luận quanh gist) giúp lint và query có cấu trúc.

### Solution

Bắt đầu nhẹ: trong frontmatter hoặc section cố định của trang wiki, dùng field như `aliases`, `related`, `contradicts` (danh sách link). Sau có thể chuẩn hóa thêm (Dataview trong Obsidian hoặc script parse YAML).

### Task nhỏ

- [ ] Chọn tối thiểu 3–5 loại quan hệ bạn thật sự dùng.
- [ ] Thêm template topic/entity có frontmatter mẫu.
- [ ] (Tuỳ chọn) Query Dataview hoặc script liệt kê “trang có `contradicts`”.

---

## 8. Reader / product: hiển thị hoặc kích hoạt wiki (tuỳ chọn)

### Vì sao cần

Obsidian có thể đủ cho đọc/ghi wiki; reader hiện tập trung library capture. Nếu muốn **một cửa sổ** trong app, cần scope rõ để không trùng với vault browsing đầy đủ.

### Solution

Ưu tiên thấp: mở vault trong Obsidian. Nếu làm product: thêm route hoặc panel “Wiki” đọc `Wiki/index.md` + list files (tương tự captures), hoặc nút “mở wiki folder”.

### Task nhỏ

- [ ] Quyết định có cần UI trong reader hay không (MVP: không).
- [ ] Nếu có: liệt kê endpoint middleware đọc `Wiki/**` giống captures.
- [ ] Nếu có: design tối thiểu (index + search theo tên file).

---

## 9. Công cụ tìm kiếm khi wiki lớn (tuỳ chọn, theo gist)

### Vì sao cần

Ở quy mô nhỏ, `index.md` đủ. Khi hàng trăm trang, cần search (gist gợi ý công cụ hybrid search / MCP). Brain chưa bắt buộc phải có ngay.

### Solution

Khi đạt ngưỡng đau: thêm CLI hoặc MCP (ví dụ search local markdown) và ghi vào `SCHEMA.md` cách agent gọi tool.

### Task nhỏ

- [ ] Đặt ngưỡng (ví dụ >100 trang wiki hoặc ingest >N tuần không đủ index).
- [ ] Chọn một công cụ (local search / ripgrep + metadata) và document trong schema.
- [ ] (Tuỳ chọn) Wrapper script trong `scripts/` gọi search và trả JSON cho agent.

---

## Thứ tự đề xuất

1. Mục **1 + 3 + 6** (cấu trúc vault, index/log, schema) — nền tảng.  
2. Mục **2 + 4** (post-ingest + query→file) — compound thật sự.  
3. Mục **5** (lint).  
4. Mục **7** (ontology) khi wiki đã có vài chục trang.  
5. Mục **8–9** khi có nhu cầu product hoặc quy mô.

---

## Ghi chú

- Vault (`vault/` hoặc đường dẫn bạn cấu hình) thường **gitignored**; `PLAN.md` này nằm ở repo để nhóm dev/agent **biết roadmap**. Nội dung wiki thực tế vẫn sống trong vault.
- Mọi thay đổi API (phase `wiki`) nên **tắt mặc định** và có test/giới hạn chi phí LLM trước khi bật production cá nhân.
