# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & dev commands

```bash
# TypeScript compile + regenerate schema/*.schema.json
npm run build

# Validate the catalog (schema + reference-graph integrity)
npm run validate

# Compile catalog source → dist/claude/ and dist/copilot/
npm run catalog:build

# Run all tests (must build first — tests run against dist-cli/, not src/)
npm test

# Run a single test by name
node --test --test-name-pattern "Resolve: extends flattening" test/pipeline.test.js

# Watch mode for iterative TS development
npm run build:watch
```

**CLI dev invocation (two options):**

_Primary — `npm link` (one-time setup):_

```bash
npm link        # registers a global `sigil` symlink pointing at dist-cli/
sigil new      # then use the bin name directly from any directory
```

The symlink survives rebuilds because it points to `dist-cli/cli.js` by path, not by content. Run `npm unlink -g sigil` to remove it.

_Fallback — npm script wrapper (no global install):_

```bash
npm run sigil -- new                          # bare wizard
npm run sigil -- new skill --name foo --yes   # flags-only, non-interactive
npm run sigil -- check catalog/shared/...     # the `--` forwards all args to the bin
```

**Heap-size note:** `tsc` OOMs at the default 4 GB V8 heap on this project because Zod's
recursive generics force deep type-inference. `npm run build` now sets this automatically via
`cross-env NODE_OPTIONS=--max-old-space-size=8192` — no manual env-var needed. If you invoke
`tsc` directly (e.g. `build:watch`), prefix it yourself.

**Test note:** `test/` is excluded from `tsconfig.build.json`. After editing a test file you must
compile it separately before running `npm test`:

```bash
npx tsc --outDir test test/pipeline.test.ts --module commonjs --target ES2022 --esModuleInterop --skipLibCheck
```

The test file imports from `../dist-cli/…`, so source edits need a full `npm run build` to take
effect in tests.

**Lint/format:**

```bash
npm run lint           # ESLint — report violations
npm run lint:fix       # ESLint — auto-fix
npm run format         # Prettier — reformat all non-ignored files
npm run format:check   # Prettier — check (used in CI)
```

**Releasing a new version:**

```bash
sigil release patch         # 0.1.0 → 0.1.1  (also: minor, major, or explicit x.y.z)
sigil release patch --dry-run  # preview without writing
```

The command runs a clean-tree preflight, bumps `package.json` + `package-lock.json`, rebuilds so
`dist/**/plugin.json` carries the new version, promotes `CHANGELOG.md`, then commits + tags.
After success:

```bash
git push && git push --tags  # triggers release.yml → npm publish via OIDC
```

See `docs/guides/operations.md` and `.github/workflows/release.yml` for the full publish setup (OIDC Trusted
Publishing — no stored `NPM_TOKEN` needed).

## `add` command — selector + filter model

The `add` command is variadic and conflict-aware.

**Selector forms (can be combined):**

```bash
add all                            # full catalog
add pack:dotnet-pack               # all artifacts in a pack
add kind:agent                     # all artifacts of a kind
add skill:csharp/cs-generate-tests     # explicit artifact (kind-prefixed)
add csharp/cs-generate-tests           # bare ID
```

**Key flags:**

- `--kind skill,agent` / `--exclude prompt` — post-expansion kind filters
- `--language csharp` — restrict to one language (shared artifacts always included)
- `--no-deps` — skip the `uses` closure (skill only, no rule/agent deps)
- `--dry-run` — preview with `new`/`exists` tags; write nothing
- `--overwrite` — replace existing files (default: warn + list conflicts, exit 0)
- `--yes` — non-interactive mode (required when stdin is not a TTY, e.g. CI)
- `-i / --interactive` — force the guided wizard even when selectors are provided

**TTY/CI guard:** when `add` is run with no selector and stdin/stdout is not a TTY, it exits
non-zero with a usage hint instead of hanging. Always safe to run in CI with `--yes`.

**Wizard (`src/wizard/add.ts`):** triggered when run with no selector in an interactive TTY. Uses
`@clack/prompts` for a step-machine guided flow; every prompt maps 1:1 to a CLI flag so guided and
scripted paths are equivalent. After install, `printEquivalentCommand()` prints the copy-pasteable
`sigil add … --yes` line (boxed in a TTY, plain text in CI). The plan box shows summary + artifact
preview only — never the command — so it is never printed twice.

**Equivalent-command invariant:** the "Repeat non-interactively" command printed after install must be
the _complete, faithful equivalent_ of the wizard session — every consequential choice reflected,
nothing silently dropped. `buildEquivalentCommand` (`src/wizard/command-strings.ts`) builds the string; its `cli.ts`
call site must pass `hasConfigKinds: configIds.length > 0` alongside `configScope: effectiveScope` so
that when config kinds (mcp/hook/settings) are involved, `--scope` is **always** emitted — even for
the `project` default — pinning the destination file + JSON section. Non-config defaults (overwrite,
deps, language) may still be omitted. Any new wizard step must extend `buildEquivalentCommand` +
the call site + a `test/pipeline.test.ts` case in the same change.

**Top menu (scope step):** the top-level "What would you like to install?" menu has three entries:

| Entry               | Value    | Next                                        | When             |
| ------------------- | -------- | ------------------------------------------- | ---------------- |
| Everything          | `all`    | optional language filter → deps             | always           |
| Recommended         | `pack`   | which bundle? → deps                        | when packs exist |
| Pick specific items | `browse` | kind sub-menu (led by "All types") → picker | always           |

**Three-level information architecture** — type is the spine; language is never a top-level choice:

