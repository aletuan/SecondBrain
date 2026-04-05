import fs from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import { pythonIngestBaseUrl } from './pythonIngest.js';
import { resolveBrainRepoRoot } from './paths.js';

export type CategoryEntry = { id: string; label: string };

/** Keep in sync with `cli/src/config/categories.ts` / `config/categories.example.yaml`. */
export async function loadCategoryTaxonomy(): Promise<CategoryEntry[]> {
  const pyBase = pythonIngestBaseUrl();
  if (pyBase) {
    const base = pyBase.replace(/\/$/, '');
    const apiKey = process.env.INGEST_API_KEY?.trim();
    const headers: Record<string, string> = {};
    if (apiKey) headers['X-Ingest-Key'] = apiKey;
    const r = await fetch(`${base}/v1/taxonomy/categories`, { headers });
    if (!r.ok) {
      throw new Error(`taxonomy: Python API ${r.status}: ${(await r.text()).slice(0, 500)}`);
    }
    const data = (await r.json()) as { items?: unknown };
    const items = data.items;
    if (!Array.isArray(items)) throw new Error('taxonomy: expected { items: array } from API');
    const entries: CategoryEntry[] = [];
    const seen = new Set<string>();
    for (const row of items) {
      if (!row || typeof row !== 'object') continue;
      const id = String((row as { id?: unknown }).id ?? '').trim();
      const label = String((row as { label?: unknown }).label ?? '').trim();
      if (!id || !label) throw new Error('taxonomy: each item needs id and label');
      if (seen.has(id)) throw new Error(`taxonomy: duplicate id "${id}"`);
      seen.add(id);
      entries.push({ id, label });
    }
    if (entries.length === 0) throw new Error('taxonomy: items is empty');
    return entries;
  }

  const brainRoot = resolveBrainRepoRoot(process.cwd());
  const local = path.join(brainRoot, 'config', 'categories.yaml');
  const fallback = path.join(brainRoot, 'config', 'categories.example.yaml');
  let raw: string;
  try {
    await fs.access(local);
    raw = await fs.readFile(local, 'utf8');
  } catch {
    raw = await fs.readFile(fallback, 'utf8');
  }
  return parseCategoriesYaml(raw);
}

function parseCategoriesYaml(yamlText: string): CategoryEntry[] {
  const doc = YAML.parse(yamlText) as unknown;
  if (!doc || typeof doc !== 'object') throw new Error('categories: expected YAML object');
  const items = (doc as { items?: unknown }).items;
  if (!Array.isArray(items)) throw new Error('categories: expected `items` array');

  const entries: CategoryEntry[] = [];
  const seen = new Set<string>();
  for (const row of items) {
    if (!row || typeof row !== 'object') continue;
    const id = String((row as { id?: unknown }).id ?? '').trim();
    const label = String((row as { label?: unknown }).label ?? '').trim();
    if (!id || !label) throw new Error('categories: each item needs non-empty id and label');
    if (seen.has(id)) throw new Error(`categories: duplicate id "${id}"`);
    seen.add(id);
    entries.push({ id, label });
  }
  if (entries.length === 0) throw new Error('categories: `items` is empty');
  return entries;
}

export function allowedCategoryIdsSorted(entries: CategoryEntry[]): string[] {
  return [...new Set(entries.map(e => e.id))].sort((a, b) => a.localeCompare(b));
}

/** Keep in sync with `cli/src/vault/writer.ts` `setCategoriesInNoteFrontmatter`. */
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
