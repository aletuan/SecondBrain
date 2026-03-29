import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { CaptureBundle } from '../types/capture.js';

/** Twimg often rejects anonymous hotlinks; match browser context + optional session cookies (see docs/handoffs X ingest). */
function requestInitForCaptureImage(url: string): RequestInit | undefined {
  let host: string;
  try {
    host = new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return undefined;
  }
  if (host !== 'pbs.twimg.com' && !host.endsWith('.twimg.com')) return undefined;

  const headers: Record<string, string> = {
    Referer: 'https://x.com/',
    'User-Agent':
      'Mozilla/5.0 (compatible; SecondBrainCapture/1.0; +https://x.com/) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  };
  const auth = process.env.TWITTER_AUTH_TOKEN?.trim();
  const ct0 = process.env.TWITTER_CT0?.trim();
  if (auth && ct0) {
    headers.Cookie = `auth_token=${auth}; ct0=${ct0}`;
  }
  return { headers };
}

function formatTimestamp(sec: number): string {
  const s = Math.max(0, sec);
  const mm = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return `${mm}:${String(ss).padStart(2, '0')}`;
}

export function buildSourceMarkdownBody(bundle: CaptureBundle): string {
  if (bundle.source !== 'youtube') {
    return `# ${bundle.title}\n\n${bundle.textPlain}\n`;
  }
  const watchLine =
    bundle.youtubeVideoId != null
      ? `> YouTube: https://www.youtube.com/watch?v=${bundle.youtubeVideoId}`
      : `> ${bundle.canonicalUrl}`;
  const lines = [
    `# ${bundle.title}`,
    '',
    watchLine,
    '',
    '## Transcript (en)',
    '',
  ];
  const segs = bundle.transcriptSegments;
  if (segs && segs.length > 0) {
    for (const seg of segs) {
      if (seg.startSec != null && Number.isFinite(seg.startSec)) {
        lines.push(`**${formatTimestamp(seg.startSec)}** ${seg.text}`, '');
      } else {
        lines.push(seg.text, '');
      }
    }
  } else {
    lines.push(bundle.textPlain, '');
  }
  const enBody = `${lines.join('\n')}\n`;
  const viSegs = bundle.transcriptSegmentsVi;
  if (!viSegs?.length) return enBody;
  const disclaimer =
    '> Bản dịch do LLM tạo; đối chiếu với **Transcript (en)** khi cần độ chính xác.';
  const viLines = [
    '',
    '## Transcript (vi) — bản dịch (LLM)',
    '',
    disclaimer,
    '',
  ];
  for (const seg of viSegs) {
    if (seg.startSec != null && Number.isFinite(seg.startSec)) {
      viLines.push(`**${formatTimestamp(seg.startSec)}** ${seg.text}`, '');
    } else {
      viLines.push(seg.text, '');
    }
  }
  return `${enBody}${viLines.join('\n')}`;
}

const DEFAULT_MAX_IMAGE_BYTES = 2_000_000;

/** Reject HTML/JSON masquerading as images (wrong content-type or broken CDN). */
function bufferLooksLikeImage(buf: Uint8Array): boolean {
  if (buf.length < 3) return false;
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return true;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true;
  if (buf.length >= 6 && buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return true;
  if (
    buf.length >= 12 &&
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  )
    return true;
  return false;
}

function extensionFromContentType(ct: string, fallbackUrl: string): string {
  if (ct.includes('png')) return '.png';
  if (ct.includes('jpeg') || ct.includes('jpg')) return '.jpg';
  if (ct.includes('gif')) return '.gif';
  if (ct.includes('webp')) return '.webp';
  if (ct.includes('svg')) return '.svg';
  try {
    const ext = path.extname(new URL(fallbackUrl).pathname);
    if (ext && ext.length <= 6) return ext;
  } catch {
    /* ignore */
  }
  return '.bin';
}

export type WriteCaptureResult = {
  /** Absolute path to the capture folder */
  captureDir: string;
  /** Path relative to vault root, e.g. Captures/2026-03-20--slug--a1b2c3 */
  relativeFolder: string;
};

/** Extracts the slug from a capture directory name.
 *  `2026-03-21--how-i-code--8dc9f7` → `how-i-code`
 */
export function getSlugFromDir(dirName: string): string {
  const parts = dirName.split('--');
  if (parts.length >= 3) {
    return parts.slice(1, -1).join('--');
  }
  return dirName;
}

/** Returns paths for source and note files.
 *  Scans for `*.source.md` / `*.note.md` first; falls back to legacy `source.md` / `note.md`.
 */
export async function getCaptureFiles(captureDir: string): Promise<{
  sourcePath: string;
  notePath: string;
}> {
  try {
    const files = await fs.readdir(captureDir);
    const sourceFile = files.find(f => f.endsWith('.source.md'));
    const noteFile = files.find(f => f.endsWith('.note.md'));
    return {
      sourcePath: sourceFile
        ? path.join(captureDir, sourceFile)
        : path.join(captureDir, 'source.md'),
      notePath: noteFile
        ? path.join(captureDir, noteFile)
        : path.join(captureDir, 'note.md'),
    };
  } catch {
    /* ignore */
  }
  return {
    sourcePath: path.join(captureDir, 'source.md'),
    notePath: path.join(captureDir, 'note.md'),
  };
}

function slugify(input: string): string {
  const s = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return (s || 'capture').slice(0, 80);
}

function shortId(canonicalUrl: string): string {
  return crypto.createHash('sha256').update(canonicalUrl).digest('hex').slice(0, 6);
}

function formatFrontmatter(
  fields: Record<string, string | boolean>,
): string {
  const lines = ['---'];
  for (const [k, v] of Object.entries(fields)) {
    if (typeof v === 'boolean') lines.push(`${k}: ${v}`);
    else lines.push(`${k}: ${JSON.stringify(v)}`);
  }
  lines.push('---');
  return `${lines.join('\n')}\n`;
}

/** Writes `source.md` and initial `note.md` under `Captures/YYYY-MM-DD--slug--shortid/`. */
export async function writeCapture(
  vaultRoot: string,
  bundle: CaptureBundle,
  options?: { ingestedAt?: Date },
): Promise<WriteCaptureResult> {
  const ingested = options?.ingestedAt ?? new Date(bundle.fetchedAt);
  const day = ingested.toISOString().slice(0, 10);
  const slug = slugify(bundle.title || bundle.canonicalUrl);
  const sid = shortId(bundle.canonicalUrl);
  const folderName = `${day}--${slug}--${sid}`;
  const relativeFolder = path.join('Captures', folderName);
  const captureDir = path.join(vaultRoot, relativeFolder);
  await fs.mkdir(captureDir, { recursive: true });

  const baseFm: Record<string, string | boolean> = {
    type: 'capture',
    url: bundle.canonicalUrl,
    ingested_at: ingested.toISOString(),
    fetch_method: bundle.fetchMethod,
    publish: false,
  };
  if (bundle.source === 'youtube') {
    baseFm.source = 'youtube';
    if (bundle.youtubeVideoId) baseFm.youtube_video_id = bundle.youtubeVideoId;
    baseFm.transcript_locale =
      bundle.transcriptSegmentsVi?.length ? 'en,vi' : 'en';
    if (bundle.transcriptSegmentsVi?.length) baseFm.transcript_vi = true;
  }

  const sourceBody = buildSourceMarkdownBody(bundle);
  const sourceMd = formatFrontmatter(baseFm) + sourceBody;

  const noteFm: Record<string, string | boolean> = {
    type: 'capture',
    url: bundle.canonicalUrl,
    ingested_at: ingested.toISOString(),
    fetch_method: bundle.fetchMethod,
    publish: false,
  };
  if (bundle.source === 'youtube') {
    noteFm.source = 'youtube';
    if (bundle.youtubeVideoId) noteFm.youtube_video_id = bundle.youtubeVideoId;
  }

  const noteMd = formatFrontmatter(noteFm) + `# ${bundle.title}\n\n`;

  await fs.writeFile(path.join(captureDir, `${slug}.source.md`), sourceMd, 'utf8');
  await fs.writeFile(path.join(captureDir, `${slug}.note.md`), noteMd, 'utf8');

  return { captureDir, relativeFolder: relativeFolder.split(path.sep).join('/') };
}

/** Folder basename: `YYYY-MM-DD--slug--[a-f0-9]{6}` */
const CAPTURE_FOLDER_NAME_RE = /^\d{4}-\d{2}-\d{2}--.+--[a-f0-9]{6}$/;

/** Single-line YAML frontmatter (same subset as reader-web `stripFrontmatter`). */
function stripSimpleYamlFrontmatter(raw: string): { fm: Record<string, string | boolean>; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\s*/.exec(raw);
  if (!m) return { fm: {}, body: raw };
  const fm: Record<string, string | boolean> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([\w-]+):\s*(.+)$/.exec(line.trim());
    if (!kv) continue;
    const k = kv[1]!;
    let v = kv[2]!.trim();
    if (v === 'true') {
      fm[k] = true;
      continue;
    }
    if (v === 'false') {
      fm[k] = false;
      continue;
    }
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    fm[k] = v;
  }
  return { fm, body: raw.slice(m[0].length) };
}

/**
 * Ensures `captureDirInput` resolves to a folder under `<vaultRoot>/Captures/<id>/`
 * with a valid capture folder name.
 */
export function assertCaptureDirUnderVault(vaultRoot: string, captureDirInput: string): string {
  const capturesRoot = path.resolve(path.join(vaultRoot, 'Captures'));
  const resolved = path.resolve(captureDirInput);
  const rel = path.relative(capturesRoot, resolved);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error('capture-dir must be a directory under vault Captures/');
  }
  const base = path.basename(resolved);
  if (!CAPTURE_FOLDER_NAME_RE.test(base)) {
    throw new Error(
      `capture-dir folder name must match YYYY-MM-DD--slug--hash (6 hex); got "${base}"`,
    );
  }
  return resolved;
}

