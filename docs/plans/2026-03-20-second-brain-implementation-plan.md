# Second brain CLI — Implementation Plan

> **For Claude:** Triển khai theo **superpowers:subagent-driven-development** (session này). *(Tuỳ chọn khác: executing-plans ở session song song.)*

**Goal:** Build a TypeScript CLI that ingests URLs into an Obsidian vault (captures + assets + LLM layers), supports Apify and HTTP/readability with X API stub for later, and generates weekly-style digest notes.

**Architecture:** A URL router picks an adapter (`http_readability`, `apify`, `x_api`). Each adapter returns a normalised `CaptureBundle`. The vault writer creates `vault/Captures/YYYY-MM-DD--slug--id/{source.md,note.md,assets/}`. LLM calls add structured sections to `note.md` with clear separation of quoted facts vs inference. Digest scans captures by date range and writes `vault/Digests/YYYY-Www.md`.

**Reader web (tách khỏi CLI):** trang tổng hợp / điều hướng xây dựng từ mock `docs/visualizations/` — **không** dùng Quartz; đọc vault từ disk hoặc API sau. Chi tiết note vẫn ưu tiên Obsidian.

**Tech Stack:** Node 20+, TypeScript, `tsx` for dev, `vitest` for tests, `yaml` for routing config, `apify-client`, `@mozilla/readability` + `jsdom` (or `linkedom`) for article extraction, OpenAI-compatible API via `openai` package (or `fetch` to Anthropic — **chốt một provider trong Task 1 Step 1**), optional Obsidian CLI invoked as subprocess only if needed later.

---

## Rà soát với [2026-03-20-second-brain-design.md](./2026-03-20-second-brain-design.md)

| Nội dung design | Task plan tương ứng | Ghi chú |
|-----------------|---------------------|---------|
| Ingest URL + router + adapters | 3, 5, 6, 7, 9 | X: API v2 + **X Article** (Markdown body + ảnh qua pipeline hiện tại) — chi tiết / twitter-cli tùy chọn: [handoff](../handoffs/2026-03-20-x-ingest-open-issues.md) |
| Bundle `source.md` / `note.md`, frontmatter | 2, 4, 8 | `type: capture`, `publish`, v.v. |
| Ảnh → `assets/` | 11 | Có thể làm sau Task 8 nếu muốn MVP ingest không ảnh trước |
| LLM summary / insight / câu hỏi | 8 | Khớp mục “Suy luận (LLM)” trong design |
| Digest định kỳ | 10 | ISO week `YYYY-Www` như design |
| Challenge / YouTube / reader web | Phase 2+ (13, 14, app riêng) | Không chặn MVP |

**Độ chi tiết:** MVP **Task 1–12** đã có đường dẫn file, bước TDD/lệnh và commit. **Bổ sung trong bản này:** checklist `[ ]` theo dõi tiến độ; làm rõ **Task 7** (thứ tự bước + test); **Task 8** (TDD rõ ràng); **Task 9** (luồng CLI: parse argv, chọn adapter, gọi writer + enrich); ghi **Task 11** có thể đổi thứ tự tùy ưu tiên.

**Tham chiếu mock reader web:** `docs/visualizations/second-brain-mock-ui.html`, `second-brain-solution.html` — không nằm trong scope MVP CLI.

### Trạng thái theo nhóm (rà soát codebase 2026-03-21)

