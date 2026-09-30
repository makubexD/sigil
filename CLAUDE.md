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
- **Never remove `model` / `effort` / `maxTurns` / `isolation` / `skills`** from the `claude:`
  frontmatter namespace on agent `.agent.md` files — these are official Claude Code subagent
  frontmatter fields, Claude-only; other adapters skip the whole namespace. `skills` holds catalog
  skill ids: `validate` checks them (`src/refs.ts`), the adapter emits their names, and `add` warns
  when one isn't installed (`src/commands/add/co-install.ts`); dependencies come only from `uses:`.
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
  **`ensureHomeBackup`/`isHomeScopedRoot` (`src/config-utils.ts`) must be called from every writer
  that can touch a home-scoped config file** — `add`, `update`, and `uninstall` alike. It was
  originally implemented only inside `add`'s write path, so `update`'s re-merges and `uninstall`'s
  deletes/rewrites of the same home-scoped files (`~/.claude.json`, VS Code's user-profile
  `mcp.json`) silently shipped with zero backup for a full release cycle, until the 2026-08-22
  benchmark audit caught it (F23, `docs/decisions/catalog-benchmark-audit-2026-08-22.md`) — dogfooding
  the installed `ts-code-reviewer` agent against sigil's own source, not a manual read, is what
  surfaced it. If a fourth config-JSON writer is ever added, it must call this too.
- **Every `id`/`name` frontmatter value that an adapter interpolates into an output file path is
  schema-constrained to a safe kebab-case shape** (`KEBAB_ID_RE`/`KEBAB_NAME_RE`,
  `src/schema/shared.ts`), enforced by `checkSchema` inside `validateCatalog` — the actual
  `sigil validate`/`sigil build` gate every catalog source passes through. `id`/`name` previously
  enforced only `min(1)`; `checkNameConsistency`, the sole pre-existing kebab-case check, is wired
  only into authoring-only commands (`move`/`import`/`new`/`patch`/`edit`/`retarget`/`check`), never
  into the pipeline a compromised or malformed catalog artifact actually flows through — a gap the
  2026-08-22 benchmark audit's dogfooded `ts-security-auditor` run found and classified Critical
  (F22, same decision doc). `src/cli-helpers.ts`'s `writeFilesSync`/`partitionFiles` also gained a
  `resolveContained()` path-containment check as a second, independent net — never remove either
  layer on the assumption the other one alone is sufficient.
- **Config-kind drift is classified, not booleanized** (`src/config-merge/drift.ts`'s
  `classifyConfigDrift`, returning `intact`/`missing`/`modified`) — collapsing this to a boolean was
  the actual bug behind a hook fragment that `sigil status` correctly flagged as drifted but `sigil
update` then silently refused to repair, twice, across two audit rounds (F14,
  `docs/decisions/catalog-usage-audit-2026-08-21.md`). `missing` (sigil's fragment is wholly absent)
  auto-restores **without** `--force`, since re-merging into a fragment's own absence can never
  clobber anything; `modified` (a value sigil contributed was changed) still requires it, since
  overwriting would discard a real edit. `array-union`/`array-append` fragments (hooks, permission
  lists) classify as `missing` even when an item is merely absent-but-similar, never `modified` —
  both strategies are provably non-destructive to re-apply (union dedupes, append only
  concatenates), so there is no overwrite risk to gate behind a flag the way there is for
  `object-spread`'s leaf assignment. What gets restored is the catalog's op for the recorded
  file/root, never the manifest's own copy (the manifest is committed and editable; a recorded
  destination with no catalog op is skipped, `updateFromCatalog` in `update-config.ts`).
  `detectConfigDrift` stays as a boolean wrapper
  (`classifyConfigDrift(...) !== 'intact'`) for callers that only need yes/no.
- **A config fragment sigil already installed is replaced, never merged again**
  (`replaceMerge`, `src/config-merge/replace.ts`: reverse the recorded fragment, then apply the
  new one). `add` (re-install) and `update` (catalog changed) both go through it; a plain
  `applyMerge` of an `array-append` hook fragment stacks a second copy, which is how a fixed hook
  would have run beside the broken one it replaced (2026-09-27 install audit). Any new
  config-JSON writer must look up the recorded fragment (`previousOpFor`) and do the same.
- **`add` and `update` render with the same co-install set** — everything installed for the target
  plus the picks and their dependencies (`src/commands/add/co-install.ts`, `installedIdsFor` in
  `src/commands/update.ts`). A skill's or agent's Boundary ("See also") section lists only
  co-installed artifacts, so a writer that passes a smaller set strips it from files `add` wrote.
