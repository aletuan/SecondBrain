# X Articles: API v2 vs twitter-cli (GraphQL)

This CLI’s **`x_api`** adapter uses **X API v2** with `X_BEARER_TOKEN`. For **X Articles** (`/i/article/…`), the official API returns useful **`article.plain_text`** but **not** inline image URLs in the same payload (only media id references). For **Markdown + embedded images** matching the on-site article, a separate tool such as **twitter-cli** (GraphQL + session) is required.

## Summary

| Source | Body | Images in vault |
|--------|------|-----------------|
| X API v2 (`cli/src/adapters/xApi.ts`) | `plain_text` for article | From tweet entities / separate media lookup; article inline images may be incomplete vs web |
| twitter-cli (GraphQL) | Markdown-style text + image URLs | Full article images when GraphQL returns them |

## Operational note

If you standardise on twitter-cli for article ingest, keep **secrets** (cookies / tokens) out of git; document the command and expected JSON shape in your runbook. The handoff note with payload examples lives in [`docs/handoffs/2026-03-20-x-ingest-open-issues.md`](../handoffs/2026-03-20-x-ingest-open-issues.md).

## B6 scope

**B6** in the implementation plan is “close the gap” between product expectations and what Bearer-only v2 provides. Options:

1. Accept **text-only** article ingest from v2 and rely on `note.md` / links for images.
2. Add an **optional bridge** (subprocess or HTTP) to a tool that returns Markdown + `images[]`, then map into `CaptureBundle` the same way as other adapters.
3. Document (this file) and choose per workspace — no single default in-repo.