| Nhóm | Hoàn thành | Kiểm chứng nhanh |
|------|------------|------------------|
| **MVP Task 1–12** | ✅ | `pnpm test` — ~77 tests; `cli/src/cli.ts` (`ingest`, `digest`, `challenge`, `translate-transcript`, `suggest-milestones`), adapters, `vault/writer.ts`, `digest.ts`, `llm/enrich.ts` |
| **Challenge 13a–d** | ✅ | `cli/src/challenge/fromDigest.ts`, `cli/tests/challenge/fromDigest.test.ts`, script `pnpm challenge` |
| **YouTube 14a–b** | ✅ | `cli/src/adapters/youtube.ts`, `cli/tests/adapters/youtube.test.ts`, writer transcript + `routing.example.yaml` |
| **YouTube 14c–f** | ✅ | `translateTranscript.ts`, `youtube/milestones.ts`, `suggestMilestones`, [`docs/reader-web.md`](../reader-web.md), [`reader-youtube-timeline.html`](../visualizations/reader-youtube-timeline.html) |
| **X Article (tweet + long-form)** | ✅ | `cli/src/adapters/xApi.ts` — body Markdown + ảnh → `source.md` / `assets/` (đã verify ingest thực tế); tùy chọn GraphQL/twitter-cli: [handoff](../handoffs/2026-03-20-x-ingest-open-issues.md), [`docs/integrations/x-article-twitter-cli.md`](../integrations/x-article-twitter-cli.md) |
| **Mở rộng thread / conversation X** | ⛔ không làm | **Đã loại khỏi scope** theo quyết định sản phẩm — không track trong plan. |
| **Meta Threads (threads.net)** | ⛔ không làm | Nội dung post ngắn, không ưu tiên như article — **không** ingest, không route. |
| **Reader web app (full)** | ✅ | [`reader-web/`](../../reader-web/) — Vite SPA + vault `/api/*`; mock [`second-brain-mock-ui.html`](../visualizations/second-brain-mock-ui.html) |
| **Digest chunking lớn** | ✅ | `cli/src/digest.ts` — `DIGEST_LLM_MAX_CHARS`, chunk + merge |
| **Obsidian CLI batch** | ✅ (tài liệu) | [`docs/integrations/obsidian-cli-batch.md`](../integrations/obsidian-cli-batch.md) |

---

## Tiến độ tổng — MVP (Tasks 1–12)

**Công việc mở (ngoài MVP checklist):** **không** ingest Meta Threads; **không** mở rộng thread/conversation X. Reader web: ✅ [`reader-web/`](../../reader-web/).

- [x] **Task 1** — Project scaffold & config samples
- [x] **Task 2** — Internal types & normaliser
- [x] **Task 3** — URL router
- [x] **Task 4** — Vault writer
- [x] **Task 5** — HTTP + Readability adapter
- [x] **Task 6** — Apify adapter
- [x] **Task 7** — X API adapter (API v2 + **X Article** đầy đủ trong vault với pipeline hiện tại — xem [handoff](../handoffs/2026-03-20-x-ingest-open-issues.md) nếu cần twitter-cli / so sánh tier API)
- [x] **Task 8** — LLM enrichment
- [x] **Task 9** — CLI `ingest`
- [x] **Task 10** — CLI `digest`
- [x] **Task 11** — Image download → `assets/`
- [x] **Task 12** — Docs & handoff

> **Ghi chú rà soát:** MVP Task 1–12 khớp code + test; bảng “Trạng thái theo nhóm” và Phase 2+ được **cập nhật 2026-03-21** (X Article ✅, YouTube 14c–f ✅, bỏ scope thread X). Chi tiết từng bước Task 1–12 bên dưới vẫn `[x]`.

---

## MVP scope (đã chốt)

| Decision | Choice | Ghi chú |
|----------|--------|---------|
| CLI stack | **TypeScript on Node** | SDK Apify chính thức; một codebase cho CLI + test. |
| MVP ingest — web tĩnh / blog | **`http_readability`** | Không tốn Apify; dùng Readability + fetch HTML. |
| MVP ingest — “ổn định / đầy đủ” trang phức tạp | **Apify `apify/website-content-crawler`** | Pin `actor` id + `build` trong config; thay actor khi Apify đổi — user chỉnh trong `config/routing.yaml`. |
| YouTube / X | **✅** | YouTube: transcript Apify + dịch/milestone. X: **API v2** + article. **Meta Threads:** không hỗ trợ (bỏ scope). |
| LLM | **OpenAI API** đầu tiên (env `OPENAI_API_KEY`) | Có thể abstract `LLM_PROVIDER` sau. |
| Vault path | `VAULT_ROOT` env, default `./vault` | Relative to cwd khi chạy CLI. |

