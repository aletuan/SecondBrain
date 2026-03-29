# Design: Reader-web layout 2 cột (nav + main) + lọc client (Categories / Nguồn)

**Ngày:** 2026-03-29  
**Trạng thái:** Đã duyệt — implementation plan: [`docs/superpowers/plans/2026-03-29-reader-two-column-layout.md`](../plans/2026-03-29-reader-two-column-layout.md).

**Liên quan:**

- Spec category taxonomy: [`2026-03-29-category-design.md`](./2026-03-29-category-design.md) (`categories` trong frontmatter note, `config/categories.yaml`).
- Code hiện tại: `reader-web/src/main.ts` (`layoutShell`, `setSideInner`, `sideCaptures`, …), `reader-web/src/style.css` (`.app` grid 3 cột).
- Thảo luận layout: Option A (ASCII): nav trái có **section** Categories + Nguồn; **main** có **hàng thống kê** ở màn list/overview; **không** `aside.side`; **detail** không hàng KPI.

---

## 1. Mục tiêu

1. **Chỉ còn 2 cột** trong shell desktop: **navigation trái** + **main** — **gỡ** `aside.side` (`#side-inner`).
2. **Nav trái** có cấu trúc **section**:
   - Điều hướng view chính (Ingest / Captures / Digests) — tương đương rail hiện tại.
   - **Categories:** mục theo taxonomy (id/label từ cùng nguồn với feature category).
   - **Nguồn:** lọc theo kiểu nội dung (YouTube, X/Twitter, Threads, và tùy chọn “Khác” / không khớp ba loại).
3. **Thống kê (tiles)** hiện ở `sideCaptures` — chuyển vào **đầu `main`** khi view **Captures (list)**; **không** hiển thị hàng KPI tương tự khi **chi tiết capture** hoặc khi không thuộc phạm vi list đã chốt (xem §4).
4. **Lọc (đã chọn B):** sau khi fetch `GET /api/captures`, lọc **trên client** theo category và/hoặc nguồn; **không bắt buộc** phản ánh filter trong URL/hash trong v1 (bookmark có thể phase sau).

**Phi mục tiêu (v1):** Query string trên hash để share/bookmark; server-side filter API; thu gọn nav kiểu “icon rail + flyout” (đã loại khỏi hướng chính).

---

## 2. Quyết định đã chốt

| Chủ đề | Lựa chọn |
|--------|----------|
| Cột | **2 cột** — `nav` \| `main`; bỏ `aside.side`. |
| Desktop shell | **Nav một cột** thay `rail` 52px — rộng khoảng **220–280px** (số chính xác trong CSS). |
| Responsive | **Mobile:** mở rộng **drawer** hiện có (`nav-drawer`) để chứa route + section (cùng nội dung logic, không tách app). |
| Hành vi filter | **B:** lọc client ngay; state trong **memory** (module scope); tùy chọn `sessionStorage` trong plan nếu muốn giữ filter sau refresh. |
| Thống kê | Tiles + block “Gợi ý” (từ `sideCaptures`) → **main**; **detail capture** chỉ meta ngắn trong main (từ `sideCapture`), không tiles. |
| Tiếp cận đã loại | **Rail + panel trượt** cho Categories — không làm trong v1. |

---

## 3. Shell & DOM

- **`layoutShell()`:** thay `aside.rail` + `aside.side` bằng một **`nav.app-nav`** (hoặc tên tương đương, có `aria-label`).
- **`.app` grid:** `grid-template-columns: minmax(220px, 280px) minmax(0, 1fr)` (điều chỉnh token trong CSS).
- **`bindRail()`** → đổi tên / tách **`bindAppNav()`**: gắn sự kiện cho route **và** cho control filter category/source (nút hoặc danh sách link, có `aria-current` khi active).
- **Theme switcher:** giữ vị trí hiện tại (masthead / mobile topbar) — không đổi trong spec trừ khi layout buộc dời (ưu tiên giữ pattern hiện có).

---

## 4. Di chuyển nội dung `setSideInner`

| Hàm / view | Hành động |
|------------|-----------|
| `sideCaptures` | **Tiles “Tổng quan”** + **“Gợi ý”** render trong **`main`** phía trên (hoặc dưới) bảng captures — thứ tự: masthead → (optional) status strip → **metrics row** → toolbar/search → table → **hints** nếu cần. |
| `sideHome` | Các khối “Digest & vault”, “Trạng thái”, “Link nhanh” → **main** (dưới ingest / cạnh cards), không sidebar phải. |
| `sideCapture` | Đoạn meta capture → **main** (gần toolbar hoặc callout một lần). |
| `sideDigests` / `sideDigestDetail` | Hint tạo digest / challenge / tuần → **main** (toolbar hoặc khối phụ). |
| Lỗi route | Không còn `setSideInner('')` cho side — chỉ render lỗi trong `main`. |

