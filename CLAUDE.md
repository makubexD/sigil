# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.
It carries only what a session cannot derive from reading the code, plus a map to everything else —
see [Where everything else lives](#where-everything-else-lives) below for command reference, platform
mapping, and step-by-step guides.

## Build & test

```bash
npm run build      # TypeScript compile + regenerate schema/*.schema.json
npm run validate   # Schema + reference-graph integrity check
npm run catalog:build  # Compile catalog source → dist/claude/ and dist/copilot/
npm test           # Run all tests (must build first — tests run against dist-cli/, not src/)
npm run check      # tsc --noEmit && lint && format:check && test — the single quality gate
```

**Heap-size:** `tsc` OOMs at the default 4 GB V8 heap (Zod's recursive generics force deep
type-inference). `npm run build` sets `NODE_OPTIONS=--max-old-space-size=8192` automatically via
`cross-env`. If you invoke `tsc` directly (e.g. `build:watch`), prefix it yourself.

**Tests:** `test/` is excluded from `tsconfig.build.json` and imports from `../dist-cli/…`, so a
source or test edit needs a full `npm run build` before `npm test` picks it up.

**CLI dev invocation:** `npm link` once to get a global `sigil` symlink onto `dist-cli/cli.js`
(survives rebuilds — it's linked by path, not content); `npm unlink -g sigil` to remove it. Without
linking, use `npm run sigil -- <args>`.

## Invariants — do not break

- **Path anchoring is deliberately dual** (`src/cli.ts`): catalog source (`catalog/`, `packs.yaml`,
  `schema/`) resolves from `PKG_ROOT = path.resolve(__dirname, '..')`, so `sigil` works from any
  directory. `--project-dir` anchors on `process.cwd()` — the user's project root — and must never
  be changed to anchor on `PKG_ROOT`.
- **The 4-stage pipeline stays platform-neutral**: `load.ts` / `validate.ts` / `resolve.ts` know
  nothing about Claude or Copilot. All platform-specific logic lives in `src/targets/<name>/index.ts`.
- **`serialize()` vs `canonicalize()`** (`src/config-merge/primitives.ts`) are not interchangeable.
  `serialize()` is order-preserving and is the only disk writer — it keeps a backup-vs-new diff to
  just the keys sigil added. `canonicalize()` is sorted and used only for fragment hashing
  (`manifest/hash.ts sha256(canonicalize(fragment))`). Never use `canonicalize()` to write a file.
- **Route every authored scalar through `serializeScalar`** (`src/authoring/frontmatter.ts`). It
  quotes strings containing `\n`/`:` and strings starting with `"`, `#`, `*`, `[`, or `{` — the `*`
  rule matters because unquoted `**/*.ts` is a YAML alias anchor, and `[` matters because
  `[optional]` is a YAML flow sequence.
- **Never emit a bare plain scalar for `description:`** — a colon inside it breaks YAML. Always go
  through `yamlScalar()` (`src/targets/yaml-util.ts`), which double-quotes unconditionally.
- **`plugin.json` gets `pkg.version` written explicitly** by the Claude adapter. npm-sourced Claude
  plugins otherwise receive version `"unknown"` from Claude's own tooling, which breaks
  `/plugin update`. Keep this in mind if you refactor the build step.
- **Never remove `effort` / `maxTurns` / `isolation`** from the `claude:` frontmatter namespace on
  agent `.agent.md` files — these are official Claude Code subagent frontmatter fields, Claude-only;
  other adapters skip the whole namespace.
- **`appliesTo` stays unchanged in `catalog/` source and the zod schema** — only adapters translate
  it (`paths:` for Claude, `applyTo:` for Copilot `.instructions.md` only). Never gate that
  translation on `language` being set — a language-less shared rule with `appliesTo` must still
  emit `paths:`/`applyTo:`. All three emitters must agree on the same artifact:
  `targets/claude-code/scaffold.ts`, `targets/claude-code/plugin-build.ts`, and
  `targets/copilot/build-helpers.ts` (`buildInstructionsFile`) — a fix applied to only two of the
  three (as happened once) leaves the third silently dropping authored scoping.
- **`KIND_ORDER` (`src/select/selection.ts`) is derived from `KIND_REGISTRY`'s `selectorOrder`**,
  the same way `ALL_KINDS` derives from `displayOrder`. Never hand-list kinds in a second array —
  a kind added to `KIND_REGISTRY` without a `selectorOrder` fails to compile, instead of silently
  sorting last.
- **`src/schema/index.ts` (zod) is the single schema source of truth.** `src/schema/emit.ts`
  generates `schema/*.schema.json` from it via `npm run build`. Changing a zod schema without
  rebuilding leaves the JSON Schemas stale — commit both.
- **Config-kind writes (`mcp`/`hook`/`settings`) merge into user-owned JSON**, never overwrite it.
  A home-directory write takes exactly one pristine `.sigil.bak` before the first write, never a
  second — see `docs/reference/config-kinds.md` for the full merge and scope model.
- **Conflict handling** (`cli.ts partitionFiles`): candidate paths split into `toWrite` (new,
  always written) and `conflicting` (exists, never touched without `--overwrite`).
- **`resolveSelection()`** (`src/select/selection.ts`) checks each artifact's kind against
  `target.supportedKinds`; unsupported kinds go to `skipped[]` — warn-and-skip, not an error.

## Architecture

### 4-stage pipeline

```
catalog/      →  [1] load.ts      →  LoadedCatalog
              →  [2] validate.ts  →  ValidationResult (exits on errors)
              →  [3] resolve.ts   →  ResolvedCatalog  (extends/uses expanded)
              →  [4] targets/<x>  →  FileMap (relative path → content)
                                         ↓ written to dist/<target>/
```

The registry lives in `src/targets/index.ts` — adding a platform is one new file plus one
`registerTarget()` call (see `docs/reference/spec.md` §Extension model for the steps).

### DRY resolution (resolve.ts)

- **`extends` (rules only):** walks the `extends` graph and prepends each ancestor's body
  oldest-first. `csharp/cs-conventions extends shared/clean-code` → emitted body is
  `clean-code body \n\n dotnet-style body`. Never duplicate rule text in source.
- **`uses` (skills only):** maps `uses.rules` IDs to fully-resolved rule bodies (`resolvedRules[]`)
  and records `uses.agents` as `resolvedAgentIds[]`. Adapters consume these.

### Two Claude delivery modes

Claude Code plugins cannot ship loose rules (`CLAUDE.md` at plugin root is not loaded by Claude), so
rules are materialised differently depending on delivery mode:

| Delivery                          | Rule handling                                          | Agent handling                            |
| --------------------------------- | ------------------------------------------------------ | ----------------------------------------- |
| **Plugin build** (`dist/claude/`) | Inlined as `## Applied Rules` section in each SKILL.md | Written to `agents/<name>.md` in the pack |
| **CLI scaffold** (`add` / `init`) | Written to `.claude/rules/<slug>.md` (loaded natively) | Written to `.claude/agents/<name>.md`     |

`build` produces the plugin layout; `add` produces the scaffold layout.

### Templates + emit specs (the source-of-truth layer)

Body structure is never hand-copied across sibling artifacts — a `kind: template` artifact
(`catalog/shared/templates/*.template.md`) holds a kind's shared prose once, with
`<!-- slot: key -->` markers; an artifact opts in with `template: <id>` and supplies only slot
content. `src/templates.ts` composes it in `resolve.ts`, before `extends`, producing
`ResolvedArtifact.resolvedBody` (default rendering) plus unflattened `resolvedSlots` /
`resolvedAncestorBodies` for adapters that need to rearrange rather than just concatenate. Never
paste template prose back into an artifact body — that is exactly the duplication templates exist to
remove, and `validate` flags it.

Every (provider, kind) rendering is a data-only `KindEmitSpec`
(`src/targets/<provider>/spec/<kind>.ts`, typed in `src/targets/spec-types.ts`) run through the one
`renderArtifact()` (`src/targets/emit.ts`) — there is no second, hand-written emission path per
platform. **`contracts.ts` under each `targets/<provider>/` is derived from that provider's
`KindEmitSpec[]` via `deriveContracts()`, never hand-written** — editing a spec is the only way to
change what its output must satisfy; editing `contracts.ts` directly is a sign the spec is missing a
field mapping. Every `KindEmitSpec` carries a required `docs: DocRef[]` citing the official provider
doc its shape follows (`src/targets/doc-refs.ts` holds the canonical constants); `sigil sync --stale`
gates staleness of both template and spec citations in CI (`src/targets/all-emit-specs.ts` is what
makes the spec half actually tracked, not just declared — see `docs/reference/spec.md`'s Templates
section for the mechanics). Provider-specific frontmatter (a field only one platform understands) is declared on
`Target.frontmatterExtensions` and authored under that provider's own namespace in catalog source
(`claude: { model: opus }`) — it must never be added as a bare top-level field to the neutral
`src/schema/index.ts` schemas, even for a single-provider kind (see `KindDescriptor.ownedBy` in
`src/kinds.ts` for kinds whose vocabulary is currently one provider's own, like `hook`/`settings`).
`frontmatterExtensions` is live in practice, not just documented: `COPILOT_PROMPT_SPEC` uses it for
`copilot: { tools }`, letting a catalog author override the emitted `.prompt.md` `tools:` list
without a bare top-level field.

**A `docs:` citation must name the provider's canonical home for the artifact** — the page that
provider's own navigation or file-reference table points to (anchored to a section when the
artifact is a subsection), never just a page that mentions the format — and cite **both** consumers
when two products read the same emitted file (every `.github/*` output is read by both GitHub's
cloud agent and VS Code's local agent, and their docs diverge in real ways — see
`COPILOT_RULE_SPEC`'s citation). `KindEmitSpec.supersededBy` flags a provider retiring a whole
output format (e.g. VS Code steering `.prompt.md` toward agent skills); `sigil sync` surfaces it as
an advisory notice, never a `--check` failure — see `src/targets/doc-refs.ts`'s header for the full
standard.

**`sigil sync`** (`src/commands/sync/`) is the propagation command for template drift: `--check` for
CI, `--apply` to write mechanical fixes (new/renamed/reordered slots, hoisted-prose deletion). It is
catalog-author tooling — drift detection is fully live (compares an artifact's filled slots against
its template's current `slots:`/prose, `src/commands/sync/analyze.ts`); there is no stored hash or
per-artifact revision bookkeeping to keep in sync with the detector itself.

**Artifact retirement is a `deprecated:` frontmatter field on `BaseFields`** (`src/schema/shared.ts`)
— `{ since, reason, supersededBy? }`, never a hard delete: a deprecated artifact stays fully
resolvable so existing `uses:`/`extends:` references and installs keep working. `validate` warns
(never errors) when a live artifact depends on one. **`sigil prune`** (`src/commands/prune.ts`) is
the consumer-side cleanup command — preview by default like `sync`, `--apply` to write — that
removes orphaned manifest entries (ids no longer in the bundled catalog) and reports
deprecated-but-installed ones with their `supersededBy` replacement, reusing `uninstall.ts`'s
refcount-aware `removeEntries` and drifted-file protection rather than a second removal path.

**Consumer-side `status`/`update` know about templates too, but only diagnostically.**
`ManifestEntry.template?: {id, revision}` (`src/manifest/types.ts`) is stamped at install/update
time from the resolved artifact's `templateId` + that template's current `revision:`
(`src/manifest/template-of.ts`). `sigil status` compares the recorded revision against the bundled
catalog's current one and surfaces `reason: "template <id> rev <old>→<new>"` — this is read-only
labeling, never a write path. The actual propagation is still `sigil update`; `sigil sync` is a
different command for a different persona (the catalog author, not the consumer).

### `src/` layout

`src/` is organized by concern: `commands/` (one file per CLI verb — see each file's own header
comment for its `run*` export), `wizard/` (interactive flows — see `src/wizard/CLAUDE.md`),
`targets/<platform>/` (all platform-specific logic, one directory per adapter), `authoring/`
(catalog CRUD: check-source, frontmatter, update, import, move), `manifest/` + `install-state.ts`
(consumer install lifecycle), `config-merge/` (JSON-merge primitives for mcp/hook/settings kinds),
`select/` (selector resolution, grouping, vocabulary), `query/` (get/search formatting),
`trust/scan/` (secret + injection scanning), `schema/` (Zod schemas + JSON Schema emission).
`errors.ts`/`cli-error.ts` hold the single error type and the one `process.exit`; `kinds.ts` holds
the `KIND_REGISTRY` capability flags. Read a directory's files to see what is in it — the shape is
one file per responsibility throughout.

## Where everything else lives

| Topic                                                                               | Doc                                                     |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------- |
| CLI command reference, platform/frontmatter mapping, trust scanner, extension model | `docs/reference/spec.md`                                |
| `mcp` / `hook` / `settings` config-kind merge model + scope tables                  | `docs/reference/config-kinds.md`                        |
| Adding a skill, rule, or language; `sigil get/search/patch/move/import`             | `docs/guides/authoring.md`                              |
| Wizard step registry, history invariant, install-state legend                       | `src/wizard/CLAUDE.md` (auto-loads under `src/wizard/`) |
| Installing artifacts into a consumer project; manifest/status/update/uninstall      | `docs/guides/consuming.md`                              |
| Build targets, CI gate, `sigil release`                                             | `docs/guides/operations.md`                             |
| Common errors, FAQ                                                                  | `docs/reference/troubleshooting.md`                     |
| Full doc map + command cheat-sheet                                                  | `docs/index.md`                                         |