```
Level 1 — WHAT (type/intent only):
  Everything · Recommended · Pick specific items

Level 2 — TYPE sub-menu (only under "Pick specific items"):
  All types (mix anything) · Skills · Agents · Commands · Rules
  MCP servers · Hooks · Settings

Level 3 — LANGUAGE (injected only where relevant):
  · Language-bound kinds (skills / style rules / architects) → "Narrow to a language? (optional)"
  · Config kinds (MCP / Hooks / Settings) → straight to picker, NEVER asked about language
  · "Everything" → same optional skippable filter with note that MCPs/hooks/settings always included
```

**History invariant:** pass-through / auto-forward steps must **never** push a history frame — only
steps that actually rendered a prompt do. Violating this causes `history.pop()` to return the
wrong step and produces "← Back" loops. The `all` branch of `narrow` is a pass-through (no prompt)
and must NOT push `'narrow'` (the bug that was fixed: `src/wizard/add.ts` `narrow` step, `all` branch).

**`Browse & pick` → kind sub-menu:** shows "All types (mix anything)" first, then each present kind
with its artifact count (Skills, Agents, Rules, Commands, Workflows, Hooks, Settings, MCPs).

- **"All types" (`crossKindPicker` step):** cross-kind grouped picker. `Config — agnostic` group
  always appears first (mcp/hook/settings, language-agnostic). Code artifacts follow in language
  groups. Language is an optional, skippable refinement shown only when ≥2 languages are present.
  Config kinds are never touched by the language filter. Goes through deps → overwrite → scope.
- **Specific kind (`kindPicker` step):**
  - **Config kinds (mcp/hook/settings):** flat `multiselect`; **skips language and deps steps**;
    proceeds directly to overwrite → scope (where the blast-radius warning fires if needed).
  - **Code kinds (skill/agent/rule/prompt/workflow):** optional "Narrow by language?" (`initialValue:''`
    — Enter = all), then a flat or language-grouped picker. Proceeds to deps → overwrite → proceed.

**Install-state legend + colored markers.** A `note('Legend')` box appears above each picker
whenever at least one artifact has a non-`new` state (omitted on first-run destinations). State
markers are colored via `picocolors`: `＋ new` (green), `✓ installed` (dim), `↑ update` (cyan),
`✎ edited` (yellow), `⚠ not sigil's` (yellow). Nothing is pre-checked — glyphs are informational
only; the user checks every item they want to install.

**Install-plan box labels.** The plan box (before "Proceed?") uses `Install:` (not `Scope:`) for
the selection, and always shows `Config scope: <value>` + `Destination: <fullPath  › section>` when
config kinds are in the selection — even when scope equals the `project` default.

**`ScopeChoice`** (`src/wizard/types.ts`): `'all' | 'pack' | 'browse'`. State
`kindPick?: ArtifactKind` is set when `browse` is chosen and a specific kind is selected.

**Curated packs (`packs.yaml`):** packs are mix-anything bundles expressed with explicit bare-id
`artifacts:` lists (e.g. `csharp/cs-generate-tests`, no `kind:` prefix). When a pack contains skills
their rule/agent dependency closure is resolved by the wizard's `deps` step — you do not need to
list deps manually. The shipped set is:

- `essentials` — 5 agnostic tools (Filesystem MCP, hook, settings, 2 prompts). No language.
- `dotnet-starter` / `python-starter` / `react-starter` — language skill + 3 config essentials.
  The skill's deps (style rule + code-reviewer) are added automatically via the `deps` step.
  Config kinds in packs are silently skipped during `catalog:build` (plugins contain only
  skills/agents/workflows); they are installed only via `sigil add` / `sigil update`.

**Dependency closure UX (plan box):** the `uses:` dependency is purely authored YAML frontmatter
in each SKILL.md (e.g. `uses: { rules: [csharp/cs-conventions], agents: [shared/code-reviewer] }`) —
not a hard technical requirement. The wizard surfaces this concretely:

- `computeClosure(primaryIds, catalog)` (`src/select/closure.ts`) walks `resolvedRules` and
  `resolvedAgentIds` on each skill to compute the exact rules/agents that would be added.
- **Deps note** names each dependency with its kind, ID, and title, plus the `via` skill that
  declares it. The lead sentence frames it as "the skill author recommends" (not a hard requirement).
- **Install-plan box** (before "Proceed?") shows the full resolved artifact set: each primary pick
  tagged `(your pick)` and each dependency tagged `(dependency of <skill>)`. When deps are excluded
  (answered No), the box shows only primary picks + a `(N deps excluded)` line.
- The **post-install file listing** in `cli.ts` still tags each written file `(dependency)` for
  completeness, consistent with the pre-confirm preview.

**`WizardResult.language`** is only set via the `all` scope path (the global language filter step).
Browse/pick-specific paths use explicit `${kind}:${id}` selectors, so `language` stays undefined.
`WizardResult.language` flows into `effectiveLanguage` in `cli.ts`, which feeds `filters.language`
to `resolveSelection()`.

> **Search deferred:** add a `Search by keyword` top-level entry (wired to the existing
> `sigil search` ranking → multiselect of matches) when a kind exceeds ~30 items.

**Conflict handling (cli.ts `partitionFiles`):** before writing, all candidate paths are
partitioned into `toWrite` (new) and `conflicting` (exists). New files are always written;
conflicting files are never touched without `--overwrite`.

**Selector resolver (`src/select/selection.ts`):** `resolveSelection()` expands selectors, applies filters,
and checks each artifact's kind against `target.supportedKinds`. Unsupported kinds go to
`skipped[]` (warn-and-skip, not an error). Shared by both the wizard and the flags path.

