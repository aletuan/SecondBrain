import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

export type CategoryEntry = { id: string; label: string };

/** Prefer `config/categories.yaml`; fall back to committed example. */
export function readCategoriesYamlSync(cwd: string = process.cwd()): string {
  const local = path.join(cwd, 'config', 'categories.yaml');
  if (fs.existsSync(local)) return fs.readFileSync(local, 'utf8');
  return fs.readFileSync(path.join(cwd, 'config', 'categories.example.yaml'), 'utf8');
}

export function loadCategoriesFromYamlText(yamlText: string): CategoryEntry[] {
  return parseCategoriesYaml(yamlText);
}

export function loadCategoriesFromRepo(cwd: string = process.cwd()): CategoryEntry[] {
  return parseCategoriesYaml(readCategoriesYamlSync(cwd));
}

export function parseCategoriesYaml(yamlText: string): CategoryEntry[] {
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

/** Stable sort by id for LLM output and tests. */
export function getAllowedCategoryIdsSorted(entries: CategoryEntry[]): string[] {
  return [...new Set(entries.map(e => e.id))].sort((a, b) => a.localeCompare(b));
}
