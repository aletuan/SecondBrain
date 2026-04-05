import path from 'node:path';

/** Resolve a user-supplied path relative to `cwd` when not already absolute. */
export function resolveUserPath(cwd: string, userPath: string): string {
  return path.isAbsolute(userPath) ? userPath : path.resolve(cwd, userPath);
}