**Shell completion:** `sigil completion [bash|zsh|fish]` prints a completion script.
`sigil __complete <word> --prev <prev>` (hidden) outputs candidate completions for the
current position — used by the generated scripts.

**Path anchoring (`src/cli.ts`):** Two path roles must stay separate:

- **Catalog source** (`catalog/`, `packs.yaml`, `schema/`) — read from the installed package.
  `PKG_ROOT = path.resolve(__dirname, '..')` (in `dist-cli/`, so `..` = package root).
  `resolveDefault(relative)` anchors all `--catalog-dir`/`--packs`/`--out-dir` defaults here.
  `loadAndValidate` uses its `packsFile` parameter (was accidentally ignoring it).
- **Consumer destination** (`--project-dir`) — anchored on `process.cwd()` by design.
  Never change this: it is the user's project root where `.claude/`/`.github/` get written.

This separation makes `sigil add` work from any directory, not just inside the repo.

## Consumer install lifecycle

The `add` command writes an install manifest to `.sigil/manifest.json` (via `src/manifest/`).
This enables the full consumer lifecycle:

```bash
sigil status                    # show install health per artifact
sigil update [ids...]           # re-scaffold from bundled catalog; skip user-drifted files
sigil uninstall <ids...>        # remove files + update manifest (refcount-aware)
```

**Install manifest** (`.sigil/manifest.json`):

- One file covers all targets (`claude` + `copilot` coexist).
- Per-entry: `{ id, kind, target, sigilVersion, files: [{ path, sha256 }], dependentOf, installedAt }`.
- `dependentOf[]` tracks refcounts — a shared rule/agent pulled in by two skills records both parents; it is deleted only when the last dependent is uninstalled.
- `manifestVersion` field enables future schema migrations.

**Status values:** `up-to-date` / `outdated` (catalog content changed) / `drifted` (user edited the file) / `orphaned` (artifact removed from catalog) / `missing` (file deleted).
`update` skips drifted files unless `--force` is passed.

### Detection at pick time

`add` and the interactive wizard consult the manifest **before** writing, via `src/install-state.ts`
(`computeInstallStates`). This surfaces a 6-state model per candidate artifact:

| State        | manifest | disk | content                        | Default action                             |
| ------------ | -------- | ---- | ------------------------------ | ------------------------------------------ |
| `new`        | no       | no   | —                              | write                                      |
| `foreign`    | no       | yes  | —                              | conflict (files not owned by sigil)        |
| `up-to-date` | yes      | yes  | == manifest, catalog unchanged | **skip** (reported `✓ already up to date`) |
| `drifted`    | yes      | yes  | != manifest                    | conflict (user edited it)                  |
| `outdated`   | yes      | yes  | == manifest, catalog changed   | conflict (suggest `sigil update`)          |
| `missing`    | yes      | no   | —                              | write (restore)                            |

**Implementation notes:**

- `computeInstallStates` (`src/install-state.ts`) is the single engine consumed by both paths. It
  reuses `computeStatus` (`manifest.ts:326`) and `loadManifest` (`:87`) — not a separate detector.
- `outdated` detection now fires in the interactive/add path because the fresh scaffold hash is
  supplied as a sync closure over pre-computed async scaffold results. (`sigil status` was previously
  the only caller that computed scaffold hashes; the stub in `computeStatus` returned `null`
  elsewhere, so `outdated` never fired for `add`.)
- Config kinds (`mcp`/`hook`/`settings`) use `fragmentSha256` (recorded `ManifestConfigMerge`) for
  outdated detection — `entry.files` is empty for config kinds, so `computeStatus`'s outdated branch
  doesn't apply.
- **Wizard UX:** items always start unchecked — the "Default action" column above describes the
  non-interactive `add` path, not wizard pre-checking. The picker header shows a count like
  `"3 already installed, 1 new"`. Each option hint shows a state glyph (`✓ installed`,
  `✎ you edited this`, `↑ new version available`, `⚠ not installed by sigil`, `＋ new`).
- **`add` UX (non-interactive):** up-to-date artifacts are skipped silently with
  `= shared/foo  (✓ already up to date — skipped)`; they do not count toward the conflict summary
  and do not change the exit code. `--overwrite` forces reinstall even for up-to-date artifacts.
- **Equivalent-command fidelity:** pre-deselected (up-to-date) items are absent from the built
  selectors, so `buildEquivalentCommand` naturally lists only what was actually checked — no new flag
  required.

## Authoring CRUD

Beyond `new` and `delete`, the catalog exposes a full authoring surface:

```bash
sigil get <id>            # show full detail (description, closure, reverse-deps, emit targets)
sigil get <id> --json     # machine-readable
sigil search <query>      # ranked free-text search (--kind, --language, --tag, --json)
sigil patch <id>          # update any schema field (--title, --add-tag, --set-severity, ...)
sigil move <id> <new-id>  # atomic rename — rewrites all referrers + re-validates
sigil import <source-dir> # import a portable Claude template directory into the catalog
```

**`import` command** (`src/authoring/import/`):

Deterministic translator for portable Claude template directories (layout: `rules/*.md`,
`agents/*.md`, `skills/*/SKILL.md`). Translates source frontmatter to catalog frontmatter, assigns
IDs, renders files, and runs per-file `checkSourceArtifact` validation. No AI — reproducible,
CI-safe.

Key flags:

- `--language <lang>` — required; target catalog language key (e.g. `csharp`, `typescript`)
- `--display-name <name>` — overrides the language's `displayName` in generated titles
- `--create-language` — scaffold `language.yaml` if the language dir doesn't exist yet
- `--dry-run` — print the coverage report (source→dest mapping, translated frontmatter, per-file
  validation status, dropped fields) without writing anything