**Apify:** Trong Apify Console, copy đúng **Actor ID** (dạng `username~actor-name`) và **build tag** nếu cần; file mẫu dùng placeholder `apify/website-content-crawler` — thay bằng ID thực tế của bạn.

---

### Task 1: Project scaffold & config samples — ✅ hoàn thành

**Files:**

- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `config/routing.example.yaml`
- Create: `.env.example`
- Modify: [`.gitignore`](../../.gitignore) (ensure `.env` ignored — already present)

- [x] **Step 1:** Chốt **CLI parser**: `commander` *hoặc* `yargs` — ghi vào `package.json` dependency và dùng thống nhất từ Task 9.
- [x] **Step 2:** Add `package.json` with scripts: `"test": "vitest run"`, `"test:watch": "vitest"`, `"ingest": "tsx cli/src/cli.ts ingest"`, `"digest": "tsx cli/src/cli.ts digest"`, deps: `typescript`, `tsx`, `vitest`, `yaml`, `apify-client`, `openai`, `jsdom`, `@mozilla/readability`, `commander` (hoặc `yargs`).
- [x] **Step 3:** `tsconfig.json` — `moduleResolution: bundler` or `node16`, `strict: true`, `outDir: dist` optional.
- [x] **Step 4:** Copy `config/routing.example.yaml` → `config/routing.yaml` locally (gitignore `routing.yaml` if contains secrets) **or** commit only example; document that user copies example.

Example routing shape:

```yaml
version: 1
routes:
  - match:
      hostSuffix: x.com
      pathPrefix: /
    strategy: x_api
  - match:
      hostSuffix: twitter.com
    strategy: x_api
  - match:
      hostSuffix: youtube.com
    strategy: apify
    apify:
      actorId: YOUR_ACTOR_ID
      inputFromUrl: true
  - match:
      hostSuffix: "*"
    strategy: http_readability
defaultStrategy: http_readability
apifyDefaults:
  actorId: apify/website-content-crawler
  # build: optional pin
```

- [x] **Step 5:** `.env.example` — `APIFY_TOKEN=`, `OPENAI_API_KEY=`, `OPENAI_MODEL=gpt-4o-mini`, `VAULT_ROOT=vault`, optional `X_BEARER_TOKEN=`.
- [x] **Step 6:** Chạy `pnpm install` (hoặc `npm install`); `pnpm exec tsc --noEmit` nếu đã có `src` tối thiểu — hoặc bỏ qua đến Task 2.
- [x] **Step 7:** Commit scaffold.

```bash
git add package.json tsconfig.json vitest.config.ts config/routing.example.yaml .env.example docs/plans/
git commit -m "chore: scaffold second-brain CLI and docs"
```

---

### Task 2: Internal types & normaliser — ✅ hoàn thành

**Files:**

- Create: `cli/src/types/capture.ts`
- Create: `cli/src/normaliser.ts`
- Create: `cli/tests/normaliser.test.ts`

- [x] **Step 1: Write failing test** — `normaliseRawHtml` or `bundleFromParts` produces fixed shape: `{ canonicalUrl, title, textPlain, images: { url, alt }[], codeBlocks: { language, code }[], fetchedAt, fetchMethod }`.
- [x] **Step 2:** Run `pnpm vitest cli/tests/normaliser.test.ts` — expect **FAIL**.
- [x] **Step 3:** Implement minimal `normaliser.ts`.
- [x] **Step 4:** Run `pnpm vitest cli/tests/normaliser.test.ts` — expect **PASS**.
- [x] **Step 5:** Commit.

---

### Task 3: URL router — ✅ hoàn thành

**Files:**

- Create: `cli/src/router.ts`
- Create: `cli/tests/router.test.ts`
- Create: `cli/src/config/loadRouting.ts`

- [x] **Step 1:** Tests: given YAML string, `resolveStrategy('https://example.com/post')` → `http_readability`; `https://x.com/user/status/1` → `x_api` when route matches.
- [x] **Step 2:** Run `pnpm vitest cli/tests/router.test.ts` — expect **FAIL**.
- [x] **Step 3:** Implement `loadRouting` + `resolveStrategy`.
- [x] **Step 4:** Run tests — **PASS**.
- [x] **Step 5:** Commit.

