/**
 * CLI digest lines use Obsidian wikilinks: `[[Captures/<folder>/<slug>.note|Title]]`
 * (`src/digest.ts` → `generateDigest`). Legacy: `[[Captures/<id>/note|Title]]`.
 * Marked does not parse `[[...]]`; convert to markdown links the SPA understands.
 */
export function transformDigestCapturesWikilinks(markdown: string): string {
  const mdLink = (folder: string, display: string) => {
    const id = folder.trim();
    const raw = display.trim() || id;
    const label = raw
      .replace(/\\/g, '\\\\')
      .replace(/\[/g, '\\[')
      .replace(/\]/g, '\\]');
    return `[${label}](#/capture/${encodeURIComponent(id)})`;
  };
  let s = markdown;
  // Current digest format: path ends with `<slug>.note` (not bare `/note`)
  s = s.replace(
    /\[\[Captures\/([^/]+)\/([^|\]]+\.note)\|([^\]]+)\]\]/g,
    (_, folder: string, _file: string, alias: string) => mdLink(folder, alias),
  );
  s = s.replace(/\[\[Captures\/([^/]+)\/([^|\]]+\.note)\]\]/g, (_, folder: string, _file: string) =>
    mdLink(folder, folder),
  );
  // Legacy wikilinks
  s = s.replace(/\[\[Captures\/(.+?)\/note\|([^\]]+)\]\]/g, (_, folder: string, alias: string) =>
    mdLink(folder, alias),
  );
  s = s.replace(/\[\[Captures\/(.+?)\/note\]\]/g, (_, folder: string) => mdLink(folder, folder));
  return s;
}
