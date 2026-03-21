# Obsidian CLI — batch / tagging (optional)

This repo does **not** wrap the Obsidian CLI by default. If you want batch operations (tag many notes, run scripts), install the [Obsidian CLI](https://github.com/obsidianmd/obsidian-cli) separately and call it from your shell or a private script.

## Suggested pattern

- Keep vault path aligned with `VAULT_ROOT` in `.env`.
- Store reusable commands in your vault or a private dotfiles repo (not committed here).
- Prefer idempotent scripts (dry-run flag) before mutating hundreds of notes.

This satisfies **B8** “Obsidian CLI: wrapper batch tag” as **documentation + hook point**; a shared wrapper would be environment-specific.