---

### Task 4: Vault writer — ✅ hoàn thành

**Files:**

- Create: `cli/src/vault/writer.ts`
- Create: `cli/tests/vault/writer.test.ts`

- [x] **Step 1:** Test in temp dir: `writeCapture(bundle)` creates `Captures/YYYY-MM-DD--slug--shortid/source.md` with frontmatter `type: capture`, `url`, `ingested_at`, `fetch_method`, `publish: false`.
- [x] **Step 2:** Run test — **FAIL** until implemented.
- [x] **Step 3:** Implement slug from title/url, shortid random hex or hash slice.
- [x] **Step 4:** Run test — **PASS**.
- [x] **Step 5:** Commit.

---

### Task 5: HTTP + Readability adapter — ✅ hoàn thành

**Files:**

- Create: `cli/src/adapters/httpReadability.ts`
- Create: `cli/tests/adapters/httpReadability.test.ts` (mock `fetch` or use golden HTML string)

- [x] **Step 1:** Test passes static HTML fixture through adapter → expected text + image URLs extracted.
- [x] **Step 2:** Run test — **FAIL**.
- [x] **Step 3:** Implement fetch + Readability parse; map to normaliser.
- [x] **Step 4:** Run test — **PASS**.
- [x] **Step 5:** Commit.

---

### Task 6: Apify adapter — ✅ hoàn thành

**Files:**

- Create: `cli/src/adapters/apify.ts`
- Create: `cli/tests/adapters/apify.test.ts` (mock `ApifyClient` — no real network in CI)

- [x] **Step 1:** Test: mock client returns dataset items with `text` / `markdown` / `screenshotUrl` fields → normalised bundle.
- [x] **Step 2:** Run test — **FAIL**.
- [x] **Step 3:** Implement `runActorAndCollect` using `apify-client`, map actor output to bundle (document expected actor output shape for `website-content-crawler` in README under `docs/` or repo README).
- [x] **Step 4:** Run test — **PASS**.
- [x] **Step 5:** Commit.

---

### Task 7: X API adapter — ✅ hoàn thành (tweet + X Article + ảnh)

**Files:**

- Create: `cli/src/adapters/xApi.ts`
- Create: `cli/tests/adapters/xApi.test.ts`

- [x] **Step 1:** Test: khi `X_BEARER_TOKEN` thiếu (hoặc env mock rỗng), adapter throw error message chứa chuỗi gợi ý kiểu **"Configure X API"** hoặc **"switch route to apify"** — assert bằng `toThrowError` / `rejects.toThrow`.
- [x] **Step 2:** Run `pnpm vitest cli/tests/adapters/xApi.test.ts` — **FAIL**.
- [x] **Step 3:** Implement adapter: throw rõ ràng khi không có token; entry ingest tweet + note_tweet + article (`fetchXThread`).
- [x] **Step 4:** Run test — **PASS**.
- [x] **Step 5 (tùy chọn):** Nếu có token trong env dev, test tích hợp với `fetch` mock JSON 1 tweet → bundle (có thể hoãn Phase 2+).
- [x] **Step 6:** Commit.

**Trạng thái (cập nhật 2026-03-21):** Ingest URL status + **X Article** long-form: `source.md` có body Markdown, ảnh tải về `assets/` và embed `note.md` khi có URL + cookie CDN nếu cần. **Không** có roadmap mở rộng **thread / conversation** trong plan này. So sánh Bearer-only vs GraphQL/twitter-cli: [handoff](../handoffs/2026-03-20-x-ingest-open-issues.md), [x-article-twitter-cli.md](../integrations/x-article-twitter-cli.md).

---

### Task 8: LLM enrichment — ✅ hoàn thành

**Files:**

- Create: `cli/src/llm/enrich.ts`
- Create: `cli/tests/llm/enrich.test.ts` (mock OpenAI client — không gọi mạng trong CI)

