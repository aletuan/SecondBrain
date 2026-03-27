import 'dotenv/config';
import OpenAI from 'openai';
import path from 'node:path';
import { Command } from 'commander';
import {
  resolveDigestPathForWeek,
  writeChallengeFromDigestFile,
} from './challenge/fromDigest.js';
import { generateDigest } from './digest.js';
import type { IngestProgressEvent } from './ingest/ingestProgress.js';
import { runIngest } from './ingest/runIngest.js';
import type { OpenAIClientLike } from './llm/enrich.js';
import { applyTranslationToCaptureSource } from './llm/translateTranscript.js';
import { getCaptureFiles } from './vault/writer.js';
import { writeSuggestedMilestonesForCapture } from './youtube/suggestMilestones.js';

function printError(e: unknown): void {
  if (!(e instanceof Error)) {
    console.error(e);
    return;
  }
  console.error(e.message);
  let c: unknown = e.cause;
  let depth = 0;
  while (c instanceof Error && depth < 6) {
    console.error(`  Caused by: ${c.message}`);
    c = c.cause;
    depth += 1;
  }
}

const program = new Command()
  .name('second-brain')
  .description('Obsidian vault ingest & digest CLI');

program
  .command('ingest')
  .argument('<url>', 'URL to ingest')
  .option(
    '--progress-json',
    'emit one JSON progress object per line on stderr (v1 schema for Reader SSE)',
  )
  .description(
    'Ingest a URL into the vault (YouTube: auto Vi transcript when segments + OPENAI_API_KEY; always enrich note when OPENAI_API_KEY)',
  )
  .action(
    async (
      url: string,
      opts: {
        progressJson?: boolean;
      },
    ) => {
      const writeProgress = (ev: IngestProgressEvent) => {
        process.stderr.write(`${JSON.stringify(ev)}\n`);
      };
      try {
        const dir = await runIngest({
          url,
          onProgress: opts.progressJson ? (ev) => writeProgress(ev) : undefined,
        });
        if (opts.progressJson) {
          writeProgress({
            v: 1,
            kind: 'done',
            captureDir: dir,
            captureId: path.basename(dir),
          });
        }
        console.log(dir);
      } catch (e) {
        if (opts.progressJson) {
          writeProgress({
            v: 1,
            kind: 'error',
            message: e instanceof Error ? e.message : String(e),
          });
        }
        printError(e);
        process.exitCode = 1;
      }
    },
  );

program
  .command('translate-transcript')
  .description('Add or replace ## Transcript (vi) in an existing YouTube capture (OpenAI)')
  .requiredOption('--capture <dir>', 'capture folder (…/Captures/YYYY-MM-DD--slug--id)')
  .action(async (opts: { capture: string }) => {
    try {
      const cwd = process.cwd();
      const dir = path.isAbsolute(opts.capture)
        ? opts.capture
        : path.resolve(cwd, opts.capture);
      await applyTranslationToCaptureSource({ captureDir: dir });
      const { sourcePath } = await getCaptureFiles(dir);
      console.log(sourcePath);
    } catch (e) {
      printError(e);
      process.exitCode = 1;
    }
  });

program
  .command('suggest-milestones')
  .description('LLM-suggested milestones.yaml from ## Transcript (en) (merge with existing)')
  .requiredOption('--capture <dir>', 'capture folder')
  .requiredOption('--max-sec <n>', 'video length cap in seconds (milestones clamped to 0..n)')
  .action(async (opts: { capture: string; maxSec: string }) => {
    try {
      const cwd = process.cwd();
      const dir = path.isAbsolute(opts.capture)
        ? opts.capture
        : path.resolve(cwd, opts.capture);
      const maxSec = Number(opts.maxSec);
      const key = process.env.OPENAI_API_KEY?.trim();
      if (!key) throw new Error('suggest-milestones: OPENAI_API_KEY is not set');
      const model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
      const client = new OpenAI({ apiKey: key }) as unknown as OpenAIClientLike;
      const out = await writeSuggestedMilestonesForCapture({
        captureDir: dir,
        maxSec,
        client,
        model,
      });
      console.log(out);
    } catch (e) {
      printError(e);
      process.exitCode = 1;
    }
  });

program
  .command('challenge')
  .description('Generate Challenges/YYYY-Www.md from a digest (OpenAI)')
  .option('--digest <path>', 'path to Digests/….md (absolute or relative to cwd)')
  .option('--week <id>', 'digest week id e.g. 2026-W12 (under vault/Digests/)')
  .action(
    async (opts: { digest?: string; week?: string }) => {
      try {
        const cwd = process.cwd();
        const vaultRoot = path.resolve(cwd, process.env.VAULT_ROOT?.trim() || 'vault');
        let digestPath: string;
        if (opts.digest) {
          digestPath = path.isAbsolute(opts.digest)
            ? opts.digest
            : path.resolve(cwd, opts.digest);
        } else if (opts.week) {
          digestPath = resolveDigestPathForWeek(vaultRoot, opts.week);
        } else {
          throw new Error('challenge: provide --digest <file> or --week 2026-W12');
        }
        const { challengePath } = await writeChallengeFromDigestFile({
          digestPath,
          vaultRoot,
        });
        console.log(challengePath);
      } catch (e) {
        printError(e);
        process.exitCode = 1;
      }
    },
  );

program
  .command('digest')
  .option('--since <range>', 'lookback window, e.g. 7d', '7d')
  .option('--no-llm', 'skip digest LLM section')
  .description('Generate weekly digest note under Digests/')
  .action(async (opts: { since: string; llm?: boolean }) => {
    try {
      const cwd = process.cwd();
      const vaultRoot = path.resolve(cwd, process.env.VAULT_ROOT?.trim() || 'vault');
      const { digestPath } = await generateDigest({
        vaultRoot,
        since: opts.since,
        skipLlm: opts.llm === false,
      });
      console.log(digestPath);
    } catch (e) {
      printError(e);
      process.exitCode = 1;
    }
  });

program.parse();
