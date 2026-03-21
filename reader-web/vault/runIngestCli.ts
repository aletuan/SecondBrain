import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
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
  url: string;
  noLlm?: boolean;
  /**
   * `undefined` — CLI defaults (YouTube + OPENAI_API_KEY → translate transcript).
   * `true` — `--translate-transcript` (strict errors if translation cannot run).
   * `false` — `--no-translate-transcript`.
   */
  translateTranscript?: boolean;
  cwd?: string;
};

/**
 * Runs the Brain CLI ingest in `brainRoot` via `node …/tsx/dist/cli.mjs src/cli.ts ingest …`.
 * Avoids `pnpm run ingest -- …`, which can forward a stray `--` into argv and break Commander
 * (“Expected 1 argument but got 2”).
 */
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

  const args = [tsxCli, cliTs, 'ingest'];
  if (options.noLlm) args.push('--no-llm');
  if (options.translateTranscript === false) args.push('--no-translate-transcript');
  if (options.translateTranscript === true) args.push('--translate-transcript');
  args.push(options.url);

  const child = spawn(process.execPath, args, {
    cwd: brainRoot,
    env: { ...process.env, VAULT_ROOT: vaultRoot },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const stdoutP = child.stdout ? collectStream(child.stdout) : Promise.resolve('');
  const stderrP = child.stderr ? collectStream(child.stderr) : Promise.resolve('');
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