- [x] **Step 1:** Test: `enrichNote` (hoặc `buildEnrichmentSections`) với mock completion trả về nội dung cố định → markdown có các section (hoặc substring): **Tóm tắt**, **Insight (LLM)** / suy luận, **Câu hỏi mở** — khớp design (tách facts vs inference trong prompt; test assert cấu trúc output).
- [x] **Step 2:** Run test — **FAIL**.
- [x] **Step 3:** Implement OpenAI chat completion; ghép vào `note.md` qua writer hoặc hàm nhận `notePath` + `sourceExcerpt`.
- [x] **Step 4:** Run test — **PASS**.
- [x] **Step 5:** Commit.

---

### Task 9: CLI `ingest` — ✅ hoàn thành

**Files:**

- Create: `cli/src/cli.ts` (hoặc `cli/src/cli/index.ts` + subcommands nếu tách)
- Modify: `package.json` scripts / `bin` nếu cần

- [x] **Step 1:** Đăng ký lệnh `ingest <url>` (hoặc `ingest -- <url>`): parse URL, đọc `VAULT_ROOT`, load `config/routing.yaml` (fallback example path document trong README).
- [x] **Step 2:** `resolveStrategy(url)` → gọi đúng adapter (`httpReadability` / `apify` / `xApi`).
- [x] **Step 3:** Normalise → `writeCapture` → `enrichNote` khi có `OPENAI_API_KEY` (không còn cờ tắt LLM trên lệnh `ingest`).
- [x] **Step 4:** Log đường dẫn thư mục capture ra stdout (để user mở Obsidian).
- [x] **Step 5:** Manual: `pnpm ingest -- https://example.com` (trang article tĩnh) tạo folder dưới `vault/Captures/...` — ghi lại trong README.
- [x] **Step 6 (tùy chọn):** Test integration temp vault + mock fetch (Task 9b) — không chặn MVP.
- [x] **Step 7:** Commit.

---

### Task 10: CLI `digest` — ✅ hoàn thành

**Files:**

- Create: `cli/src/digest.ts`
- Create: `cli/tests/digest.test.ts`

- [x] **Step 1:** Test: với vài file capture giả trong temp `vault/Captures/.../note.md` + `ingested_at` trong frontmatter, `generateDigest({ since: '7d' })` tạo `Digests/YYYY-Www.md` chứa wikilink `[[...]]` tới ít nhất một capture (week theo **ISO**, timezone document: UTC hoặc local — chốt một và ghi trong code comment).
- [x] **Step 2:** Run test — **FAIL**.
- [x] **Step 3:** Implement scan `vault/Captures/**/note.md`, build excerpt list, gọi LLM tổng hợp, ghi `Digests/YYYY-Www.md`.
- [x] **Step 4:** Run test — **PASS**.
- [x] **Step 5:** Manual: `pnpm digest -- --since 7d` (hoặc flag tương đương đã chốt) — cập nhật README.
- [x] **Step 6:** Commit.

---

### Task 11: Image download to `assets/` — ✅ hoàn thành

**Files:**

- Modify: `cli/src/vault/writer.ts`
- Create: `cli/tests/vault/assets.test.ts`

**Thứ tự:** Nên làm **sau** Task 4 tối thiểu; thường **sau Task 8/9** để ingest end-to-end có ảnh. Có thể tách: ingest không ảnh trước, rồi bật Task 11.