- **Conflict handling** (`cli.ts partitionFiles`): candidate paths split into `toWrite` (new,
  always written) and `conflicting` (exists, never touched without `--overwrite`).
- **Kind support is declared only in `src/targets/<provider>/capabilities.ts`** — one
  `TargetCapabilities` row per kind per channel (`scaffold`/`plugin`: `native` / `via` / `none`).
  Never hand-list supported kinds anywhere else; read them through `src/targets/capabilities.ts`
  (`supportedKinds`, `nativeKinds`, `supportsKind`). `docs/reference/capabilities.md` is generated
  from these tables by `npm run build` — commit it; a test fails when it's stale. A writer registry
  (e.g. `plugin-assemble.ts`'s `WRITABLE_PLUGIN_KINDS`) lists implementation coverage, not support,
  and is cross-checked against the table by test.
- **`resolveSelection()`** (`src/select/selector-resolve.ts`) checks each artifact's kind against the
  target's scaffold capabilities; unsupported kinds go to `skipped[]` — warn-and-skip, not an error.
- **Every whole-file kind (`skill`/`agent`/`rule`/`prompt`/`workflow`) a target emits `native` on
  a channel must have a matching `KindEmitSpec` for it.** `copilot/workflow` was declared supported
  with no spec for a full release cycle — no derived output contract, no doc citation — until the
  2026-08-07 catalog-conformance audit caught it (see `docs/decisions/catalog-conformance-audit-2026-08.md`).
  `sigil sync`'s `provider-kind-coverage` conformance rule (`src/commands/sync/conformance/rules/`)
  now fails `--check` on this gap; config kinds (`hook`/`settings`/`mcp`) are JSON merges, not
  markdown renders, and are citation-covered instead via `AGGREGATE_DOC_REFS`
  (`src/targets/all-emit-specs.ts`).
- **Every catalog frontmatter field authored on a whole-file kind must be mapped by at least one
  provider's `KindEmitSpec`.** `tools` (`AgentSchema`) was authored on ~26 agents — several
  explicitly read-only in their own `description` — but mapped by neither `CLAUDE_AGENT_SPEC` nor
  `COPILOT_AGENT_SPEC` for a full release cycle; both providers default an absent `tools` to _all_
  tools, so every emitted agent silently inherited full write access until the 2026-08-10 audit
  caught it (fixed in `claude-code/spec/agent.ts` / `copilot/spec/agent.ts`). The
  `declared-but-unemitted` conformance rule (`src/commands/sync/conformance/rules/`) now fails
  `--check` on this gap; it is derived from each spec's `FieldMapping[]`, not a hand-listed field
  set, so a future unmapped field is caught automatically. A small allowlist
  (`SIGIL_INTERNAL_FIELDS` in that rule file) excludes fields that are deliberately sigil-internal
  (`tags`, `severity`, `uses`, …) — extend that list only for fields that genuinely never reach a
  provider by design, never to silence a real gap.
- **Agents have no `whenToUse` frontmatter channel — only `description`.** Skills and prompts
  dispatch on `description` + `whenToUse` together; agents dispatch on `description` alone. Adding
  `whenToUse:` to an agent's frontmatter is a silent no-op at build time (the field is simply never
  read) unless caught first — which the 2026-08-20 catalog-quality audit's own fix attempt
  triggered, and `declared-but-unemitted` caught immediately at `sync --check` (see
  `docs/decisions/catalog-quality-audit-2026-08.md`). Put agent dispatch-disambiguation language in
  `description` itself.
- **A same-kind, same-topic "family" of artifacts across language namespaces is not automatically
  a templatization candidate.** The 2026-08-20 audit's approved plan assumed typescript/csharp/
  angular bodies were near-duplicates; measuring actual body-shingle overlap
  (`docs/audits/2026-08-20/tools/lane-d-duplication.js`) showed most families sit at 0.02–0.25
  overlap — independently-authored, language-idiomatic content, not copy-paste duplication. Only
  templatize a family after measuring real overlap (`docs/audits/2026-08-20/register.md`'s
  "Deliberately not templatized" section); the `code-quality` and `release-skill` templates
  (`catalog/shared/templates/`) are the two families that actually cleared that bar. `sigil sync`'s
  `catalog-symmetry` conformance rule (`src/commands/sync/conformance/rules/`) instead catches the
  more common real defect — a family present in most fully-built language namespaces but silently
  missing from one — without assuming duplication.
