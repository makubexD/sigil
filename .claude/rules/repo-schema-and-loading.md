---
paths:
  - 'src/schema/**'
  - 'src/kinds.ts'
  - 'src/select/**'
  - 'src/authoring/**'
  - 'src/load.ts'
  - 'src/load-references.ts'
  - 'src/safe-read.ts'
  - 'src/frontmatter-parse.ts'
  - 'src/catalog-cache.ts'
  - 'src/packs-config.ts'
---

# Schema, loading and selection

Moved from the root `CLAUDE.md`, which keeps a one-line hard rule for each; this file loads only for the paths above.

- **Route every authored scalar through `serializeScalar`** (`src/authoring/frontmatter.ts`, called from
  `serializeYamlEntry`). It quotes strings containing `\n`, `:`, or `"`, and strings starting with `#`, `*`, `[`, or
  `{`. A `"` anywhere in the string is quoted, not only a leading one. It also quotes any string whose plain form
  would not parse back as the same string (dates, numbers, `true`, `null`, …), so a rewrite never changes a type.
- **`KIND_ORDER` (`src/select/selection.ts`) is derived from `KIND_REGISTRY`'s `selectorOrder`** in `src/kinds.ts`
  (selection.ts re-exports it), the same way `ALL_KINDS` derives from `displayOrder`. Never hand-list kinds in a
  second array — a kind added to `KIND_REGISTRY` without `selectorOrder` fails to compile. The same goes for where a
  kind's source lives: `sourceDir` / `sourceSuffix` on `KIND_REGISTRY`, read through `sourceGlob`, `sourceRelPath`
  and `kindOfSourceFile` (loading, kind inference, `new`, `move`). Never build a source path as `${kind}s`.
- **`src/schema/index.ts` (zod) is the single schema source of truth.** `src/schema/emit.ts` generates
  `schema/*.schema.json` from it via `npm run build`. Changing a zod schema without rebuilding leaves the JSON Schemas
  stale — commit both.
- **Every `id`/`name` frontmatter value that an adapter interpolates into an output file path is schema-constrained to
  a safe kebab-case shape** (`KEBAB_ID_RE` / `KEBAB_NAME_RE` in `src/schema/shared.ts`), enforced by `checkSchema`
  (`src/validate/schema-checks.ts`) inside `validateCatalog` — the `sigil validate` / `sigil build` gate.
  `checkNameConsistency` (`src/authoring/check-source-conventions.ts`) is authoring-only (`move` / `import` / `new` /
  `patch` / `edit` / `retarget` / `check`) and is not that gate. `writeFilesSync` and `partitionFiles`
  (`src/cli-helpers.ts`) also call `resolveContained()`. Never remove either layer. (see F22,
  `docs/decisions/catalog-benchmark-audit-2026-08-22.md`)
- **`resolveSelection()`** (`src/select/selector-resolve.ts`) checks each artifact's kind against the target's
  scaffold capabilities. Unsupported kinds go to `skipped[]` — warn-and-skip, not an error. Install paths (`add`, the
  wizard's lists and preview, `add`'s dependency closure) use `installableKinds` / `isInstallable` (`native` only): a
  `via` kind is delivered but only inside another artifact, so picking it alone is skipped with that reason, never
  scaffolded. `supportsKind` (native or via) stays the "is it delivered at all" check.
- **Read catalog and import files only through `src/safe-read.ts`** (regular files, never a followed link, size cap,
  checked on the handle it reads from), and **parse frontmatter only through `src/frontmatter-parse.ts`** —
  gray-matter caches and shares parsed objects, so ESLint forbids importing it anywhere else in `src/`.
- **`requireValidCatalog` reuses the last validated catalog while no file under the catalog changed**
  (`src/catalog-cache.ts`: an `lstat` fingerprint of path, mode, size, mtime and file id; every caller gets its own
  `structuredClone`; an invalid catalog is never kept). A new consumer path that needs a valid catalog goes through it;
  authoring commands that edit and re-read files keep calling `loadCatalog` directly.
- **`authoring/update/patch-types.ts` and `authoring/import/translate-shared.ts` are one-directional leaf modules —
  nothing in either may import from `patch-build.ts`/`translate.ts` or their satellite files**. The hubs
  (`patch-build.ts` plus `patch-fields-*.ts`; `translate.ts` plus `translate-kinds.ts` / `translate-helpers.ts`) still
  re-export the shared symbols. A new field-group handler or per-kind translator that needs a shared type belongs in
  the leaf, never re-declared on the hub. (see F28, `docs/decisions/catalog-benchmark-audit-2026-08-22.md`)
- `packs.yaml` is
  read only through `parsePacksConfig` (`src/packs-config.ts`): pack names become folder names and must be
  kebab-case.