- [x] **Step 1:** Test: danh sách URL ảnh → file trong `assets/` + markdown embed tương đối trong `note.md`.
- [x] **Step 2:** Run test — **FAIL**.
- [x] **Step 3:** Implement `fetch` + guard `content-type` image/* + giới hạn kích thước (bytes, configurable constant hoặc env).
- [x] **Step 4:** Run test — **PASS**.
- [x] **Step 5:** Commit.

---

### Task 12: Docs & handoff — ✅ hoàn thành

**Files:**

- Create: `README.md` (setup, env, example commands, link tới `docs/visualizations/` làm spec reader web)
- Optional: `docs/reader-web.md` — mục tiêu app đọc vault theo mock, không Quartz

- [x] **Step 1:** Document MVP limitations (X/YouTube phase 2); ghi rõ **Quartz không** nằm trong stack; reader web là project riêng sau.
- [x] **Step 2:** Bảng lệnh: `ingest`, `digest`, env bắt buộc/tùy chọn.
- [x] **Step 3:** Commit.

---

## Phase 2+ (không nằm trong MVP tasks)

### Tiến độ Phase 2+ (tùy chọn)

- [x] YouTube: transcript (**14a–b**), dịch Vi (**14c**), docs reader (**14d**), milestones + CLI (**14e**), mock timeline (**14f**)
- [x] **X Article** ingest đầy đủ (body + ảnh) với pipeline hiện tại — không còn mục “open” trong plan; tùy chọn công cụ ngoài: [handoff](../handoffs/2026-03-20-x-ingest-open-issues.md)
- [x] Digest chunking khi vault lớn (`DIGEST_LLM_MAX_CHARS`)
- [x] Obsidian CLI batch — hướng dẫn trong docs (không wrapper trong repo)
- [x] Challenge CLI (Task 13a–d)
- [x] Reader web app đầy đủ — [`reader-web/`](../../reader-web/) + visualizations (mock)

---

## Backlog — task mô tả rõ (bite-sized)

> Định dạng gợi ý từ **writing-plans**: một mục = một hướng việc; có **mục đích**, **file/lệnh**, **xong khi** để bốc task không cần đọc lại toàn bộ plan.

### Ưu tiên gợi ý (tóm tắt) — trạng thái

| Mã | Việc | Trạng thái |
|-----|------|------------|
| **B1 (14c)** | Dịch transcript YouTube (LLM) + test | ✅ |
| **B2 (14d)** | `docs/reader-web.md` (embed, `publish`, transcript) | ✅ |
| **B3 (14e)** | `milestones` + `pnpm suggest-milestones` | ✅ |
| **B4 (14f)** | Mock timeline + seek — [`reader-youtube-timeline.html`](../visualizations/reader-youtube-timeline.html) | ✅ |
| **B5** | X Article / tích hợp twitter-cli (tài liệu tùy chọn) | ✅ CLI; doc [`x-article-twitter-cli.md`](../integrations/x-article-twitter-cli.md) |
| **B6** | App reader web đầy đủ | ✅ [`reader-web/`](../../reader-web/) (`pnpm dev` / `pnpm preview`) |
| **B7** | Obsidian CLI doc + digest chunking | ✅ |

### B1 — Dịch transcript YouTube (**Task 14c**)

- **Mục đích:** Từ transcript đã ghi trong capture, sinh thêm bản **Tiếng Việt** (LLM), gắn nhãn rõ *bản dịch / suy diễn* để không nhầm với nguyên bản.
- **Tạo / sửa:** `cli/src/llm/translateTranscript.ts`; `cli/tests/llm/translateTranscript.test.ts` (fixture transcript ngắn → snapshot khối `vi`).
- **CLI:** `pnpm exec tsx cli/src/cli.ts ingest '<url>'` (YouTube: dịch Vi tự động khi có segment + key) hoặc `pnpm translate-transcript -- --capture <path>` — xem README.
- **Xong khi:** `pnpm test` có test mới pass; contract output (section Markdown hoặc file phụ) được mô tả trong comment hoặc README một dòng.

### B2 — Docs reader web + hợp đồng hiển thị (**Task 14d**)

- **Mục đích:** Người làm app reader (sau này) đọc **một** tài liệu là biết: embed YouTube, cờ `publish`, transcript lấy từ đâu trong vault, phạm vi “app đọc cá nhân”.
- **Sửa:** [`docs/reader-web.md`](../reader-web.md) — hợp đồng vault + app [`reader-web/`](../../reader-web/); có thể thêm mục “Mapping từ capture folder → UI”.
- **Xong khi:** Checklist trong doc có thể tick được (ví dụ: “embed URL”, “đọc `## Transcript`”, “ẩn khi `publish: false`” — điều chỉnh theo quyết định thực tế và ghi rõ).

### B3 — Milestones YouTube (**Task 14e**)

- **Mục đích:** Cho phép đánh dấu **mốc thời gian** (chapter / highlight) để reader web seek nhanh; dữ liệu tách khỏi transcript thuần.
- **Tạo / sửa:** `cli/src/youtube/milestones.ts` (parse/merge `milestones.yaml` hoặc frontmatter `youtube_milestones`); optional `pnpm suggest-milestones --capture …` (LLM → JSON, validate `t` trong bounds).
- **Xong khi:** Unit test parse/merge; ví dụ YAML/array trong doc hoặc fixture test.

### B4 — UI timeline + seek (**Task 14f**)

- **Mục đích:** Trong mock hoặc component web: thanh timeline + danh sách mốc; **click** → video seek (IFrame API `seekTo` *hoặc* `iframe.src` với `start=`).
- **Tạo / sửa:** Dưới `docs/visualizations/` hoặc package frontend sau này — bám mock `second-brain-mock-ui.html` / `second-brain-solution.html`.
- **Xong khi:** Demo tay: load capture mẫu (có `youtube_video_id` + milestones) → click mốc → video nhảy đúng giây (trong giới hạn CORS/embed).

### B5 — X Article & tài liệu tích hợp ngoài

- **Mục đích:** Ingest X Article đầy đủ đã có trong `xApi` + vault; tài liệu so sánh Bearer vs twitter-cli khi cần.
- **Tham chiếu:** [handoff](../handoffs/2026-03-20-x-ingest-open-issues.md), [`x-article-twitter-cli.md`](../integrations/x-article-twitter-cli.md). **Không** có mục mở rộng thread/conversation X trong scope; **không** ingest Meta Threads.

### B6 — Reader web app

- **Mục đích:** Ứng dụng đọc vault (disk hoặc API), không Quartz — theo mock trong `docs/visualizations/`.
- **Triển khai:** [`reader-web/`](../../reader-web/) — Vite + middleware đọc `Captures/` và `Digests/`; xem [`reader-web/README.md`](../../reader-web/README.md).
- **Xong khi:** Repo (hoặc thư mục app) chạy được locally; link từ README gốc tới app + `docs/reader-web.md`.

### B7 — Nice-to-have

- **Obsidian CLI:** [`obsidian-cli-batch.md`](../integrations/obsidian-cli-batch.md) — hướng dẫn, không wrapper trong repo.
- **Digest chunking:** `digest.ts` + env `DIGEST_LLM_MAX_CHARS`.

---

### YouTube — transcript & web (EN + VI) — Phase 2+ (**14a–f ✅**)

**Mục tiêu:** Ingest URL `youtube.com/watch?v=…` → `source.md` có transcript gốc; tùy chọn sinh bản **Tiếng Việt** (LLM) có nhãn “dịch”; **reader web** (theo mock) có **embed + tab / song song**.

**Normaliser / writer**

- Map output actor → `textPlain` transcript + `youtube_video_id` trong bundle; writer ghi section `## Transcript (en)` (hoặc locale từ metadata).
- Tuỳ chọn: `source.transcript.vi.md` hoặc section `## Transcript (vi) — bản dịch (LLM)` sau bước dịch.

**CLI (gợi ý)**

- `ingest <youtube-url>` (dịch Vi trong ingest khi đủ điều kiện) hoặc `pnpm translate-transcript -- --capture <path>` chỉ đọc/ghi transcript đã có.
- Env: dùng chung `OPENAI_*`; không bắt buộc biến mới.

**Reader web (UI)**

- Trong app (theo `docs/visualizations/`): view capture kiểu `source: youtube` — iframe `https://www.youtube.com/embed/{id}` + transcript parse từ Markdown vault (tab / hai cột / timeline seek như mock).

**Timeline & mốc chú ý (seek khi click)**

- **Dữ liệu:** `milestones.yaml` trong thư mục capture **hoặc** frontmatter `youtube_milestones` (JSON array): `{ "t": 42, "label": "…", "kind"?: "chapter" | "highlight" }`. Mốc có thể **thủ công** hoặc **gợi ý LLM** từ transcript (ghi nhãn *gợi ý*, luôn đối chiếu video).
- **UI:** thanh timeline (track + tick theo `t` / độ dài video ước lượng) + danh sách chip / bullet có timestamp; **mốc highlight** (màu / icon) cho ý quan trọng.
- **Seek:** (1) **IFrame API** — `player.seekTo(seconds)` mượt, cần `enablejsapi=1` + script loader; hoặc (2) **đơn giản** — gán lại `iframe.src` với `?start={seconds}&autoplay=1` (reload player). Transcript: cùng `t` có thể `scrollIntoView` / class `active` trên dòng `[mm:ss]`.

**Task gợi ý**

- [x] **Task 14a:** `cli/src/adapters/youtube.ts` — normalised bundle có `source: youtube`, `youtubeVideoId`, `transcriptSegments` optional; `runIngest` dùng luồng này khi strategy `apify` + host YouTube.
- [x] **Task 14b:** `cli/src/vault/writer.ts` — `source.md` có `## Transcript (en)`, frontmatter `source`, `youtube_video_id`, `transcript_locale`; `youtu.be` trong `routing.example.yaml`.
- [x] **Task 14c:** `cli/src/llm/translateTranscript.ts` + `cli/tests/llm/translateTranscript.test.ts`.
- [x] **Task 14d:** [`docs/reader-web.md`](../reader-web.md) — embed, `publish`, transcript, milestones, CLI.
- [x] **Task 14e:** `cli/src/youtube/milestones.ts`, `suggestMilestones.ts`, `pnpm suggest-milestones`.
- [x] **Task 14f:** [`docs/visualizations/reader-youtube-timeline.html`](../visualizations/reader-youtube-timeline.html).

**Kiểm thử:** fixture JSON transcript → snapshot Markdown; contract `extractVideoId(url)`; milestone click → seek (e2e nhẹ với Playwright nếu có).

### Digest → Challenge (kiểm tra đọc hiểu) — Phase 2+ (**13a–d ✅**)

**Mục tiêu:** Sau khi có `Digests/YYYY-Www.md`, CLI (hoặc workflow) gọi LLM **chỉ với nội dung digest** để tạo file `Challenges/YYYY-Www.md` (hoặc `Digests/YYYY-Www.challenge.md`) gồm câu hỏi + khóa đáp án / rubric ngắn — giúp người dùng tự đánh giá nắm chủ đề.

**Ràng buộc kỹ thuật**

- Prompt: “chỉ dựa trên văn bản digest sau; không thêm fact ngoài đoạn này”.
- Output: Markdown có cấu trúc cố định (YAML frontmatter `type: challenge`, `digest`, `difficulty`, `model`) + section `## Câu hỏi` / `## Gợi ý đáp án` (có thể ẩn đáp án bằng callout hoặc file riêng `--answers-suffix`).
- Optional: `challenge review` — đọc `Reviews/...` + digest, LLM phản hồi ngắn (chi phí + cảnh báo hallucination).

**Task gợi ý (sau Task 10 digest)**

- [x] **Task 13a:** `cli/src/challenge/fromDigest.ts` — parse path digest, đọc body, gọi `llm` với schema JSON → render Markdown.
- [x] **Task 13b:** `cli/tests/challenge/fromDigest.test.ts` — fixture digest ngắn → snapshot challenge output.
- [x] **Task 13c:** CLI `pnpm challenge` / `tsx cli/src/cli.ts challenge --digest …` hoặc `--week 2026-W12`.
- [x] **Task 13d:** `.env.example` — không bắt buộc biến mới nếu dùng chung `OPENAI_*`.

**Package script:** `"challenge": "tsx cli/src/cli.ts challenge"`.

---

## Verification

```bash
pnpm install
pnpm test
pnpm ingest -- https://example.com
```

Expected: tests pass; ingest creates capture under `vault/Captures/...` when env valid.

---

**Plan complete and saved to** `docs/plans/2026-03-20-second-brain-implementation-plan.md`.

**Execution options:**

1. **Subagent-Driven (this session)** — dispatch per task, review between tasks (@superpowers:subagent-driven-development).
2. **Parallel Session (separate)** — new session with @superpowers:executing-plans and checkpoints.

**Chọn triển khai:** **Subagent-Driven (session này)** — mỗi task: implement → review spec → review chất lượng → tick plan → task kế tiếp.