**Hàng KPI (metrics):** chỉ áp cho **list/overview** đã thống nhất — tối thiểu **Captures list**; **Home** và **Digests list** có thể có khối tóm tắt nhẹ hoặc không — **mặc định spec:** ưu tiên parity với thống kê đang có ở `sideCaptures` **chỉ** trên view Captures; home/digests chỉ di chuyển text helper, không bắt buộc thêm KPI row trừ khi plan mở rộng.

---

## 5. Lọc client (chi tiết hành vi)

### 5.1 Dữ liệu

- Nguồn sự thật sau fetch: mảng **`CaptureListItem[]`** (đã có `categories` khi category feature bật; có `url`, `youtube_video_id`, `fetch_method`, …).
- Giữ **`capturesAll`** (hoặc tên tương đương) và **`capturesFiltered`** để render bảng + đếm ô thống kê (tiles có thể dùng **tổng từ all** hoặc **từ filtered** — **chốt:** tiles hiển thị **tổng vault / breakdown trên toàn bộ list** như hiện tại; bảng hiển thị **đã lọc**. Ghi rõ trong plan nếu muốn tiles phản ánh filtered.)

**Đề xuất mặc định:** tiles = thống kê trên **toàn bộ** `captures` (giữ ý nghĩa “Tổng quan thư viện”); bảng = **đã lọc**. Nếu product muốn tiles đổi theo filter → ghi trong plan (tùy chọn).

### 5.2 Category

- Chọn một **category id** trong nav → chỉ giữ các dòng có `categories` (array) **chứa** id đó (multi-label).
- Mục **“Tất cả”** (hoặc tương đương) → bỏ lọc category.

### 5.3 Nguồn

- Dùng logic nhất quán với thống kê hiện tại: `isYoutubeCapture`, `isXCapture`, `isThreadsCapture` (hoặc refactor chung một module helper).
- **“Khác”:** không thuộc ba loại trên (nếu có mục này trong UI).

### 5.4 Kết hợp

- Category **và** nguồn áp dụng **AND** (khớp cả hai khi cả hai đang chọn).

### 5.5 State

- Biến module (hoặc object đơn) trong `main.ts` hoặc file nhỏ `reader-web/src/captureFilters.ts` — `selectedCategoryId: string | null`, `selectedSource: 'all' | 'youtube' | 'x' | 'threads' | 'other'`.
- Vào `#/captures`: có thể reset filter hoặc khôi phục từ `sessionStorage` — **chốt trong plan**.

---

## 6. Categories trong nav

- **Labels** map từ taxonomy (API hoặc bundle giống category feature — một nguồn với `config/categories.yaml`).
- **Lỗi load taxonomy:** section Categories hiển thị trạng thái lỗi ngắn hoặc chỉ “Tất cả”; không crash route.

---

## 7. Edge cases & accessibility

- **Không có dòng nào sau lọc:** empty state trong `mock-table-wrap` hoặc thay tbody bằng một hàng “Không có capture khớp” + nút **Xóa bộ lọc**.
- **Capture không có `categories`:** vẫn hiện khi filter category = “Tất cả”; với `uncategorized` theo policy taxonomy (xem category spec).
- **Bàn phím / screen reader:** nav section có heading ẩn hoặc `aria-labelledby`; filter buttons có trạng thái `aria-pressed` hoặc `aria-current` thống nhất.

---

## 8. Kiểm thử (hướng)

- **Unit:** hàm pure `filterCaptures(items, filters)` (file riêng nếu tách).
- **Thủ công:** `#/captures` — chọn từng category và nguồn; số dòng khớp kỳ vọng; empty state; chuyển sang detail và xác nhận không có KPI row.

---

## 9. Phụ thuộc & thứ tự triển khai

- **Category taxonomy** đã có field `categories` trên `CaptureListItem` và API — layout/filter phụ thuộc; nếu chưa merge, plan có thể chia **phase 1** (layout + nguồn + UI category disabled) / **phase 2** (bật category khi API sẵn).

---

## 10. Không nằm trong spec này

- Thay đổi ingest CLI, vault writer.
- URL bookmark cho filter (mở rộng sau).
