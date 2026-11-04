---
paths:
  - 'src/config-merge/**'
  - 'src/manifest/**'
  - 'src/config-utils.ts'
  - 'src/freshness.ts'
  - 'src/install-state-prescaffold.ts'
  - 'src/commands/add/**'
  - 'src/commands/update*.ts'
  - 'src/commands/uninstall*.ts'
---

# Config merge, drift and installs

Moved from the root `CLAUDE.md`, which keeps a one-line hard rule for each; this file loads only for the paths above.

- **`serialize()` vs `canonicalize()`** (`src/config-merge/primitives.ts`) are not interchangeable. `serialize()` is
  order-preserving and the only JSON disk writer, reached through `renderConfig` (`src/config-merge/file-format.ts`) from
  `commands/add/execute-config.ts`, `commands/update-config-io.ts` and `commands/uninstall-config.ts`. A `.toml` path goes to
  `renderToml` (`src/config-merge/toml-file.ts`) instead, which splices whole `[mcp_servers.<key>]` tables into the user's
  text and refuses to write unless the result parses back to the merged object. `reverseMerge` prunes only along the paths the
  op touched, because a user's empty value elsewhere isn't sigil's to remove. `canonicalize()` is sorted and used only to hash fragments
  (`sha256(canonicalize(...))` in `src/manifest/mutate-config.ts`, `src/commands/update-config-catalog.ts`,
  `src/install-state-prescaffold.ts`). Never write a file with `canonicalize()`.
- **Config-kind writes (`mcp`/`hook`/`settings`) merge into user-owned JSON**, never overwrite it. A home-directory
  write takes one pristine `.sigil.bak` before the first write to a file that holds content sigil did not write; a
  file holding only sigil's recorded entries gets none (the check reverses every fragment the manifest records for
  the file, which callers pass in) (`docs/reference/config-kinds.md`).
  `ensureHomeBackup` / `isHomeScopedRoot` (`src/config-utils.ts`) must be called from every writer that can touch a
  home-scoped file — `add` (`commands/add/execute-config.ts`), `update` (`commands/update-config-io.ts`), and
  `uninstall` (`commands/uninstall-config.ts`). A fourth writer must call them too. (see F23,
  `docs/decisions/catalog-benchmark-audit-2026-08-22.md`)
- **Config-kind drift is classified, not booleanized** (`classifyConfigDrift` in `src/config-merge/drift.ts` returns
  `intact` / `missing` / `modified`). `missing` auto-restores without `--force`; `modified` requires `--force`. An
  absent `array-union` / `array-append` item classifies as `missing`, never `modified`: both strategies are
  non-destructive to re-apply (union dedupes, append only concatenates). `object-spread` leaf assignment can
  overwrite a user's edit, which is why `modified` still requires `--force`. Restore writes the catalog op via
  `updateFromCatalog` (`src/commands/update-config.ts`), never the manifest copy; a destination with no catalog op
  is skipped. `detectConfigDrift` stays the boolean wrapper (`!== 'intact'`). (see F14,
  `docs/decisions/catalog-usage-audit-2026-08-21.md`)
- **A config fragment sigil already installed is replaced, never merged again** (`replaceMerge` in
  `src/config-merge/replace.ts`: reverse the recorded fragment, then apply the new one). `add` and `update` both use
  it. A plain `applyMerge` of an `array-append` hook stacks a second copy. Any new config-JSON writer must look up the
  recorded fragment with `previousOpFor` (`src/manifest/config-fragments.ts`) and do the same.
- **`add` and `update` render with the same co-install set** — everything installed for the target plus the picks and
  their dependencies (`src/commands/add/co-install.ts`, `installedIdsFor` in `src/commands/update.ts`). A smaller set
  strips a skill's or agent's Boundary ("See also") from files `add` wrote.
