import fs from 'node:fs';
import path from 'node:path';

/** Prefer `config/routing.yaml`; fall back to committed example. */
export function readRoutingYamlSync(cwd: string = process.cwd()): string {
  const local = path.join(cwd, 'config', 'routing.yaml');
  if (fs.existsSync(local)) return fs.readFileSync(local, 'utf8');
  return fs.readFileSync(path.join(cwd, 'config', 'routing.example.yaml'), 'utf8');
}
