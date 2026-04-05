import 'dotenv/config';
import OpenAI from 'openai';
import { Command } from 'commander';
import {
  emitIngestDoneProgress,
  emitIngestErrorProgress,
  ingestUrlToCapture,
  reingestCaptureDir,
} from './cli/ingestCommands.js';
import { printError } from './cli/printError.js';
import type { OpenAIClientLike } from './llm/enrich.js';
import { applyTranslationToCaptureSource } from './llm/translateTranscript.js';
import { resolveUserPath } from './util/resolveUserPath.js';
import { getCaptureFiles } from './vault/writer.js';
import { writeSuggestedMilestonesForCapture } from './youtube/suggestMilestones.js';

const program = new Command()
  .name('second-brain')
  .description('Obsidian vault URL ingest CLI');

program
  .command('ingest')
  .argument('<url>', 'URL to ingest')
  .option(
    '--capture-dir <dir>',
    'overwrite an existing capture folder under the vault (in-place re-ingest)',
  )
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
        captureDir?: string;
      },
    ) => {
      try {
        const dir = await ingestUrlToCapture({
          url,
          captureDir: opts.captureDir,
          progressJson: opts.progressJson,
        });
        if (opts.progressJson) emitIngestDoneProgress(dir);
        console.log(dir);
      } catch (e) {
        if (opts.progressJson) {
          emitIngestErrorProgress(e instanceof Error ? e.message : String(e));
        }
        printError(e);
        process.exitCode = 1;
      }
    },
  );

program
  .command('reingest')
  .description('Re-fetch a capture using `url` from existing note/source frontmatter (in-place overwrite)')
  .requiredOption('--capture <dir>', 'capture folder (…/Captures/YYYY-MM-DD--slug--hash)')
  .option(
    '--progress-json',
    'emit one JSON progress object per line on stderr (v1 schema for Reader SSE)',
  )
  .action(async (opts: { capture: string; progressJson?: boolean }) => {
    try {
      const out = await reingestCaptureDir({
        capture: opts.capture,
        progressJson: opts.progressJson,
      });
      if (opts.progressJson) emitIngestDoneProgress(out);
      console.log(out);
    } catch (e) {
      if (opts.progressJson) {
        emitIngestErrorProgress(e instanceof Error ? e.message : String(e));
      }
      printError(e);
      process.exitCode = 1;
    }
  });

program
  .command('translate-transcript')
  .description('Add or replace ## Transcript (vi) in an existing YouTube capture (OpenAI)')
  .requiredOption('--capture <dir>', 'capture folder (…/Captures/YYYY-MM-DD--slug--id)')
  .action(async (opts: { capture: string }) => {
    try {
      const cwd = process.cwd();
      const dir = resolveUserPath(cwd, opts.capture);
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
      const dir = resolveUserPath(cwd, opts.capture);
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

program.parse();
