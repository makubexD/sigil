# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.
It carries only what a session cannot derive from reading the code, plus a map to everything else —
see [Where everything else lives](#where-everything-else-lives) below for command reference, platform
mapping, and step-by-step guides.

## Build & test

```bash
npm run build          # clean (also deletes test-compiled/), tsc, regenerate schema/*.schema.json and docs/reference/capabilities.md
npm run validate       # schema + reference-graph check
npm run catalog:build  # catalog source → dist/claude/ and dist/copilot/
npm test               # pretest builds dist-cli/ and test-compiled/, then node --test
npm run test:built     # same, but trusts a current dist-cli/ (CI and ci:local build just before)
npm run check          # lint && format:check && check-doc-comments && test (a subset of CI)
npm run ci:local       # full CI mirror: audit, lint, format, build, validate, sync --check, test, catalog:build
```

Heap size, why `pretest` exists, and `npm link` vs `npm run sigil` are in
[Build and link](docs/guides/operations.md#build-and-link). Run `npm run ci:local` before pushing. The human testing
guide is [CONTRIBUTING.md](CONTRIBUTING.md) § B. Contributing code (Testing, Before you push).

## Invariants — do not break

- **Path anchoring is deliberately dual**: catalog source (`catalog/`, `packs.yaml`, `schema/`) resolves from
  `PKG_ROOT = path.resolve(__dirname, '..')` in `src/cli-helpers.ts`. The `--project-dir` default (`process.cwd()`)
  is set in `src/cli.ts` option definitions and must never anchor on `PKG_ROOT`.
- **`src/cli.ts` loads command modules lazily** — wire a command with `.action(lazy(async () => (await import('./commands/x')).runX))`,
  never a top-level `import { runX }`. An eager import puts that command's whole import tree on every start, including
  `--version` and `--help` (about 95 ms for all of them; the test suite starts the CLI 100+ times).
  `test/cli-startup.test.ts` fails when a command module loads during `--version` or `--help`.
- **The 4-stage pipeline stays platform-neutral**: `src/load.ts`, `src/validate/` (`validateCatalog`), and
  `src/resolve.ts` know nothing about Claude or Copilot. Platform logic lives only in `src/targets/<name>/index.ts`.
- **`serialize()` vs `canonicalize()`** (`src/config-merge/primitives.ts`) are not interchangeable. `serialize()` is
  order-preserving and the only disk writer (`commands/add/execute-config.ts`, `commands/update-config-io.ts`,
  `commands/uninstall-config.ts`). `canonicalize()` is sorted and used only to hash fragments
  (`sha256(canonicalize(...))` in `src/manifest/mutate-config.ts`, `src/commands/update-config-catalog.ts`,
  `src/install-state-prescaffold.ts`). Never write a file with `canonicalize()`.
- **Route every authored scalar through `serializeScalar`** (`src/authoring/frontmatter.ts`, called from
  `serializeYamlEntry`). It quotes strings containing `\n`, `:`, or `"`, and strings starting with `#`, `*`, `[`, or
  `{`. A `"` anywhere in the string is quoted, not only a leading one. It also quotes any string whose plain form
  would not parse back as the same string (dates, numbers, `true`, `null`, …), so a rewrite never changes a type.
- **Never emit a bare plain scalar for `description:`** — a colon inside it breaks YAML. Always go through
  `yamlScalar()` (`src/targets/yaml-util.ts`), which double-quotes unconditionally.
- **`plugin.json` gets `pkg.version` written explicitly** by `buildPluginJson`
  (`src/targets/claude-code/plugin-assemble.ts`), from the version `src/commands/build.ts` passes in. Without that
  field, npm-sourced Claude plugins receive version `"unknown"` and `/plugin update` breaks.
- **Never remove `model` / `effort` / `maxTurns` / `isolation` / `skills`** from the `claude:` frontmatter namespace
  on agent `.agent.md` files. Those are Claude Code subagent fields; other adapters skip the namespace. `skills` holds
  catalog skill ids: `validate` checks them (`src/refs.ts`), the adapter emits their names, and `add` warns when one
  is not installed (`src/commands/add/co-install.ts`). Dependencies come only from `uses:`.
- **`appliesTo` stays unchanged in `catalog/` source and the zod schema** — adapters translate it (`paths:` for
  Claude, `applyTo:` for Copilot `.instructions.md` only). Never gate that translation on `language`. All three
  emitters must agree: `targets/claude-code/scaffold.ts`, `targets/claude-code/plugin-build.ts`, and
  `targets/copilot/build-helpers.ts` (`buildInstructionsFile`).
- **`KIND_ORDER` (`src/select/selection.ts`) is derived from `KIND_REGISTRY`'s `selectorOrder`** in `src/kinds.ts`
  (selection.ts re-exports it), the same way `ALL_KINDS` derives from `displayOrder`. Never hand-list kinds in a
  second array — a kind added to `KIND_REGISTRY` without `selectorOrder` fails to compile. The same goes for where a
  kind's source lives: `sourceDir` / `sourceSuffix` on `KIND_REGISTRY`, read through `sourceGlob`, `sourceRelPath`
  and `kindOfSourceFile` (loading, kind inference, `new`, `move`). Never build a source path as `${kind}s`.
- **`src/schema/index.ts` (zod) is the single schema source of truth.** `src/schema/emit.ts` generates
  `schema/*.schema.json` from it via `npm run build`. Changing a zod schema without rebuilding leaves the JSON Schemas
  stale — commit both.
- **Config-kind writes (`mcp`/`hook`/`settings`) merge into user-owned JSON**, never overwrite it. A home-directory
  write takes exactly one pristine `.sigil.bak` before the first write (`docs/reference/config-kinds.md`).
  `ensureHomeBackup` / `isHomeScopedRoot` (`src/config-utils.ts`) must be called from every writer that can touch a
  home-scoped file — `add` (`commands/add/execute-config.ts`), `update` (`commands/update-config-io.ts`), and
  `uninstall` (`commands/uninstall-config.ts`). A fourth writer must call them too. (see F23,
  `docs/decisions/catalog-benchmark-audit-2026-08-22.md`)
- **Every `id`/`name` frontmatter value that an adapter interpolates into an output file path is schema-constrained to
  a safe kebab-case shape** (`KEBAB_ID_RE` / `KEBAB_NAME_RE` in `src/schema/shared.ts`), enforced by `checkSchema`
  (`src/validate/schema-checks.ts`) inside `validateCatalog` — the `sigil validate` / `sigil build` gate.
  `checkNameConsistency` (`src/authoring/check-source-conventions.ts`) is authoring-only (`move` / `import` / `new` /
  `patch` / `edit` / `retarget` / `check`) and is not that gate. `writeFilesSync` and `partitionFiles`
  (`src/cli-helpers.ts`) also call `resolveContained()`. Never remove either layer. (see F22,
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
- **Conflict handling** (`partitionFiles` in `src/cli-helpers.ts`): candidate paths split into `toWrite` (new, always
  written) and `conflicting` (exists, never touched without `--overwrite`).
- **Kind support is declared only in `src/targets/<provider>/capabilities.ts`** — one `TargetCapabilities` row per
  kind per channel (`scaffold` / `plugin`: `native` / `via` / `none`). Read support only through `supportedKinds`,
  `nativeKinds`, and `supportsKind` (`src/targets/capabilities.ts`). `docs/reference/capabilities.md` is generated by
  `npm run build`; `test/targets/capabilities.test.ts` fails when it is stale. `WRITABLE_PLUGIN_KINDS`
  (`src/targets/claude-code/plugin-assemble.ts`) is implementation coverage, and that same test cross-checks it
  against the table.
- **`resolveSelection()`** (`src/select/selector-resolve.ts`) checks each artifact's kind against the target's
  scaffold capabilities. Unsupported kinds go to `skipped[]` — warn-and-skip, not an error.
- **Every whole-file kind (`skill`/`agent`/`rule`/`prompt`/`workflow`) a target emits `native` on a channel must have
  a matching `KindEmitSpec` for it.** `provider-kind-coverage`
  (`src/commands/sync/conformance/rules/provider-kind-coverage.ts`) fails `sigil sync --check` on the gap. Config
  kinds (`hook` / `settings` / `mcp`) are citation-covered via `AGGREGATE_DOC_REFS` (`src/targets/all-emit-specs.ts`).
  (see `docs/decisions/catalog-conformance-audit-2026-08.md`)
- **Every catalog frontmatter field authored on a whole-file kind must be mapped by at least one provider's
  `KindEmitSpec`**. Both providers default an absent `tools` to all tools, so an unmapped read-only agent `tools`
  field silently grants full write access (see `src/targets/claude-code/spec/agent.ts` and
  `src/targets/copilot/spec/agent.ts`). `declared-but-unemitted`
  (`src/commands/sync/conformance/rules/declared-but-unemitted.ts`) fails `--check`. It is derived from each spec's
  `FieldMapping[]`. Extend `SIGIL_INTERNAL_FIELDS` in that file only for fields that never reach a provider (`tags`,
  `severity`, `uses`, …), never to silence a real gap. (see
  `docs/decisions/frontmatter-audit-and-catalog-sweep-2026-08.md`) An agent's `tools` / `disallowedTools` must also
  reach every target it ships to: `renderArtifact` refuses to render one a spec can't carry
  (`src/targets/tool-restriction.ts`), `tool-restriction-coverage` reports it at `--check`, and the schema rejects
  an empty list (it would emit no line, which means all tools).
- **Agents have no `whenToUse` frontmatter channel — only `description`**. Skills and prompts dispatch on
  `description` plus `whenToUse`; agents dispatch on `description` alone. `whenToUse:` on an agent is unread at build
  time. Put dispatch-disambiguation in `description`. `declared-but-unemitted` fails `sync --check` if the field is
  authored and unmapped. (see `docs/decisions/catalog-quality-audit-2026-08.md`)
- **A same-kind, same-topic "family" of artifacts across language namespaces is not automatically a templatization
  candidate**. Templatize only after measuring real body overlap, with at least three concrete duplicates. Three
  templates ship in `catalog/shared/templates/`: `mcp-note` (the four `shared/*.mcp.md` files, from
  `docs/decisions/template-extraction-evidence-2026-08.md`, which left `hook`/`settings` hand-authored for lack of three
  examples) plus `code-quality` and `release-skill` (added after the 2026-08-20 audit measured their overlap).
  `catalog-symmetry`
  (`src/commands/sync/conformance/rules/catalog-symmetry.ts`) catches a family missing from one language namespace
  without assuming the bodies are duplicates. (see `docs/decisions/catalog-quality-audit-2026-08.md`)
- **Where an artifact goes is one rule**: no language variation → `shared/`; varies with the project's language →
  `languages/<lang>/` (the only option for a language-varying agent or rule — neither loads references on demand);
  varies with a stack the task chooses → one shared skill with flat `references/stack-<stack>.md`. Tie →
  per-language. Group with `packs.yaml`, never topic folders; references stay one level deep. `catalog-layout`
  (`src/commands/sync/conformance/rules/catalog-layout.ts`) fails `sync --check` on placement and skill-folder
  violations; it is author-only and adds nothing to `validateCatalog`. (see
  `docs/decisions/catalog-layout-standard-2026-10.md`)
- **Read catalog and import files only through `src/safe-read.ts`** (regular files, never a followed link, size cap,
  checked on the handle it reads from), and **parse frontmatter only through `src/frontmatter-parse.ts`** —
  gray-matter caches and shares parsed objects, so ESLint forbids importing it anywhere else in `src/`.
- **MCP config never carries a provider's env syntax.** Catalog `server` values write `{sigil:env:NAME}`; each target
  expands it for the file it writes (`src/targets/env-reference.ts`, an `EnvSyntax` per file format).
- **Artifact bodies are provider-neutral prose — never a hardcoded provider-specific literal** (`CLAUDE.md`,
  `$ARGUMENTS`, `.claude/rules/`, …). Bodies use `{sigil:<term>}` tokens (`LEXICON_TERMS` in `src/targets/lexicon.ts`)
  and one `ProviderLexicon` per provider (`src/targets/<provider>/lexicon.ts`), applied by `renderArtifact()`
  (`src/targets/emit.ts`). Every `KindEmitSpec` must set `lexicon:` and include `UNTRANSLATED_TOKEN_FORBID`
  (`src/targets/lexicon-forbid.ts`) in `bodyForbids`. A hand-rolled aggregate that does not call `renderArtifact()`
  (Copilot `AGENTS.md` / `copilot-instructions.md` in `targets/copilot/build-helpers.ts`) must call `applyLexicon()` itself.
  `provider-term-leak` derives its literals from the registered lexicons, not a hand-listed set. (see
  `docs/decisions/provider-neutral-body-lexicon-2026-08.md`)
- **`authoring/update/patch-types.ts` and `authoring/import/translate-shared.ts` are one-directional leaf modules —
  nothing in either may import from `patch-build.ts`/`translate.ts` or their satellite files**. The hubs
  (`patch-build.ts` plus `patch-fields-*.ts`; `translate.ts` plus `translate-kinds.ts` / `translate-helpers.ts`) still
  re-export the shared symbols. A new field-group handler or per-kind translator that needs a shared type belongs in
  the leaf, never re-declared on the hub. (see F28, `docs/decisions/catalog-benchmark-audit-2026-08-22.md`)
- **`src/index.ts` is sigil's entire public library surface, curated deliberately — never add a symbol to it without
  meaning to publish it**. The deliberately promoted surface is the pure `config-merge` primitives. `package.json`
  `exports` exposes only `"."` and `"./package.json"`. Any other `require('sigil/dist-cli/…')` throws
  `ERR_PACKAGE_PATH_NOT_EXPORTED`. `test/public-api.test.ts` guards both directions. (see F25,
  `docs/decisions/catalog-benchmark-audit-2026-08-22.md`)

## Architecture

### 4-stage pipeline

```
catalog/      →  [1] load.ts      →  LoadedCatalog
              →  [2] validate/    →  ValidationResult (exits on errors)
              →  [3] resolve.ts   →  ResolvedCatalog  (extends/uses expanded)
              →  [4] targets/<x>  →  FileMap (relative path → content)
                                         ↓ written to dist/<target>/
```

The registry lives in `src/targets/index.ts` — adding a platform is one new file plus one `registerTarget()` call (see
`docs/reference/architecture.md` § Extension model for the steps).

### DRY resolution (resolve.ts)

- **`extends` (rules only):** walks the `extends` graph and prepends each ancestor's body oldest-first.
  `csharp/cs-conventions extends shared/clean-code` → emitted body is `clean-code body \n\n dotnet-style body`. Never
  duplicate rule text in source.
- **`uses` (skills only):** maps `uses.rules` IDs to fully-resolved rule bodies (`resolvedRules[]`) and records
  `uses.agents` as `resolvedAgentIds[]`. Adapters consume these.

### Two Claude delivery modes

Claude Code plugins cannot ship loose rules, so `build` (`dist/claude/`) inlines rules into each SKILL.md while `add` /
`init` write `.claude/rules/<slug>.md`; the per-adapter table is in
[docs/reference/spec.md](docs/reference/spec.md#uses-skills-only) (Reuse mechanisms).

### Templates + emit specs (the source-of-truth layer)

Body structure is never hand-copied across sibling artifacts. A `kind: template` artifact
(`catalog/shared/templates/*.template.md`) holds shared prose with `<!-- slot: key -->` markers; an artifact opts in
with `template: <id>` and supplies only slot content. `src/templates.ts` composes it in `resolve.ts`, before
`extends`, producing `ResolvedArtifact.resolvedBody` plus unflattened `resolvedSlots` /
`resolvedAncestorBodies`. Never paste template prose back into an artifact body — `validate` flags it.

Every (provider, kind) rendering is a data-only `KindEmitSpec` (`src/targets/<provider>/spec/<kind>.ts`) run through
the one `renderArtifact()` (`src/targets/emit.ts`). **`contracts.ts` under each `targets/<provider>/` is derived from
that provider's `KindEmitSpec[]` via `deriveContracts()`, never hand-written.** A `docs:` citation must name the
provider's canonical home for the artifact, and cite both consumers when two products read the same emitted file.
`KindEmitSpec.supersededBy` is an advisory `sigil sync` notice, never a `--check` failure. Shipped targets do not use
`Target.frontmatterExtensions`, which is known debt (the list is in
[architecture.md](docs/reference/architecture.md#extension-model)). `hook`/`settings` stay flagged
`KindDescriptor.ownedBy` until a second target supports them. Mechanics:
[architecture.md](docs/reference/architecture.md).

**`sigil sync`** (`src/commands/sync/`) is catalog-author tooling: `--check` for CI, `--apply` for mechanical fixes
(new, renamed, or reordered slots, and hoisted-prose deletion). Drift detection is live in `analyze.ts` (filled slots
against the template's current `slots:` and prose). There is no stored hash or per-artifact revision bookkeeping.

**Artifact retirement is `deprecated:` on `BaseFields`** (`src/schema/shared.ts`): `{ since, reason, supersededBy? }`,
never a hard delete. A deprecated artifact stays resolvable so existing `uses:` / `extends:` references and installs
keep working. `validate` warns, and never errors, when a live artifact depends on one. **`sigil prune`**
(`src/commands/prune.ts`) previews by default; `--apply` removes orphaned manifest entries (ids gone from the catalog)
and reports deprecated-but-installed ones with `supersededBy`. Removal reuses `removeEntries`
(`src/manifest/mutate-remove.ts` — the same function `uninstall.ts` calls), plus `reverseMergeConfigEntries` and the
same drifted-file protection.

**`sigil status` template labeling is read-only.** `ManifestEntry.template` (`{ id, revision }`) is stamped at install
from `currentTemplateOf` (`src/manifest/template-of.ts`). `status` compares that revision to the bundled catalog and
surfaces `template <id> rev <old>→<new>` (`src/manifest/status.ts`); it never writes. `makeScaffoldHashStub`
(`src/commands/status.ts`) always returns null, so `outdated` on this command is only a template-revision mismatch.
Propagation is `sigil update`. `sigil sync` is the catalog-author command, not the consumer one.

`errors.ts` / `cli-error.ts` are the single error type and the one `process.exit`. `kinds.ts` holds `KIND_REGISTRY`.
`wizard/` has its own guide, `src/wizard/CLAUDE.md`.

## Where everything else lives

| Topic                                                                           | Doc                                                     |
| ------------------------------------------------------------------------------- | ------------------------------------------------------- |
| CLI command reference, platform/frontmatter mapping, trust scanner              | `docs/reference/spec.md`                                |
| Per-command CLI flags (generated from `sigil <cmd> --help`)                     | `docs/reference/cli-flags.md`                           |
| Extension model, emit specs, templates, lexicon, conformance engine             | `docs/reference/architecture.md`                        |
| Which kinds each target delivers per channel (generated from `capabilities.ts`) | `docs/reference/capabilities.md`                        |
| `mcp` / `hook` / `settings` config-kind merge model + scope tables              | `docs/reference/config-kinds.md`                        |
| Adding a skill, rule, or language; `sigil get/search/patch/move/import`         | `docs/guides/authoring.md`                              |
| Wizard step registry, home menu, guided verbs, install-state legend             | `src/wizard/CLAUDE.md` (auto-loads under `src/wizard/`) |
| Installing artifacts into a consumer project; manifest/status/update/uninstall  | `docs/guides/consuming.md`                              |
| Build targets, CI gate, `sigil release`                                         | `docs/guides/operations.md`                             |
| Common errors, FAQ                                                              | `docs/reference/troubleshooting.md`                     |
| Full doc map + command cheat-sheet                                              | `docs/index.md`                                         |
