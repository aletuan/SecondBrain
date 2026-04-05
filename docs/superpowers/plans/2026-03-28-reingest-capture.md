# Implementation plan: Re-ingest capture in place

**Spec:** [`docs/superpowers/specs/2026-03-28-reingest-capture-design.md`](../specs/2026-03-28-reingest-capture-design.md)

## Done (2026-03-28)

1. **Brain `cli/src/vault/writer.ts`:** `assertCaptureDirUnderVault`, `clearCaptureAssetsDir`, `overwriteCaptureAtDir`, `readIngestUrlFromCaptureDir`, YAML strip helper.
2. **`cli/src/ingest/runIngest.ts`:** optional `captureDir` → overwrite branch vs `writeCapture`.
3. **`cli/src/cli.ts`:** `ingest <url> --capture-dir <dir>`, command `reingest --capture <dir> [--progress-json]`.
4. **`reader/vault/runIngestCli.ts`:** `reingestCaptureDir` or `url` + optional `captureDir`.
5. **`reader/vault/apiMiddleware.ts`:** `POST /api/captures/:id/reingest/start`, job payload `kind: 'reingest'`, SSE stream runs `reingest --capture`.
6. **`reader/src/main.ts`:** `postReingestWithSse`, `bindCaptureReingest`, dialog + status panel, toolbar button when `ingestAvailable && ingestSse`.
7. **`reader/src/style.css`:** `.btn-reingest`, `.cap-reingest-dlg`, runner spacing.

## Verify

```bash
pnpm typecheck
cd reader && pnpm typecheck
pnpm test
```

CLI manual: `pnpm exec tsx cli/src/cli.ts reingest --capture /abs/path/to/vault/Captures/<id>`