- `--overwrite` — replace existing files (default: skip conflicts)
- `--yes` — non-interactive; required in CI

**Source→catalog field mapping:**

| Kind  | Source field                   | Catalog field                                                        |
| ----- | ------------------------------ | -------------------------------------------------------------------- |
| rule  | `paths`                        | `appliesTo` (default `['**/*']`)                                     |
| rule  | _(none)_                       | `severity: recommended`; `extends: []` synthesized                   |
| agent | `tools` (comma string)         | `tools` (array)                                                      |
| skill | `allowed-tools` (comma string) | `allowedTools` (array) — new optional schema field                   |
| skill | `argument-hint`                | `argumentHint` — new optional schema field                           |
| skill | `disable-model-invocation`     | `disableModelInvocation` — new optional schema field                 |
| skill | `when_to_use`                  | Prepended to body as `## When to Use` section (NOT in description)   |
| all   | _(slug)_                       | `id: <lang>/<slug>`; `title` via slugToTitle; `tags` from slug words |

**Content quality is a separate concern.** The import command produces a mechanical baseline:
`uses: { rules: [], agents: [] }` (empty), `extends: []`, and fallback titles. Wiring deps, setting
`extends: [shared/clean-code]`, and polishing titles are done afterward with `sigil patch`.
See `docs/decisions/catalog-import-migration.md` for the full rationale and a list of open
content-refinement follow-ups.

**`patch` command** (alias `update` — distinct from consumer `update`):

- Kind-aware field registry in `src/authoring/update/descriptors.ts`: common fields (`title`, `description`, `tags`, `version`) + kind-specific (`appliesTo`, `severity`, `extends`, `uses.*`, `tools`, `claude.*`). Build logic in `src/authoring/update/patch-build.ts`; transactional write in `src/authoring/update/apply.ts`.
- List fields support `--add-<field>` / `--remove-<field>` / `--set-<field>`.
- Transactional: after write, re-loads catalog + validates; rolls back the file if blocking violations are found.

**`move` command** (alias `rename`):

- Pure plan phase (`planMove`) then execute phase (`executeMove`) with LIFO rollback steps.
- Rewrites every `extends:` / `uses.rules:` / `uses.agents:` reference to the old id.
- Skills move the whole directory; other kinds move the single file.
- `--dry-run` prints the plan without writing.

## Config-kind writes (mcp / hook / settings)

Config kinds merge into user-owned JSON files instead of writing whole files. Two serializers:

- **`serialize(obj)`** (`src/config-merge/primitives.ts`) — **order-preserving** (`JSON.stringify` with no key sort). Used on the disk-write path (`cli.ts`). Guarantees a backup-vs-new diff shows only the keys sigil added, with existing keys staying in their original positions.
- **`canonicalize(obj)`** (`src/config-merge/primitives.ts`) — **sorted** (stable key order). Used only for deterministic fragment hashing (`manifest/hash.ts sha256(canonicalize(fragment))`). Never used as the disk writer.

**Wizard: config kinds are first-class, never language-gated.** In the wizard:

- **`Pick specific items` → specific kind (primary path):** config kinds appear as top-level kind
  entries in the kind sub-menu (MCPs · Hooks · Settings, each with counts). Selecting one opens a
  flat picker that skips language and deps steps entirely — goes straight to overwrite → scope.
- **`Pick specific items` → All types (cross-kind path):** config kinds appear under a dedicated
  `"Config — agnostic"` group at the top of the grouped picker, above all language groups. The
  `shared` language group contains only genuine shared-code artifacts (agents, rules), never config
  kinds.

`partitionConfigKinds()` (`src/select/grouping.ts`) is the pure helper that splits `{ config, rest }` —
imported by both `src/wizard/add.ts` and `cli.ts`. `CONFIG_KINDS` (`src/select/selection.ts`) is the single source
of truth for `{ hook, settings, mcp }`.

`artifactLanguage(a)` / `isAgnostic(a)` (`src/select/selection.ts`) are the canonical accessors for
`a.frontmatter.language` — use these throughout rather than raw `frontmatter.language` casts.
`isAgnostic` returns true for every config-kind and every shared artifact (no language tag).

**Vocabulary for config kinds** — both targets declare `vocabulary` entries so `kindPlural`/
`kindNoun`/`kindHint` return readable labels (e.g. `'MCPs'` not `'Mcps'`):

- Claude: `mcp`, `hook`, `settings` vocabulary in `src/targets/claude-code/index.ts`.
- Copilot: `mcp` vocabulary in `src/targets/copilot/index.ts`.

**Provider-declared scope model (`Target.configScopes`).** Scope→path resolution is now owned by
each target adapter, never hardcoded in the wizard or CLI. The `Target` interface declares:

```ts
configScopes?(kinds: ConfigKind[], projectDir: string): ConfigScopeInfo[];
```

Each `ConfigScopeInfo` (`src/types.ts`) carries:

- `value: ConfigScope` — the CLI flag value (`'local' | 'project' | 'user'`)
- `precedence: number` — docs-accurate priority rank (1 = highest), used to sort the scope menu
- `blastRadius: 'project' | 'all-projects'` — drives the blast-radius warning
- `destinations: ConfigScopeDestination[]` — one per requested config kind, each with a
  pre-resolved **absolute `fullPath`** and an optional **`section`** (the in-file JSON key-path
  where the fragment lands, e.g. `projects › /abs/proj › mcpServers`). `section` is present when
  the fragment nests below the file root — critical for Claude MCP where `local` and `user` both
  write `~/.claude.json` but at different key paths (`projects.<dir>.mcpServers` vs `mcpServers`).
  `undefined` means the fragment merges at the file root (settings, hook).

