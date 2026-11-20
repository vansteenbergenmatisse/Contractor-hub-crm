# src/features

Loaded when working inside any feature. Root `CLAUDE.md` rules also apply.

- One folder per feature, kebab-case. Layout: `components/ api/ db/ hooks/ types.ts index.ts`.
- `index.ts` is the feature's public API. Export only what other code needs.
- Do not import from another feature's subfolders. Use its `index.ts`.
- Only `db/` talks to Prisma.
- Check `PROGRESS.md` before starting and update it when you finish.
- Keep the feature's tests in `tests/features/<feature>/`.
- If a feature grows past one screen of concern, split it into two features instead of adding nested layers.
