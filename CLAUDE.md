# CLAUDE.md

sigil keeps one provider-neutral catalog of AI-agent artifacts (skills, agents, rules, prompts, hooks, MCP, settings)
and builds or installs it per target: `catalog/` → load → validate → resolve → `src/targets/<name>` → files.

## Build & test

```bash
npm run build          # clean (also deletes test-compiled/), tsc, regenerate schema/*.schema.json and docs/reference/capabilities.md
npm run validate       # schema + reference-graph check
npm run catalog:build  # catalog source → dist/claude/ and dist/copilot/
npm test               # pretest builds dist-cli/ and test-compiled/, then node --test
npm run test:built     # same, but trusts a current dist-cli/ (CI and ci:local build just before)
npm run check          # lint && format:check && check-doc-comments && test (a subset of CI)
npm run ci:local       # full CI mirror: audit, lint, format, build, validate, sync --check, test, catalog:build,
                       # claude plugin validate --strict (skipped when `claude` is not on PATH)
```

Heap size, why `pretest` exists, and `npm link` vs `npm run sigil` are in
[Build and link](docs/guides/operations.md#build-and-link). Run `npm run ci:local` before pushing. The human testing
guide is [CONTRIBUTING.md](CONTRIBUTING.md) § B. Contributing code (Testing, Before you push).

Lint and format alone: `npm run lint`, `npm run format:check` (`npm run format` fixes).

## Hard rules

One line each. The full rule, its reasons and citations are in the named `.claude/rules/` file, which loads when you
work on its paths. Read it before changing that area.

**CLI** (`repo-cli.md`)

- Catalog source anchors on `PKG_ROOT`; the `--project-dir` default is `process.cwd()`, never `PKG_ROOT`.
- `src/cli.ts` loads command modules lazily (`lazy(...)`); never a top-level command import.
- `partitionFiles` never touches an existing file without `--overwrite`; two targets never own one file.
- Never add a symbol to `src/index.ts`, the public API, without meaning to publish it.

**Targets** (`repo-targets.md`)

- `load` / `validate` / `resolve` stay platform-neutral; platform logic lives only in `src/targets/<name>/`.
- `description:` always goes through `yamlScalar()`, never a bare plain scalar.
- `buildPluginJson` always writes `pkg.version` into `plugin.json`.
- Kind support is declared only in `src/targets/<provider>/capabilities.ts`, read only through `supportsKind` & co.
- Every whole-file kind a target emits `native` has a `KindEmitSpec`.
- Provider size limits live on `KindEmitSpec.limits`; never hard-code one in a rule.
- MCP config never carries a provider's env syntax; catalog source writes `{sigil:env:NAME}`.
- A JSON MCP entry comes only from an `McpDialect`, never a target's own builder (Codex TOML excepted).
- Config dispatches only through the target's `ConfigKindTable`, never a `kind === 'hook'` branch.
- Artifact bodies never hold a provider literal; use `{sigil:<term>}` lexicon tokens.

**Vocabulary** (`repo-vocabulary.md`)

- Never remove `model` / `effort` / `maxTurns` / `isolation` / `skills` from an agent's `claude:` namespace.
- Tool names and model hints stay neutral in the catalog; output goes only through a `ToolDialect` and tier table.
- Hook events and matchers stay neutral; catalog source never reads a provider's stdin field.
- `appliesTo` stays unchanged in `catalog/` and the schema; the four rule emitters must agree.
- Every authored frontmatter field is mapped by a `KindEmitSpec`; an agent's tool restriction reaches every target.
- Agents have no `whenToUse`; dispatch text goes in `description`.

**Config merge** (`repo-config-merge.md`)

- Only `serialize()` writes JSON; `canonicalize()` only hashes. Never write a file with `canonicalize()`.
- Config kinds merge into user-owned files, never overwrite; every home-file writer calls `ensureHomeBackup`.
- Drift is `intact` / `missing` / `modified` (`classifyConfigDrift`); `modified` needs `--force`.
- An installed config fragment is replaced (`replaceMerge`), never merged again.
- `add` and `update` render with the same co-install set.

**Schema and loading** (`repo-schema-and-loading.md`)

- Every authored scalar goes through `serializeScalar`.
- Kind order and source paths derive from `KIND_REGISTRY`; never hand-list kinds or build `${kind}s`.
- `src/schema/index.ts` (zod) is the only schema source; rebuild and commit `schema/*.schema.json` with it.
- Ids and names in output paths stay kebab-case; never remove that check or `resolveContained()`.
- `resolveSelection()` warns and skips unsupported kinds; installs use `installableKinds` (`native` only).
- Read catalog files only through `src/safe-read.ts`; parse frontmatter only through `src/frontmatter-parse.ts`.
- Consumers of a valid catalog go through `requireValidCatalog`; authoring commands call `loadCatalog`.
- `packs.yaml` is read only through `parsePacksConfig`.
- `patch-types.ts` and `translate-shared.ts` never import from their hubs.

**Catalog** (`repo-catalog.md`)

- Every agent, rule and skill belongs to exactly one family in `catalog/standard.yaml`; never rename an id to fit.
- Placement is `shared/`, `languages/<lang>/` or stack parts; never topic folders, never stack text in `shared/`.

## Where the rest lives

- Architecture (pipeline, `extends` / `uses`, delivery modes, templates, emit specs, `sync`, `prune`, `outdated`):
  `.claude/rules/repo-architecture.md`, loaded for `src/**`; the full doc is `docs/reference/architecture.md`.
- Which doc covers which topic: `docs/index.md`, section "Where a code topic lives".
- The wizard: `src/wizard/CLAUDE.md`, loaded under `src/wizard/`.
- Adding a repo rule: full text in a `.claude/rules/repo-<topic>.md` file with `paths:`, one line here.