The wizard's `configScope` step (`src/wizard/add.ts`) calls `chosenTarget.configScopes(selectedKinds, projectDir)` and renders the result directly — no `if (copilot)` branches. The scope menu label shows `"<scope>   (precedence N)"` and the hint shows `fullPath  › section` (if section is present) so same-file scopes appear visibly distinct. Dedup is on the `(fullPath, section)` pair.

**Scope tables (docs-accurate, from code.claude.com/docs/en/settings):**

Claude Code (3 scopes, highest precedence first):

| Scope (precedence) | settings / hook               | mcp                                |
| ------------------ | ----------------------------- | ---------------------------------- |
| local (1)          | `.claude/settings.local.json` | `~/.claude.json` (per-project key) |
| project (2)        | `.claude/settings.json`       | `.mcp.json`                        |
| user (3)           | `~/.claude/settings.json`     | `~/.claude.json`                   |

GitHub Copilot (2 scopes — no distinct local MCP scope in VS Code):

| Scope (precedence) | mcp                             |
| ------------------ | ------------------------------- |
| project (1)        | `.vscode/mcp.json`              |
| user (2)           | VS Code user-profile `mcp.json` |

**Blast-radius warning.** Driven by `ConfigScopeInfo.blastRadius === 'all-projects'` (provider-agnostic).
The warning note names the concrete `fullPath  › section` target(s) from the chosen scope's `destinations`.
The CLI also prints `fullPath  › section` in the `(merged)` confirmation line and in dry-run previews
(derived by `mergeOpSection()` from the op's fragment structure, so the output mirrors what the scope menu showed).

**`.sigil.bak` backup.** Written **once, pristine** before the first home-directory write to preserve
the original file state. On every subsequent run (backup already exists) the CLI still prints
`⚠  Existing backup kept → <bak>  (compare before committing)` so users know the backup is there
and can compare. Project-level config files are protected by git — no `.bak` written there.

## Trust / security scanner

`src/trust/scan/` — a pure, side-effect-free scanner module (`scanner.ts`, `rules.ts`, `types.ts`, `allowlist.ts`):

- **11 rules** across two namespaces: `secret/*` (AWS keys, Anthropic/OpenAI/GitHub tokens, bearer tokens, generic API keys) and `injection/*` (jailbreak overrides, "ignore previous instructions", role-switch, data-exfil URL patterns).
- Severity: `error` (blocks install under `--strict`) or `warn` (surface only).
- **Allowlist**: inline `<!-- sigil-allow: rule/id -->` in the file body, or `.sigil/allow.json` `{ "allow": [...] }` per project.
- Binary extensions (`.png`, `.jpg`, `.pdf`, etc.) are skipped entirely.

Surfaced at two points:

- `sigil check <file> --trust` — authoring time.
- `sigil add / update --strict` — install time (aborts on `error`-level findings).

## Architecture

### `src/` module map

| Path                                  | Responsibility                                                                                                                                            |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cli.ts`                              | CLI entry — Commander wiring only; thin `.action(runX)` delegation to `commands/`                                                                         |
| `cli-helpers.ts`                      | Shared CLI utilities: `PKG_ROOT`, `pkg`, `resolveDefault`, `loadAndValidate`, `writeFilesSync`, `partitionFiles`, `detectProjectTarget`, `mergeOpSection` |
| `config-utils.ts`                     | `resolveConfigRoot` — maps `ConfigRoot` values to absolute filesystem paths                                                                               |
| `commands/add.ts`                     | `runAdd` — the full `sigil add` handler                                                                                                                   |
| `commands/build.ts`                   | `runBuild` — compile catalog to dist/<target>/                                                                                                            |
| `commands/check.ts`                   | `runCheck` — validate catalog source artifact files                                                                                                       |
| `commands/complete.ts`                | `runComplete` — tab-completion candidates for shell scripts                                                                                               |
| `commands/completion.ts`              | `runCompletion` — print bash/zsh/fish tab-completion scripts                                                                                              |
| `commands/delete.ts`                  | `runDelete` — remove an artifact from the catalog source                                                                                                  |
| `commands/edit.ts`                    | `runEdit` — update title, description, tags of a catalog artifact                                                                                         |
| `commands/get.ts`                     | `runGet` — show full detail for a single catalog artifact                                                                                                 |
| `commands/import.ts`                  | `runImport` — import a portable Claude template directory                                                                                                 |
| `commands/index.ts`                   | `runIndex` — emit dist/registry.json                                                                                                                      |
| `commands/init.ts`                    | `runInit` — prepare a consumer project for a target platform                                                                                              |
| `commands/list.ts`                    | `runList` — list catalog artifacts with optional filters                                                                                                  |
| `commands/move.ts`                    | `runMove` + `loadCatalogSync` — atomic rename with referrer rewrite                                                                                       |
| `commands/new.ts`                     | `runNew` — scaffold an authoring template for a new artifact                                                                                              |
| `commands/patch.ts`                   | `runPatch` — update any field(s) of a catalog artifact (transactional)                                                                                    |
| `commands/release.ts`                 | `runRelease` — bump version, rebuild, update CHANGELOG, commit + tag                                                                                      |
| `commands/retarget.ts`                | `runRetarget` — change platform targeting without touching artifact body                                                                                  |
| `commands/search.ts`                  | `runSearch` — free-text search over catalog (id/title/description/tags)                                                                                   |
| `commands/status.ts`                  | `runStatus` — show health of artifacts installed in a consumer project                                                                                    |
| `commands/uninstall.ts`               | `runUninstall` — remove installed artifacts (refcount-aware)                                                                                              |
| `commands/update.ts`                  | `runUpdate` + `isFileDrifted` — refresh installed artifacts; DRY drift check via `sha256`                                                                 |
| `commands/validate.ts`                | `runValidate` — schema + reference-graph integrity check                                                                                                  |
| `wizard/add.ts`                       | Step-machine guided `add` wizard (interactive TTY path)                                                                                                   |
| `wizard/new.ts`                       | `sigil new` wizard                                                                                                                                        |
| `wizard/edit.ts`                      | `sigil edit` wizard                                                                                                                                       |
| `wizard/command-strings.ts`           | `buildEquivalentCommand`, `printEquivalentCommand`                                                                                                        |
| `wizard/types.ts`                     | `ScopeChoice`, `WizardResult`, `TARGET_META`, `isInteractiveTTY`                                                                                          |
| `wizard/state-display.ts`             | Install-state legend rendering                                                                                                                            |
| `load.ts`                             | `loadCatalog` — reads `catalog/` into `LoadedCatalog`                                                                                                     |
| `validate.ts`                         | `validateCatalog` — schema + reference-graph integrity                                                                                                    |
| `resolve.ts`                          | `resolveCatalog` — `extends`/`uses` expansion → `ResolvedCatalog`                                                                                         |
| `registry.ts`                         | `buildRegistry` — flat per-artifact index for `dist/registry.json`                                                                                        |
| `types.ts`                            | All shared TypeScript types and interfaces                                                                                                                |
| `kinds.ts`                            | `KIND_REGISTRY`, `ALL_KINDS`, `CONFIG_KINDS`, `isArtifactKind`, `isConfigKind`                                                                            |
| `select/selection.ts`                 | `resolveSelection`, `artifactLanguage`, `isAgnostic`, `artifactTargetsPlatform`                                                                           |
| `select/closure.ts`                   | `computeClosure` — `uses` dependency closure                                                                                                              |
| `select/grouping.ts`                  | `groupArtifactsByLanguage`, `partitionConfigKinds`, `availableKinds`                                                                                      |
| `select/vocabulary.ts`                | `kindNoun`, `kindPlural`, `kindHint`, `artifactLabel`, `artifactHint`                                                                                     |
| `manifest/types.ts`                   | `ManifestEntry`, `Manifest`, `ArtifactStatus`, `StatusResult`                                                                                             |
| `manifest/io.ts`                      | `loadManifest`, `saveManifest`, `manifestPath`                                                                                                            |
| `manifest/hash.ts`                    | `sha256`, `hashFiles`                                                                                                                                     |
| `manifest/mutate.ts`                  | `upsertEntries`, `upsertConfigEntry`, `removeEntries`                                                                                                     |
| `manifest/status.ts`                  | `computeStatus`, `recordedHashes`                                                                                                                         |
| `install-state.ts`                    | `computeInstallStates` — 6-state model (new/foreign/up-to-date/drifted/outdated/missing)                                                                  |
| `config-merge/primitives.ts`          | `deepEqual`, `deepMerge`, `pruneEmpty`, `canonicalize`, `serialize`                                                                                       |
| `config-merge/apply.ts`               | `applyMerge` — merge fragment into existing JSON object                                                                                                   |
| `config-merge/reverse.ts`             | `reverseMerge` — undo sigil's contribution                                                                                                                |
| `config-merge/drift.ts`               | `detectConfigDrift`                                                                                                                                       |
| `authoring/check-source.ts`           | `checkSourceArtifact` — validate catalog source files at authoring time                                                                                   |
| `authoring/frontmatter.ts`            | `writeArtifactFrontmatter`, `serializeScalar`                                                                                                             |
| `authoring/header.ts`                 | `headerFor` — sigil-managed banner comment                                                                                                                |
| `authoring/platforms.ts`              | `addPlatforms`, `removePlatforms`, `setPlatforms`                                                                                                         |
| `authoring/update/descriptors.ts`     | `FieldDescriptor` registry (`COMMON_FIELDS`, `KIND_FIELDS`)                                                                                               |
| `authoring/update/patch-build.ts`     | `buildFieldPatch` — per-field-group update decomposition                                                                                                  |
| `authoring/update/apply.ts`           | `applyPatchTransactionally` — write + validate + rollback                                                                                                 |
| `authoring/import/discover.ts`        | Source-template directory discovery                                                                                                                       |
| `authoring/import/plan.ts`            | `planImport`                                                                                                                                              |
| `authoring/import/translate.ts`       | Source frontmatter → catalog frontmatter translation                                                                                                      |
| `authoring/import/execute.ts`         | `executeImport`                                                                                                                                           |
| `authoring/move/plan.ts`              | `planMove`                                                                                                                                                |
| `authoring/move/execute.ts`           | `executeMove` — atomic rename with LIFO rollback                                                                                                          |
| `trust/scan/rules.ts`                 | 11 security scan rules (`secret/*`, `injection/*`)                                                                                                        |
| `trust/scan/scanner.ts`               | `scanContent`, `formatScanFindings`                                                                                                                       |
| `trust/scan/types.ts`                 | `ScanSeverity`, `ScanFinding`, `ScanResult`                                                                                                               |
| `trust/scan/allowlist.ts`             | `loadAllowlist`                                                                                                                                           |
| `targets/index.ts`                    | Target registry — `registerTarget`, `getAllTargets`, `getTarget`                                                                                          |
| `targets/claude-code/index.ts`        | `ClaudeCodeTarget` adapter                                                                                                                                |
| `targets/claude-code/plugin-build.ts` | Plugin build helpers                                                                                                                                      |
| `targets/claude-code/scaffold.ts`     | Scaffold helpers                                                                                                                                          |
| `targets/claude-code/config.ts`       | Config scope definitions (file paths, roots, section keys)                                                                                                |
| `targets/copilot/index.ts`            | `CopilotTarget` adapter                                                                                                                                   |
| `targets/copilot/scaffold.ts`         | Copilot scaffold helpers                                                                                                                                  |
| `targets/copilot/build-helpers.ts`    | Copilot build helpers                                                                                                                                     |
| `targets/output-contract.ts`          | `checkOutputContract`                                                                                                                                     |
| `targets/prompt-args.ts`              | `translatePromptArgs`                                                                                                                                     |
| `targets/yaml-util.ts`                | `yamlScalar` — safe YAML scalar serialization                                                                                                             |
| `schema/index.ts`                     | Zod schemas (single source of truth for all JSON schemas)                                                                                                 |
| `schema/emit.ts`                      | Generates `schema/*.schema.json` from Zod schemas                                                                                                         |
| `release.ts`                          | `bumpVersion`, `promoteChangelog`                                                                                                                         |
| `query/detail.ts`                     | `getArtifactDetail`, `formatDetailText`                                                                                                                   |
| `query/search.ts`                     | `searchArtifacts`, `formatSearchResults`                                                                                                                  |

### 4-stage pipeline

```
catalog/      →  [1] load.ts      →  LoadedCatalog
              →  [2] validate.ts  →  ValidationResult (exits on errors)
              →  [3] resolve.ts   →  ResolvedCatalog  (extends/uses expanded)
              →  [4] targets/<x>  →  FileMap (relative path → content)
                                         ↓ written to dist/<target>/
```

**The key invariant:** `load.ts`, `validate.ts`, and `resolve.ts` are entirely
platform-neutral. All platform-specific logic is isolated to `src/targets/<name>/index.ts`.
The registry lives in `src/targets/index.ts` — adding a platform = one new file + one
`registerTarget()` call.

### DRY resolution (resolve.ts)

- **`extends` (rules only):** `resolveCatalog` walks the `extends` graph and prepends each
  ancestor's body oldest-first. `csharp/cs-conventions extends shared/clean-code` → the emitted
  rule body is `clean-code body \n\n dotnet-style body`. Never duplicate rule text in source.
- **`uses` (skills only):** maps `uses.rules` IDs to their fully-resolved rule bodies
  (`resolvedRules[]`) and records `uses.agents` as `resolvedAgentIds[]`. Adapters consume these.

### Two Claude delivery modes

Claude Code plugins cannot ship loose rules (`CLAUDE.md` at plugin root is not loaded by Claude).
Rules are therefore materialised differently depending on the delivery mode:

| Delivery                          | Rule handling                                          | Agent handling                            |
| --------------------------------- | ------------------------------------------------------ | ----------------------------------------- |
| **Plugin build** (`dist/claude/`) | Inlined as `## Applied Rules` section in each SKILL.md | Written to `agents/<name>.md` in the pack |
| **CLI scaffold** (`add` / `init`) | Written to `.claude/rules/<slug>.md` (loaded natively) | Written to `.claude/agents/<name>.md`     |

The `build` command produces the plugin layout. The `add` command produces the scaffold layout.

### `claude:` frontmatter namespace

The `claude:` block in agent `.agent.md` files (model, effort, maxTurns, isolation) is
Claude-only. Other adapters skip it. When adding a new adapter, read only your own namespace.
`effort`, `maxTurns`, and `isolation` are **official Claude Code subagent frontmatter fields**
(confirmed in the spec) — do not remove them.

### Description YAML convention

**In catalog source:** `description:` is authored as a `>-` folded block scalar (11 of 12 files).
gray-matter parses `>-` to a plain string (folds continuation lines to a space, strips the final
newline) — so it is purely a readability choice with no runtime effect.

**In emitted files:** all adapter outputs use `src/targets/yaml-util.ts`'s `yamlScalar()` helper,
which double-quotes every description. This is safe for any content (colons, special chars, long
text). Never emit a bare plain scalar for `description:` — a colon inside it breaks YAML parsers.

**`serializeScalar` quoting rules (`src/authoring/frontmatter.ts`):** the shared scalar serializer
used by `serializeYamlEntry` quotes strings that contain `\n` or `:` and strings that START with
`"`, `#`, `*`, `[`, or `{`. The `*` rule is critical for glob patterns (`**/*.ts` is a YAML alias
anchor unquoted); `[` is critical for argument hints like `[optional]` (YAML flow sequence).
When adding new authoring fields that may contain these characters, ensure the value goes through
`serializeScalar` rather than being embedded as a raw string.

### Platform-format notes (verified 2026-06)

**Per-AI artifact vocabulary** — do not mix these terms across platforms:

| Catalog kind      | Claude Code artifact                               | GitHub Copilot artifact                                     |
| ----------------- | -------------------------------------------------- | ----------------------------------------------------------- |
| `skill`           | Agent Skill — `.claude/skills/<n>/SKILL.md`        | Agent Skill — `.github/skills/<n>/SKILL.md`                 |
| `prompt`          | **Custom command** — `.claude/commands/<slug>.md`  | **Prompt file** — `.github/prompts/<slug>.prompt.md`        |
| `workflow`        | **Custom command** — `.claude/commands/<slug>.md`  | **Prompt file** — `.github/prompts/<slug>.prompt.md`        |
| `agent`           | Subagent — `.claude/agents/<n>.md`                 | Custom agent — `.github/agents/<n>.agent.md`                |
| `rule` (shared)   | Memory rule — `.claude/rules/<slug>.md`            | Global instructions — `copilot-instructions.md`             |
| `rule` (language) | Memory rule — `.claude/rules/<slug>.md` (`paths:`) | Scoped instructions — `instructions/<slug>.instructions.md` |

- Claude Code has **no "prompt" artifact** — catalog `prompt` → custom command (single-file skill).
- Copilot has **no "command" artifact** — catalog `prompt` → prompt file. `/name` is shared UI only.
- Both platforms use the **Agent Skills open standard** (`SKILL.md`) for `skill`.
- `workflow` maps to a **custom command** on Claude Code and a **prompt file** on Copilot. The `steps:` frontmatter field is rendered as a markdown checklist in the body.
- Claude **built-in commands** (`/model`, `/clear`, `/compact`) control the session and are **not** catalog artifact types.

**Key field differences between source and what each platform expects:**

| Source field                       | Claude Code emits                                            | Copilot emits                                                         |
| ---------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------- |
| `appliesTo:` (skill/rule)          | `paths:` (SKILL.md or rules)                                 | `applyTo:` (`.instructions.md` only; NOT in SKILL.md or prompt files) |
| `allowedTools?: string[]`          | `allowed-tools: <csv>` in SKILL.md                           | _(skipped — not in Copilot SKILL.md spec)_                            |
| `argumentHint?: string`            | `argument-hint: "<hint>"` in SKILL.md                        | _(skipped)_                                                           |
| `disableModelInvocation?: boolean` | `disable-model-invocation: true` in SKILL.md                 | _(skipped)_                                                           |
| `prompt` body `{{name}}`           | `$name` (via `arguments:` frontmatter list)                  | `${input:name}` (VS Code input variable, 2-part only)                 |
| `prompt` frontmatter               | `description:` + `argument-hint:` + `arguments:` (YAML list) | `agent: agent` + `description:` + `tools:`                            |
| skill frontmatter                  | `name:` + `description:` + `paths:`                          | `name:` + `description:` only (no `applyTo`/`paths:`)                 |
| —                                  | flat `marketplace.json`: `name/owner/plugins[]`              | —                                                                     |
| —                                  | —                                                            | `.agent.md` extension + `description:` (required by Copilot spec)     |

The `appliesTo` field stays unchanged in `catalog/` source and the zod schema — only adapters translate it.

### JSON Schemas

`src/schema/index.ts` contains the **zod** schemas — that is the single source of truth.
`src/schema/emit.ts` generates `schema/*.schema.json` from them (called by `npm run build`).
If you change a zod schema, run `npm run build` to regenerate the JSON Schema files; commit both.

### npm version in plugin.json

npm-sourced Claude plugins receive version `"unknown"` from Claude's tooling, which breaks
`/plugin update`. The Claude Code adapter explicitly writes `pkg.version` (read from
`package.json`) into the generated `plugin.json`. Keep this in mind if you refactor the
build step.

**`supportedKinds`** on `Target`: declares which artifact kinds the target can scaffold. Absent
kinds trigger warn-and-skip. Both built-in adapters declare `['skill', 'agent', 'rule', 'prompt', 'workflow']`.

**`ScaffoldOptions.includeDeps`**: when `false` (set by `--no-deps`), `ClaudeCodeTarget` and
`CopilotTarget` skip writing the `uses` closure (rules/agents). This lets you install a skill
alone without touching `.claude/rules/` or `.claude/agents/`.

## Adding a language

**Fast-path — from an existing portable-template directory:**

```bash
sigil import _Others/.ClaudeFoo --language foo --create-language --dry-run  # preview
sigil import _Others/.ClaudeFoo --language foo --create-language --yes       # write
npm run validate && npm run catalog:build
```

`--create-language` scaffolds `language.yaml` automatically. Review the dry-run coverage report
(source→dest mapping, dropped fields) and correct before real import. Then proceed to content
refinement (wire `uses` deps, set `extends`, polish titles) with `sigil patch`.
See `docs/decisions/catalog-import-migration.md` for the full rationale and known pitfalls.

**Manual path (hand-authored):**

1. `catalog/languages/<lang>/language.yaml` — displayName, file globs
2. `catalog/languages/<lang>/rules/<name>.rule.md` — extends shared/clean-code
3. `catalog/languages/<lang>/skills/<name>/SKILL.md` — uses the rule + shared agents
4. Entry in `packs.yaml` under `packs:` — `name`, `displayName`, `languages: [<lang>]`
5. `npm run validate && npm run catalog:build`

No changes to core pipeline or adapters required.

**Existing languages:** `csharp` (cs-), `typescript` (ts-), `angular` (ng-), `python`, `react`.
Each has a `language.yaml` under `catalog/languages/<lang>/`.

## Adding a platform target

1. `src/targets/<platform>/index.ts` implementing:
   ```typescript
   export const MyTarget: Target = {
     name: '<platform>',
     async compile(catalog: ResolvedCatalog, opts): Promise<FileMap> { … },
     async scaffold?(artifactId, catalog, opts): Promise<FileMap> { … },
   };
   ```
2. In `src/targets/index.ts`: `import { MyTarget } from './<platform>'; registerTarget(new MyTarget());`
3. `npm run build` — the `--target <platform>` flag and `dist/<platform>/` output work automatically.
