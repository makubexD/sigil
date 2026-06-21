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

**Heap-size note:** `tsc` OOMs at the default 4 GB V8 heap on this project because Zod's
recursive generics force deep type-inference. `npm run build` now sets this automatically via
`cross-env NODE_OPTIONS=--max-old-space-size=8192` — no manual env-var needed. If you invoke
`tsc` directly (e.g. `build:watch`), prefix it yourself.

**Test note:** `test/` is excluded from `tsconfig.build.json`. After editing a test file you must
compile it separately before running `npm test`:
```bash
npx tsc --outDir test test/pipeline.test.ts --module commonjs --target ES2020 --esModuleInterop --skipLibCheck
```
The test file imports from `../dist-cli/…`, so source edits need a full `npm run build` to take
effect in tests.

## `add` command — selector + filter model

The `add` command is variadic and conflict-aware.

**Selector forms (can be combined):**
```bash
add all                            # full catalog
add pack:dotnet-pack               # all artifacts in a pack
add kind:agent                     # all artifacts of a kind
add skill:csharp/xunit-testing     # explicit artifact (kind-prefixed)
add csharp/xunit-testing           # bare ID
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

**Wizard (`src/wizard.ts`):** triggered when run with no selector in an interactive TTY. Uses
`@clack/prompts` for a 6-step guided flow: target → scope → artifacts → language filter →
include-deps → overwrite. Every prompt maps 1:1 to a CLI flag; wizard and scripted paths are
equivalent. After the install completes, `printEquivalentCommand()` prints the copy-pasteable
`maku-catalog add … --yes` line once (as a boxed clack note in a TTY, plain text in CI). The
wizard plan box shows only the summary + artifact preview (no command) so the command is never
printed twice.

**Dependency closure UX (step 4 + plan box):** the `uses:` dependency is purely authored YAML
frontmatter in each SKILL.md (e.g. `uses: { rules: [csharp/dotnet-style], agents: [shared/code-reviewer] }`) — not a hard technical requirement. The wizard surfaces this concretely:
- After step 3b, `computeClosure(primaryIds, catalog)` (`src/select.ts`) walks `resolvedRules` and
  `resolvedAgentIds` on each skill to compute the exact rules/agents that would be added. Any
  artifact already in the primary picks set is excluded from the dep list.
- **Step 4 note** names each dependency with its kind, ID, and title, plus the `via` skill that
  declares it. The lead sentence frames it as "the skill author recommends" (not a hard requirement).
- **Install-plan box** (before "Proceed?") shows the full resolved artifact set: each primary pick
  tagged `(your pick)` and each dependency tagged `(dependency of <skill>)`. When deps are excluded
  (answered No), the box shows only primary picks + a `(N deps excluded)` line.
- The **post-install file listing** in `cli.ts` still tags each written file `(dependency)` for
  completeness, now consistent with the pre-confirm preview.

The language filter step (step 3b) appears only for scope choices that span all languages (`all`,
`kind`). It is skipped for `pack` (language already implied) and `individual` (explicit picks).
`WizardResult.language` flows into `effectiveLanguage` in `cli.ts`, which feeds `filters.language`
to `resolveSelection()`. The resolver already supported this — only the wizard wiring was missing.

**Conflict handling (cli.ts `partitionFiles`):** before writing, all candidate paths are
partitioned into `toWrite` (new) and `conflicting` (exists). New files are always written;
conflicting files are never touched without `--overwrite`.

**Selector resolver (`src/select.ts`):** `resolveSelection()` expands selectors, applies filters,
and checks each artifact's kind against `target.supportedKinds`. Unsupported kinds go to
`skipped[]` (warn-and-skip, not an error). Shared by both the wizard and the flags path.

**Shell completion:** `maku-catalog completion [bash|zsh|fish]` prints a completion script.
`maku-catalog __complete <word> --prev <prev>` (hidden) outputs candidate completions for the
current position — used by the generated scripts.

**Path anchoring (`src/cli.ts`):** Two path roles must stay separate:
- **Catalog source** (`catalog/`, `packs.yaml`, `schema/`) — read from the installed package.
  `PKG_ROOT = path.resolve(__dirname, '..')` (in `dist-cli/`, so `..` = package root).
  `resolveDefault(relative)` anchors all `--catalog-dir`/`--packs`/`--out-dir` defaults here.
  `loadAndValidate` uses its `packsFile` parameter (was accidentally ignoring it).
- **Consumer destination** (`--project-dir`) — anchored on `process.cwd()` by design.
  Never change this: it is the user's project root where `.claude/`/`.github/` get written.

This separation makes `maku-catalog add` work from any directory, not just inside the repo.

## Architecture

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
  ancestor's body oldest-first. `csharp/dotnet-style extends shared/clean-code` → the emitted
  rule body is `clean-code body \n\n dotnet-style body`. Never duplicate rule text in source.
- **`uses` (skills only):** maps `uses.rules` IDs to their fully-resolved rule bodies
  (`resolvedRules[]`) and records `uses.agents` as `resolvedAgentIds[]`. Adapters consume these.

### Two Claude delivery modes

Claude Code plugins cannot ship loose rules (`CLAUDE.md` at plugin root is not loaded by Claude).
Rules are therefore materialised differently depending on the delivery mode:

| Delivery | Rule handling | Agent handling |
|---|---|---|
| **Plugin build** (`dist/claude/`) | Inlined as `## Applied Rules` section in each SKILL.md | Written to `agents/<name>.md` in the pack |
| **CLI scaffold** (`add` / `init`) | Written to `.claude/rules/<slug>.md` (loaded natively) | Written to `.claude/agents/<name>.md` |

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

### Platform-format notes (verified 2026-06)

These are the key differences between our source field names and what each platform expects:

| Source field | Claude Code emits | Copilot emits |
|---|---|---|
| `appliesTo:` (skill/rule) | `paths:` (SKILL.md) or `paths:` (scaffolded rules) | `applyTo:` (`.instructions.md` only) |
| — | flat `marketplace.json`: `name/owner/plugins[]` | — |
| — | — | `agent: agent` (prompt files; not `mode:`) |
| — | — | `.agent.md` extension + `description:` frontmatter (required) |

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
kinds trigger warn-and-skip. Both built-in adapters declare `['skill', 'agent', 'rule', 'prompt']`;
`workflow` is not yet scaffoldable.

**`ScaffoldOptions.includeDeps`**: when `false` (set by `--no-deps`), `ClaudeCodeTarget` and
`CopilotTarget` skip writing the `uses` closure (rules/agents). This lets you install a skill
alone without touching `.claude/rules/` or `.claude/agents/`.

## Adding a language

1. `catalog/languages/<lang>/language.yaml` — displayName, file globs
2. `catalog/languages/<lang>/rules/<name>.rule.md` — extends shared/clean-code
3. `catalog/languages/<lang>/skills/<name>/SKILL.md` — uses the rule + shared agents
4. Entry in `packs.yaml` under `packs:` — `name`, `displayName`, `languages: [<lang>]`
5. `npm run validate && npm run catalog:build`

No changes to core pipeline or adapters required.

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
