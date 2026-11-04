---
paths:
  - 'src/cli.ts'
  - 'src/cli-helpers.ts'
  - 'src/index.ts'
  - 'src/commands/**'
  - 'test/cli-startup.test.ts'
  - 'test/public-api.test.ts'
---

# CLI entry, paths and public surface

Moved from the root `CLAUDE.md`, which keeps a one-line hard rule for each; this file loads only for the paths above.

- **Path anchoring is deliberately dual**: catalog source (`catalog/`, `packs.yaml`, `schema/`) resolves from
  `PKG_ROOT = path.resolve(__dirname, '..')` in `src/cli-helpers.ts`. The `--project-dir` default (`process.cwd()`)
  is set in `src/cli.ts` option definitions and must never anchor on `PKG_ROOT`.
- **`src/cli.ts` loads command modules lazily** — wire a command with `.action(lazy(async () => (await import('./commands/x')).runX))`,
  never a top-level `import { runX }`. An eager import puts that command's whole import tree on every start, including
  `--version` and `--help` (about 95 ms for all of them; the test suite starts the CLI 100+ times).
  `test/cli-startup.test.ts` fails when a command module loads during `--version` or `--help`.
- **Conflict handling** (`partitionFiles` in `src/cli-helpers.ts`): candidate paths split into `toWrite` (new, always
  written) and `conflicting` (exists, never touched without `--overwrite`). Two targets never own one file: `codex` and
  `agents-standard` write the same `.agents/skills/` files, so `add` refuses the second (`Target.sharesSkillFilesWith`).
- **`src/index.ts` is sigil's entire public library surface, curated deliberately — never add a symbol to it without
  meaning to publish it**. The deliberately promoted surface is the pure `config-merge` primitives. `package.json`
  `exports` exposes only `"."` and `"./package.json"`. Any other `require('sigil/dist-cli/…')` throws
  `ERR_PACKAGE_PATH_NOT_EXPORTED`. `test/public-api.test.ts` guards both directions. (see F25,
  `docs/decisions/catalog-benchmark-audit-2026-08-22.md`)
