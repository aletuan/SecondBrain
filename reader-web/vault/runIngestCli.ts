import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  tryParseIngestProgressLine,
  type IngestProgressEvent,
} from './ingestProgressParse.js';
import { envForBrainChild } from './brainDotenv.js';
import { resolveBrainRepoRoot, resolveVaultRoot } from './paths.js';

function collectStream(stream: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (c: string | Buffer) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

/** Last stdout line that looks like a capture path (…/Captures/…). */
export function parseCaptureDirFromStdout(stdout: string): string | null {
  const lines = stdout
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i]!;
    if (line.includes(`${path.sep}Captures${path.sep}`) || line.includes('/Captures/')) {
      return line;
    }
  }
  return null;
}

export async function assertIngestEnvironment(cwd: string = process.cwd()): Promise<{
  brainRoot: string;
  vaultRoot: string;
}> {
  const brainRoot = resolveBrainRepoRoot(cwd);
  const vaultRoot = resolveVaultRoot(cwd);
  await fs.access(path.join(brainRoot, 'src', 'cli.ts'));
  await fs.access(path.join(brainRoot, 'package.json'));
  return { brainRoot, vaultRoot };
}

export type IngestCliOptions = {
  /** Normal ingest (required unless `reingestCaptureDir` is set). */
  url?: string;
  /** Absolute path to `…/Captures/<id>/` for `reingest --capture` (exclusive with `url`). */
  reingestCaptureDir?: string;
  /** Optional in-place target for `ingest <url> --capture-dir` (advanced). */
  captureDir?: string;
  /** Forward v1 JSON lines from CLI stderr (see Brain `ingestProgress`). */
  progressJson?: boolean;
  /** Called for each parsed progress object while the process runs. */
  onIngestProgress?: (ev: IngestProgressEvent) => void;
  /** For cancelling the child when the HTTP client disconnects (SSE). */
  onChild?: (child: ChildProcess) => void;
  cwd?: string;
};

/**
 * Runs the Brain CLI ingest in `brainRoot` via `node …/tsx/dist/cli.mjs src/cli.ts ingest …`.
 * Avoids `pnpm run ingest -- …`, which can forward a stray `--` into argv and break Commander
 * (“Expected 1 argument but got 2”).
 */
function collectStderrWithProgress(
  child: ChildProcess,
  onLine: NonNullable<IngestCliOptions['onIngestProgress']>,
): Promise<string> {
  const stderr = child.stderr;
  if (!stderr) return Promise.resolve('');
  let carry = '';
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      const tail = carry.trim();
      if (tail) {
        const ev = tryParseIngestProgressLine(tail);
        if (ev) onLine(ev);
      }
      resolve(Buffer.concat(chunks).toString('utf8'));
    };
    stderr.on('data', (c: string | Buffer) => {
      const s = Buffer.isBuffer(c) ? c.toString('utf8') : c;
      chunks.push(Buffer.from(s, 'utf8'));
      carry += s;
      const parts = carry.split(/\r?\n/);
      carry = parts.pop() ?? '';
      for (const line of parts) {
        const ev = tryParseIngestProgressLine(line);
        if (ev) onLine(ev);
      }
    });
    stderr.on('error', (err) => {
      if (!settled) {
        settled = true;
        reject(err);
      }
    });
    stderr.on('end', finish);
    child.once('close', finish);
  });
}

export async function runIngestCli(options: IngestCliOptions): Promise<{
  code: number;
  stdout: string;
  stderr: string;
  captureDir: string | null;
}> {
  const { brainRoot, vaultRoot } = await assertIngestEnvironment(options.cwd);
  const tsxCli = path.join(brainRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const cliTs = path.join(brainRoot, 'src', 'cli.ts');
  await fs.access(tsxCli);

  let args: string[];
  if (options.reingestCaptureDir) {
    args = [tsxCli, cliTs, 'reingest', '--capture', options.reingestCaptureDir];
    if (options.progressJson) args.push('--progress-json');
  } else if (options.url) {
    args = [tsxCli, cliTs, 'ingest'];
    if (options.progressJson) args.push('--progress-json');
    args.push(options.url);
    if (options.captureDir) {
      args.push('--capture-dir', options.captureDir);
    }
  } else {
    throw new Error('runIngestCli: provide url or reingestCaptureDir');
  }

  const childEnv = await envForBrainChild(brainRoot, vaultRoot);
  const child = spawn(process.execPath, args, {
    cwd: brainRoot,
    env: childEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  options.onChild?.(child);

  const stdoutP = child.stdout ? collectStream(child.stdout) : Promise.resolve('');
  const streamProgress = Boolean(options.progressJson && options.onIngestProgress);
  const stderrP = streamProgress
    ? collectStderrWithProgress(child, options.onIngestProgress!)
    : child.stderr
      ? collectStream(child.stderr)
      : Promise.resolve('');

  const codeP = new Promise<number>((resolve, reject) => {
    child.once('error', (err) => {
      child.stdout?.destroy();
      child.stderr?.destroy();
      reject(err);
    });
    child.once('close', (c) => resolve(c ?? 1));
  });
  const [stdout, stderr, code] = await Promise.all([stdoutP, stderrP, codeP]);

  return {
    code,
    stdout,
    stderr,
    captureDir: parseCaptureDirFromStdout(stdout),
  };
}
