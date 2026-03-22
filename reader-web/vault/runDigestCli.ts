import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { assertIngestEnvironment } from './runIngestCli.js';

function collectStream(stream: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (c: string | Buffer) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

/** Last stdout line that looks like a digest file path (…/Digests/YYYY-Www.md). */
export function parseDigestWeekFromStdout(stdout: string): string | null {
  const lines = stdout
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i]!;
    if (line.includes(`${path.sep}Digests${path.sep}`) || line.includes('/Digests/')) {
      const base = path.basename(line);
      const m = /^(\d{4}-W\d{2})\.md$/i.exec(base);
      if (m) return m[1]!;
    }
  }
  return null;
}

export type DigestCliOptions = {
  /** Lookback window, e.g. `7d` (must match Brain `digest` parser). */
  since?: string;
  noLlm?: boolean;
  cwd?: string;
};

/**
 * Runs Brain `digest` like `pnpm digest` / `tsx src/cli.ts digest` with `VAULT_ROOT` set to the reader vault.
 */
export async function runDigestCli(options: DigestCliOptions): Promise<{
  code: number;
  stdout: string;
  stderr: string;
  weekId: string | null;
}> {
  const { brainRoot, vaultRoot } = await assertIngestEnvironment(options.cwd);
  const tsxCli = path.join(brainRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const cliTs = path.join(brainRoot, 'src', 'cli.ts');
  await fs.access(tsxCli);

  const since = options.since?.trim() || '7d';
  const args = [tsxCli, cliTs, 'digest', '--since', since];
  if (options.noLlm) args.push('--no-llm');

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
    weekId: parseDigestWeekFromStdout(stdout),
  };
}
