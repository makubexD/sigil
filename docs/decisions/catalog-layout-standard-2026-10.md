# Catalog layout standard, 2026-10-03

## Question

The catalog looked like two standards mixed together. Per-language namespaces
(`catalog/languages/<lang>/{skills,agents,rules}`) sat next to shared skills migrated from `gid`
(`shared/cli`, `shared/wizard`) that carry runtime stack files (`references/stack-{node-ts,python,go,rust,dotnet}.md`).

Questions:

- Is one of the two wrong?
- What single standard keeps the catalog agnostic, so it works for Claude Code, Copilot and any later AI?
- What stops future imports from eroding it?
- How does the target layer add an AI as data, not as provider `if` blocks?

## Evidence

**Per-language content is different content, not near-copies.** Measured as word-4-gram Jaccard
between the language variants of each family:

- the release skill: 0.37, already deduplicated by `template:`;
- every other skill family: 0.02–0.09;
- agents: 0.03–0.11, with parallel skeletons but stack-specific substance;
- rules: about 0.

Installs are usually one language (packs, `--language`).

**External practice:**

- The Agent Skills spec and Anthropic's skill best practices recommend one skill with domain-specific
  `references/` files, kept one level deep and loaded on demand. Anthropic's own multi-language
  `claude-api` skill is built that way.
- Every rules system uses one glob-scoped file per language: Copilot `applyTo`, Cursor `globs`,
  rulesync, nested `AGENTS.md`.
- Bundles are manifests that list artifacts: awesome-copilot `plugin.json`, sigil's `packs.yaml`.
- Claude Code's skill listing has a context budget, so many near-identical skills cost dispatch accuracy.

**The originals** (`_Others/cli-skill`, `_Others/wizard-skill`, design records and evals only):

- They chose the stack at run time.
- The migration kept 56 of 57 coverage phrases.

**Twelve other AI tools surveyed** (Codex, Gemini/Antigravity, Cursor, Devin/Windsurf, Kiro,
OpenCode, Cline, Amp, Goose, Junie, Grok Build; DeepSeek has no first-party agent):

- 9 of 10 live tools read `.agents/skills/<name>/SKILL.md`, and about 11 of 12 read a root `AGENTS.md`.
- Everything else varies along a finite set of dimensions:
  - output path per kind;
  - file format (md, mdc, toml, json);
  - frontmatter key renames;
  - the glob key (`globs`, `paths`, `applyTo`, `fileMatchPattern`);
  - activation mode;
  - argument syntax;
  - one combined instructions file vs one file per rule;
  - hook schema;
  - MCP shape;
  - tool-name aliases;
  - namespacing;
  - the fallback for an unsupported kind;
  - trust gating.

## Decision

Neither pattern was wrong; what was missing is a written rule and enforcement. No artifact ids change.

**Layout.** Kind-first folders inside two namespaces, `catalog/shared/<kindDir>/` and
`catalog/languages/<lang>/<kindDir>/`, plus `language.yaml` per language. A kind's folder and file
name come only from `KIND_REGISTRY` (`sourceDir`, `sourceSuffix`). Layout is read relative to the
catalog root (`src/catalog-layout.ts`). Grouping lives only in `packs.yaml`; there are no topic folders.

**Where an artifact goes.**

- **(a) Content that does not vary by language** goes in `shared/`, with no `language:`.
  Examples: prompts, `shared/feature`, a generic reviewer for languages with no namespace.
- **(b) Content that varies with the project's own language** goes in `languages/<lang>/`, one
  artifact per language, deduplicated with `template:` once overlap is measured (three or more real
  duplicates). _Extended 2026-10-05 by
  [family-skeleton-standard-2026-10.md](family-skeleton-standard-2026-10.md): the language versions
  form a family with one section skeleton declared in `catalog/standard.yaml`; a template still
  holds shared prose only._ This is the only option for agents and rules: neither can load reference files on
  demand, and rules activate by path.
- **(c) Content that varies with a stack the task chooses** becomes one shared **skill** plus flat
  `references/stack-<stack>.md` files and a detection table in `SKILL.md`. The stack may differ
  from the repository's language, or not be a catalog language at all. Stack files carry
  task-specific guidance only; general style stays in the installed language rules. `shared/cli`
  and `shared/wizard` qualify: they build CLIs in stacks that include Go and Rust.
