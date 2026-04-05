import path from 'node:path';
import {
  formatIngestProgressLine,
  type IngestPhaseProgressEvent,
} from '../ingest/ingestProgress.js';
import { runIngest } from '../ingest/runIngest.js';
import { resolveUserPath } from '../util/resolveUserPath.js';
import { readIngestUrlFromCaptureDir } from '../vault/writer.js';

function stderrProgressWriter(
  enabled: boolean,
): ((ev: IngestPhaseProgressEvent) => void) | undefined {
  if (!enabled) return undefined;
  return (ev) => process.stderr.write(formatIngestProgressLine(ev));
}

export async function ingestUrlToCapture(options: {
  url: string;
  cwd?: string;
  captureDir?: string;
  progressJson?: boolean;
}): Promise<string> {
  const cwd = options.cwd ?? process.cwd();
  const captureDir = options.captureDir
    ? resolveUserPath(cwd, options.captureDir)
    : undefined;
  return runIngest({
    url: options.url,
    captureDir,
    onProgress: stderrProgressWriter(Boolean(options.progressJson)),
  });
}

export async function reingestCaptureDir(options: {
  capture: string;
  cwd?: string;
  progressJson?: boolean;
}): Promise<string> {
  const cwd = options.cwd ?? process.cwd();
  const dir = resolveUserPath(cwd, options.capture);
  const url = await readIngestUrlFromCaptureDir(dir);
  return ingestUrlToCapture({
    url,
    captureDir: dir,
    cwd,
    progressJson: options.progressJson,
  });
}

export function emitIngestDoneProgress(captureDir: string): void {
  process.stderr.write(
    formatIngestProgressLine({
      v: 1,
      kind: 'done',
      captureDir,
      captureId: path.basename(captureDir),
    }),
  );
}

export function emitIngestErrorProgress(message: string): void {
  process.stderr.write(formatIngestProgressLine({ v: 1, kind: 'error', message }));
}