/** Removes `assets/` under the capture (images re-fetched on next ingest). Preserves `.comment`, `milestones.yaml`. */
export async function clearCaptureAssetsDir(captureDir: string): Promise<void> {
  const assetsDir = path.join(captureDir, 'assets');
  try {
    await fs.rm(assetsDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

/**
 * Overwrites existing `*.source.md` / `*.note.md` in place (same basenames as `getCaptureFiles`).
 * Clears `assets/`; caller should run `downloadImagesToAssets` after.
 */
export async function overwriteCaptureAtDir(
  captureDirAbs: string,
  bundle: CaptureBundle,
  options?: { ingestedAt?: Date },
): Promise<void> {
  const ingested = options?.ingestedAt ?? new Date(bundle.fetchedAt);
  const { sourcePath, notePath } = await getCaptureFiles(captureDirAbs);

  const baseFm: Record<string, string | boolean> = {
    type: 'capture',
    url: bundle.canonicalUrl,
    ingested_at: ingested.toISOString(),
    fetch_method: bundle.fetchMethod,
    publish: false,
  };
  if (bundle.source === 'youtube') {
    baseFm.source = 'youtube';
    if (bundle.youtubeVideoId) baseFm.youtube_video_id = bundle.youtubeVideoId;
    baseFm.transcript_locale = bundle.transcriptSegmentsVi?.length ? 'en,vi' : 'en';
    if (bundle.transcriptSegmentsVi?.length) baseFm.transcript_vi = true;
  }

  const sourceBody = buildSourceMarkdownBody(bundle);
  const sourceMd = formatFrontmatter(baseFm) + sourceBody;

  const noteFm: Record<string, string | boolean> = {
    type: 'capture',
    url: bundle.canonicalUrl,
    ingested_at: ingested.toISOString(),
    fetch_method: bundle.fetchMethod,
    publish: false,
  };
  if (bundle.source === 'youtube') {
    noteFm.source = 'youtube';
    if (bundle.youtubeVideoId) noteFm.youtube_video_id = bundle.youtubeVideoId;
  }

  const noteMd = formatFrontmatter(noteFm) + `# ${bundle.title}\n\n`;

  await fs.writeFile(sourcePath, sourceMd, 'utf8');
  await fs.writeFile(notePath, noteMd, 'utf8');
  await clearCaptureAssetsDir(captureDirAbs);
}

/** Reads first valid `http(s)` URL from note then source frontmatter. */
export async function readIngestUrlFromCaptureDir(captureDir: string): Promise<string> {
  const { notePath, sourcePath } = await getCaptureFiles(captureDir);
  for (const p of [notePath, sourcePath]) {
    let raw: string;
    try {
      raw = await fs.readFile(p, 'utf8');
    } catch {
      continue;
    }
    const { fm } = stripSimpleYamlFrontmatter(raw);
    const u = fm.url;
    if (typeof u === 'string' && u.trim()) {
      const s = u.trim();
      try {
        const parsed = new URL(s);
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return s;
      } catch {
        /* try next file */
      }
    }
  }
  throw new Error('reingest: no valid http(s) url in note/source frontmatter');
}

/** Inserts `tags: [...]` into the YAML frontmatter of note.md. No-op if tags is empty. */
export async function addTagsToNoteFrontmatter(
  notePath: string,
  tags: string[],
): Promise<void> {
  if (tags.length === 0) return;
  const content = await fs.readFile(notePath, 'utf8');
  const tagsLine = `tags: [${tags.map(t => JSON.stringify(t)).join(', ')}]`;
  // Insert before closing --- of frontmatter
  const updated = content.replace(/^(---\n[\s\S]*?)(---)/m, `$1${tagsLine}\n$2`);
  await fs.writeFile(notePath, updated, 'utf8');
}

/** Sets or replaces `categories: [...]` in note frontmatter. Omits the key when ids is empty. */
export async function setCategoriesInNoteFrontmatter(
  notePath: string,
  ids: string[],
): Promise<void> {
  const content = await fs.readFile(notePath, 'utf8');
  const m = /^---\r?\n([\s\S]*?)\r?\n---\s*/m.exec(content);
  if (!m) throw new Error('setCategoriesInNoteFrontmatter: missing YAML frontmatter');
  const inner = m[1] ?? '';
  const after = content.slice(m[0].length);
  const lines = inner.split(/\r?\n/);
  const kept = lines.filter(line => !/^\s*categories:\s*/.test(line));
  const body = kept.join('\n').replace(/\s+$/, '');
  const catsLine =
    ids.length > 0
      ? `categories: [${ids.map(id => JSON.stringify(id)).join(', ')}]`
      : '';
  const newInner = catsLine ? `${body}\n${catsLine}\n` : `${body}\n`;
  await fs.writeFile(notePath, `---\n${newInner}---\n${after}`, 'utf8');
}

/** Fetch remote images into `assets/` and append Obsidian embeds to `note.md`. */
export async function downloadImagesToAssets(
  bundle: CaptureBundle,
  captureDir: string,
  options?: { fetchImpl?: typeof fetch; maxBytes?: number },
): Promise<void> {
  const fetchImpl = options?.fetchImpl ?? fetch;
  const maxBytes =
    options?.maxBytes ??
    Number(process.env.CAPTURE_IMAGE_MAX_BYTES ?? DEFAULT_MAX_IMAGE_BYTES);
  if (!Number.isFinite(maxBytes) || maxBytes <= 0) return;

  const assetsDir = path.join(captureDir, 'assets');
  await fs.mkdir(assetsDir, { recursive: true });
  const { notePath } = await getCaptureFiles(captureDir);
  const lines: string[] = [];
  let index = 0;
  for (const img of bundle.images) {
    try {
      const init = requestInitForCaptureImage(img.url);
      const res = await fetchImpl(img.url, init);
      if (!res.ok) continue;
      const ct = (res.headers.get('content-type') ?? '').toLowerCase();
      if (!ct.startsWith('image/')) continue;
      const buf = new Uint8Array(await res.arrayBuffer());
      if (buf.byteLength > maxBytes) continue;
      if (!bufferLooksLikeImage(buf)) continue;
      const ext = extensionFromContentType(ct, img.url);
      const name = `img-${index++}${ext}`;
      await fs.writeFile(path.join(assetsDir, name), buf);
      const safeAlt = img.alt.replace(/[\]|]/g, '');
      lines.push(`![[assets/${name}|${safeAlt}]]`);
    } catch {
      continue;
    }
  }
  if (lines.length === 0) return;
  await fs.appendFile(
    notePath,
    `\n\n## Hình ảnh\n\n${lines.join('\n')}\n`,
    'utf8',
  );
}