- **Tie-break:** when (b) and (c) both seem to fit, choose (b).

**Stack names** are ecosystem names (`node-ts`, `dotnet`, `go`), kept separate from language ids
and not registered anywhere.

**References stay flat and one level deep**, as the Agent Skills guidance says. The nested
`references/stacks/` of the planned "Phase 1c" in `distribution-channels-2026-09.md` is dropped.

**Minimum per artifact** (the strictest common rule, from the Agent Skills spec):

- `name` is kebab-case, at most 64 characters, and matches its folder;
- `description` says what the artifact does and when to use it, in at most 1024 characters;
- `SKILL.md` stays under 500 lines (the Agent Skills spec and Claude's guidance; checked as a
  warning on the Claude skill specs);
- every reference file is mentioned in `SKILL.md`.

## Guards

- **Prevent:** the writers keep files on the layout. `import` (`--shared` or a registered
  `--language`) brings a skill's flat references, trust-scans everything it writes, and lists what
  can't ship; `new` refuses an unknown language; `move` keeps `language:` in step with the
  namespace. `sigil check` (run by every authoring command) rejects `language:` on a shared
  artifact and a language folder with no `language.yaml`. Every file taken from a catalog or an
  import source is read through `src/safe-read.ts` (regular files only, never a followed link).
- **Detect:**
  - A `catalog-layout` conformance rule fails `sync --check` in CI.
  - Provider limits (name, description, body size) kept as data on each emit spec
    (`KindEmitSpec.limits`) and checked by one generic rule, `provider-limits`, on what each
    provider actually receives.
  - These are author-only. `validateCatalog`, which gates `add`, `update`, `status` and the wizard on
    any user catalog, gets no new layout errors.
  - Exception: an agent whose tool restriction a target would drop fails closed at render time,
    because shipping it would silently grant every tool.
- **Verify the output:** `claude plugin validate --strict` runs in CI (its own Linux job, pinned CLI,
  no secrets) on the marketplace and every plugin in `dist/claude`. Copilot has no validator CLI,
  so its specs, contracts and limits remain its gate.
- **Never break:**
  - the output snapshot test;
  - the frozen install from master `8882c86` (`test/fixtures/installs/`);
  - a smoke test that installs every pack through the wizard for each tool.
- **No git hook:**
  - the repository has no hook framework;
  - a hook is per-clone and easy to skip;
  - CI and `npm run ci:local` already run these gates.

## Target layer

- **Open base:** the Agent Skills `SKILL.md` and `AGENTS.md`, which most AIs read as-is.
- **One profile per provider, as data:**
  - emit specs whose `outputPath` is the only path source;
  - a lexicon (paths, argument and env syntax, tool aliases);
  - capabilities with fallbacks;
  - frontmatter extensions;
  - aggregates;
  - limits with doc citations.
- **Shared primitives:** one emitter, serializers, and generic checks. `registerTarget()` is the only
  list of providers.

**First new target (2026-10-04): `agents-standard`** — Agent Skills in `.agents/skills/` plus a root
`AGENTS.md`, cited to the Agent Skills spec, agents.md, and the GitHub Copilot and Cursor docs that
read `.agents/skills/`. Adding it took its own folder (specs, lexicon, capabilities, citations as
data), one `registerTarget()` line, and moving two Copilot pieces to `src/targets/shared/` so both
targets use them (the skill body sections, the repo-wide rules document). Tests that had listed the
two tools by hand now derive from the registry. The wizard needed no change: its multi-tool flow
already existed. Still deferred to a target that needs them: TOML/JSON serializers, aggregate specs,
tool-name aliases, moving `claude:` into `frontmatterExtensions`.

**Built in Milestone 4:** the generic emitter (`src/targets/emit-files.ts`, the one writer, with
`outputPath` as the only path source) and the single provider registry (`registerTarget()`; every
cross-provider list, lexicon literal and foreign-literal forbid derives from the registered
targets). Both are enforced by tests (`emit-files.test.ts`, `provider-registry.test.ts`). Also
built: MCP config references environment
variables with a neutral `{sigil:env:NAME}` token that each target expands into its file's syntax
(`src/targets/env-reference.ts`); Claude Code documents `${NAME}` in `.mcp.json`, VS Code
documents `${env:NAME}`, and Copilot CLI's reading of `${NAME}` in the shared `.mcp.json` is not
documented yet.

