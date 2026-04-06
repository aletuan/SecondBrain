# Vault template: `Wiki/` layer

The real vault at `./vault/` is gitignored. This folder is a **copy-paste seed** for the LLM-maintained wiki described in [`PLAN.md`](../PLAN.md) (section 1).

## Install into your vault

From the Brain repo root (adjust if your vault lives elsewhere):

```bash
mkdir -p vault/Wiki
cp -R vault-template/Wiki/. vault/Wiki/
```

Or merge manually: copy the `Wiki/` tree into your Obsidian vault root so you have `Wiki/index.md` next to `Captures/`.

## Layout

See `Wiki/SCHEMA.md` for the canonical layout, editing rules, and how this relates to `Captures/**`.
