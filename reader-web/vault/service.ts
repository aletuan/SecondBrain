import fs from 'node:fs/promises';
import path from 'node:path';
import { stripFrontmatter, firstHeading } from './frontmatter.js';
import { extractTranscriptSection } from './transcript.js';
import { loadMilestones } from './milestones.js';
import { resolveVaultRoot } from './paths.js';

const FOLDER_RE = /^[\w-]+$/;

function safeCaptureId(id: string): boolean {
  return FOLDER_RE.test(id) && id.includes('--');
}

export type CaptureListItem = {
  id: string;
  title: string;
  url: string;
  fetch_method: string;
  source: string;
  ingested_at: string;
  publish: boolean;
  youtube_video_id?: string;
};

export async function listCaptures(): Promise<{ captures: CaptureListItem[]; vaultRoot: string }> {
  const vaultRoot = resolveVaultRoot();
  const capDir = path.join(vaultRoot, 'Captures');
  let entries: { name: string; isDirectory: () => boolean }[] = [];
  try {
    entries = await fs.readdir(capDir, { withFileTypes: true });
  } catch {
    return { captures: [], vaultRoot };
  }
  const items: CaptureListItem[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const id = e.name;
    if (!safeCaptureId(id)) continue;
    const notePath = path.join(capDir, id, 'note.md');
    let raw: string;
    try {
      raw = await fs.readFile(notePath, 'utf8');
    } catch {
      continue;
    }
    const { fm, body } = stripFrontmatter(raw);
    const title = firstHeading(body) || id;
    items.push({
      id,
      title,
      url: String(fm.url ?? ''),
      fetch_method: String(fm.fetch_method ?? ''),
      source: String(fm.source ?? 'web'),
      ingested_at: String(fm.ingested_at ?? ''),
      publish: fm.publish === true,
      youtube_video_id:
        typeof fm.youtube_video_id === 'string' ? fm.youtube_video_id : undefined,
    });
  }
  items.sort((a, b) => (a.ingested_at < b.ingested_at ? 1 : -1));
  return { captures: items, vaultRoot };
}

export type CaptureDetail = {
  id: string;
  vaultRoot: string;
  noteFm: Record<string, string | boolean>;
  sourceFm: Record<string, string | boolean>;
  noteBody: string;
  sourceBody: string;
  youtubeVideoId: string | null;
  transcriptEn: string;
  transcriptVi: string;
  milestones: Awaited<ReturnType<typeof loadMilestones>>;
};

export async function getCapture(id: string): Promise<CaptureDetail | null> {
  if (!safeCaptureId(id)) return null;
  const vaultRoot = resolveVaultRoot();
  const dir = path.join(vaultRoot, 'Captures', id);
  let noteRaw: string;
  let sourceRaw: string;
  try {
    noteRaw = await fs.readFile(path.join(dir, 'note.md'), 'utf8');
    sourceRaw = await fs.readFile(path.join(dir, 'source.md'), 'utf8');
  } catch {
    return null;
  }
  const note = stripFrontmatter(noteRaw);
  const source = stripFrontmatter(sourceRaw);
  const ytid =
    (note.fm.youtube_video_id as string | undefined) ||
    (source.fm.youtube_video_id as string | undefined) ||
    null;
  const milestones = await loadMilestones(dir);
  return {
    id,
    vaultRoot,
    noteFm: note.fm,
    sourceFm: source.fm,
    noteBody: note.body.trim(),
    sourceBody: source.body.trim(),
    youtubeVideoId: ytid,
    transcriptEn: extractTranscriptSection(source.body, 'en'),
    transcriptVi: extractTranscriptSection(source.body, 'vi'),
    milestones,
  };
}

export async function listDigests(): Promise<{ id: string; week: string }[]> {
  const vaultRoot = resolveVaultRoot();
  const ddir = path.join(vaultRoot, 'Digests');
  let files: string[] = [];
  try {
    files = await fs.readdir(ddir);
  } catch {
    return [];
  }
  const out: { id: string; week: string }[] = [];
  for (const f of files) {
    if (!f.endsWith('.md')) continue;
    const id = f.replace(/\.md$/, '');
    out.push({ id, week: id });
  }
  out.sort((a, b) => (a.id < b.id ? 1 : -1));
  return out;
}

export async function getDigest(weekId: string): Promise<string | null> {
  if (!/^[\d]{4}-W\d{2}$/.test(weekId)) return null;
  const vaultRoot = resolveVaultRoot();
  const p = path.join(vaultRoot, 'Digests', `${weekId}.md`);
  try {
    return await fs.readFile(p, 'utf8');
  } catch {
    return null;
  }
}

export async function getChallenge(weekId: string): Promise<string | null> {
  if (!/^[\d]{4}-W\d{2}$/.test(weekId)) return null;
  const vaultRoot = resolveVaultRoot();
  const p = path.join(vaultRoot, 'Challenges', `${weekId}.md`);
  try {
    return await fs.readFile(p, 'utf8');
  } catch {
    return null;
  }
}