**Built with the first new target:** TOML/JSON serializers, an aggregate spec, tool-name aliases, and
moving `claude:` into `frontmatterExtensions`. Until a consumer exists they would be guesses, and
moving `claude:` would change the generated JSON Schema. The cheapest proof of the profile design is
an `agents-standard` target (`.agents/skills` plus `AGENTS.md`), which covers most tools at once.

## Rejected

- **Collapse every language family into shared skills with stack files.** It would merge content
  that is 90% or more different, and lose path activation for rules and agents.
- **Split `cli`/`wizard` per language.** Their stack is chosen by the task, often Go or Rust, which
  have no namespace. That would multiply files and add empty languages.
- **Topic folders** (`catalog/cli/{skill,agent,rule}`). `packs.yaml` already groups; the tools
  (`new`, `move`, `import`) encode kind-first paths.
- **Hard layout errors in `validateCatalog`.** They would abort every consumer command, the wizard
  included, for a custom `--catalog-dir`.
- **Copilot prompt files as skills.** Copilot skills have no argument input, so `${input:}` prompts
  would lose their arguments. Prompt files stay while VS Code supports them.

## Copilot reference loading

VS Code documents that a skill's reference file "won't be loaded" unless `SKILL.md` references it,
and recommends Markdown links. The catalog's skills mention references as backtick paths. Whether
that counts is checked in VS Code (task V1). The result decides what the `catalog-layout` rule treats
as "mentioned" and whether skills switch to links.

_Result: pending_ (probe and instructions: `docs/audits/2026-10-03/`). Meanwhile the catalog follows
the documented recommendation: skills link each reference (`reference-links`, with a mechanical
`sync --apply` fix), and `catalog-layout` flags a reference `SKILL.md` never names. If V1 shows
backtick paths load too, `reference-links` can drop to a warning for imported skills.

## Appendix: provider baseline, re-verified 2026-10-03

Every cited provider doc (`src/targets/doc-refs.ts`) was fetched again. No key or value sigil emits
is rejected by any provider's docs, and the Claude plugins pass `claude plugin validate --strict`.
`COPILOT_CREATE_AGENTS_DOC` was reachable but not re-read, so its `verifiedOn` stays.

**Changed since the last verification:**

- VS Code now lists `.vscode/mcp.json` as deprecated in favour of the portable `.mcp.json`
  (`mcpServers`). Decided 2026-10-04 (F1): Copilot writes only the portable files, `.mcp.json`
  and `~/.copilot/mcp-config.json`, with no fallback; `sigil update` moves older installs.
- Copilot prompt files are deprecated for VS Code's Agent Host sessions (Local agent only "for
  now"); VS Code recommends migrating prompts to skills. Copilot skills still have no argument
  input, which is why sigil keeps prompt files.
- The Claude settings key reference moved to `settings-reference` (citation re-pointed).
- Claude skills now accept `paths`; sigil's Claude skill spec forbids it by policy (path scoping
  belongs to rules).
- The Agent Skills spec marks `allowed-tools` experimental, as a space-separated string. Decided
  2026-10-05 (F2): each target follows its own docs. Claude Code keeps the comma-separated list,
  which its docs accept ("a space- or comma-separated string, or a YAML list"). Copilot and the
  open-standard target write the spec's space-separated string, which GitHub's create-skills page
  shows. In both products the field pre-approves tools; it does not restrict them. Copilot's tool
  names (`shell`, `bash`) differ from Claude's (`Bash`), and sigil doesn't translate them, so on
  Copilot the field pre-approves only the names Copilot recognises.

**Still undocumented:** whether Copilot CLI expands `${NAME}` in `.mcp.json`; the Copilot lexicon's
`arguments` value (skills have no argument mechanism) has no explicit sentence in the cited doc.

**Documented but not mapped** (map only when the catalog needs one): Claude skill `model`,
`effort`, `disallowed-tools`, `shell`, `hooks`, `background`; Claude subagent `permissionMode`,
`memory`, `background`, `color`, `omitClaudeMd`; Copilot agent `user-invocable`,
`disable-model-invocation`, `target` (`infer` is retired); instructions `excludeAgent`;
plugin.json `displayName`, `keywords`, `license`, `dependencies`, `userConfig`.