- **Artifact bodies are provider-neutral prose — never a hardcoded provider-specific literal**
  (`CLAUDE.md`, `$ARGUMENTS`, `.claude/rules/`, …). Unlike frontmatter, which every `FieldMapping`
  already routes through per-provider translation, the body had no equivalent mechanism at all
  until the 2026-08-10 audit: 29 files told **Copilot** to "Read CLAUDE.md", 18 hardcoded Claude's
  `$ARGUMENTS` token — both shipped unchanged to every provider and passed `sigil sync --check` for
  a full release cycle. Fixed with a **body lexicon**: `{sigil:<term>}` neutral tokens
  (`src/targets/lexicon.ts`'s `LEXICON_TERMS`), one `ProviderLexicon` table per provider
  (`src/targets/<provider>/lexicon.ts`), applied unconditionally by `renderArtifact()`
  (`src/targets/emit.ts`) — the same "one place, not opt-in" shape `{{name}}` → `$name`/`${input:}`
  translation already used for prompt/workflow. **Every `KindEmitSpec` must set `lexicon:`** and
  include `UNTRANSLATED_TOKEN_FORBID` (`src/targets/lexicon-forbid.ts`) in its `bodyForbids` — the
  second net that would have caught the original gap even before the lexicon existed. **Any
  hand-rolled aggregate that assembles body content without calling `renderArtifact()`** (Copilot's
  `AGENTS.md`/`copilot-instructions.md`, `copilot/build-helpers.ts`) does not get the lexicon pass
  for free — it must call `applyLexicon()` directly; this was a second, independent instance of the
  same bug found in the same audit. The `provider-term-leak` conformance rule derives its detection
  from every registered lexicon's literal values, not a hand-listed string set, so a new term is
  guarded automatically. See `docs/decisions/provider-neutral-body-lexicon-2026-08.md`.
- **`authoring/update/patch-types.ts` and `authoring/import/translate-shared.ts` are one-directional
  leaf modules — nothing in either may import from `patch-build.ts`/`translate.ts` or their
  satellite files.** `patch-build.ts` (hub) and its three `patch-fields-*.ts` satellites, and
  `translate.ts` (hub) with `translate-kinds.ts`/`translate-helpers.ts`, each used to import their
  shared types/helpers back from the hub — a genuine value-level A→B→A cycle, fragile under
  CommonJS load order, until the 2026-08-22 benchmark audit's dogfooded `ts-architecture-reviewer`
  run found both (F28, `docs/decisions/catalog-benchmark-audit-2026-08-22.md`). `patch-build.ts`/
  `translate.ts` still re-export the shared symbols so external callers
  (`authoring/update/index.ts`, `authoring/import/index.ts`) see no change — only the two clusters'
  internal imports moved. Adding a new field-group handler or per-kind translator that needs a
  shared type belongs in the leaf module, never re-declared on the hub.
- **`src/index.ts` is sigil's entire public library surface, curated deliberately — never add a
  symbol to it without meaning to publish it.** `package.json`'s `exports` map exposes only `"."`
  (→ `src/index.ts`) and `"./package.json"`; every other compiled module under `dist-cli/` —
  pipeline stages, target adapters, wizard, commands — is unreachable via package-name resolution
  (`require('sigil/dist-cli/<anything else>')` throws `ERR_PACKAGE_PATH_NOT_EXPORTED`). Before this
  existed, the _entire_ `dist-cli/` tree was accidentally deep-importable because no `exports` map
  was declared at all (2026-08-22 benchmark audit F25,
  `docs/decisions/catalog-benchmark-audit-2026-08-22.md`) — asked directly whether sigil should stay
  CLI-only or also be a supported library, the user chose the latter, so the fix promotes a
  specific, deliberate surface (the pure `config-merge` primitives) rather than just closing the
  hole. `test/public-api.test.ts` guards both directions — the curated surface stays reachable, and
  a deep import stays refused — so a future change can't silently widen or narrow it unnoticed.

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
| Which kinds each target delivers per channel (generated from `capabilities.ts`)     | `docs/reference/capabilities.md`                        |
| `mcp` / `hook` / `settings` config-kind merge model + scope tables                  | `docs/reference/config-kinds.md`                        |
| Adding a skill, rule, or language; `sigil get/search/patch/move/import`             | `docs/guides/authoring.md`                              |
| Wizard step registry, history invariant, install-state legend                       | `src/wizard/CLAUDE.md` (auto-loads under `src/wizard/`) |
| Installing artifacts into a consumer project; manifest/status/update/uninstall      | `docs/guides/consuming.md`                              |
| Build targets, CI gate, `sigil release`                                             | `docs/guides/operations.md`                             |
| Common errors, FAQ                                                                  | `docs/reference/troubleshooting.md`                     |
| Full doc map + command cheat-sheet                                                  | `docs/index.md`                                         |
