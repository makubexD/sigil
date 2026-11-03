# Plan: OpenCode target evaluation

There's no brief yet. The owner set the order on 2026-11-03 (Claude, then Copilot, then Antigravity, then OpenCode),
and OpenCode is next because it's free and already installed. This plan produces a decision, not code: a go/no-go ADR
in `docs/decisions/opencode-target-2026-11.md` and, on a go, a phased roadmap `docs/plan-opencode-target.md`. Every
step is `[inline]` because the work is research, reading sigil's code against what we find, probing OpenCode's own
loader, and a judgment call. A probe of model behavior has to run in OpenCode, never on the worker.

The model to follow is the [Antigravity evaluation](decisions/antigravity-target-2026-11.md) (its Kind table, D0–D8,
Reuse map, Neutrality table, Probe log, Decision). Every step follows
[Rules for every target](reference/architecture.md#rules-for-every-target): a neutral catalog, every difference
carried in the target layer, official docs only, and documented limits stored as data.

Starting facts (2026-11-03):

- `opencode` 1.19.4 is installed from npm (`opencode-ai`; 1.19.5 is the latest, published 2026-10-28).
- `~/.config/opencode/` holds the owner's own config from the retired worker setup (`opencode.jsonc`, `AGENTS.md`,
  `omniroute.env`). It is user-owned, so no step reads into it beyond listing it or writes to it.
- The [layout survey](decisions/catalog-layout-standard-2026-10.md) lists OpenCode among the tools that read
  `.agents/skills/` and a root `AGENTS.md`. That claim hasn't been checked against OpenCode's docs.
- Ban guardrail: never connect Anthropic or Claude in OpenCode, not even for a probe. Probes use a free OpenCode
  model only.

## Steps

### 1. Docs pass: sigil kind vs. OpenCode mechanism `[inline: research and judgment]`

Read the current OpenCode docs (opencode.ai/docs, and `packages/web/src/content/docs/` in `sst/opencode` at tag
`v1.19.5`). Check the docs against that tag's source wherever they disagree, and record anything they don't cover as
"undocumented". Draft the ADR's Kind table with one row for each sigil kind (`skill`, `agent`, `prompt`, `rule`,
`hook`, `mcp`, `settings`). Each row gets the project path (`.opencode/…`, `opencode.json[c]`), the user path
(`~/.config/opencode/…`), the format, and a docs link. Answer:

- D0. Install, update, scripted runs (`opencode run`), config precedence and merging (global, project, `OPENCODE_CONFIG`,
  `OPENCODE_CONFIG_DIR`), and how a probe gets its own isolated config dir without touching `~/.config/opencode/`.
- D1. Rules: `AGENTS.md` lookup (project, global, walking up the tree), the `CLAUDE.md` fallback and the setting that
  turns it off, and `instructions: [...]` globs. Is there anything like per-path rules (`appliesTo`), or is it
  repo-wide only?
- D2. Skills: the native skills folder, whether OpenCode also reads `.agents/skills/` and `.claude/skills/`, the
  frontmatter it accepts, and what happens when the same name sits in two folders. `.agents/skills/` is the folder
  `codex` and `agents-standard` share (`Target.sharesSkillFilesWith`).
- D3. Agents: `.opencode/agent/*.md` frontmatter (`mode` primary/subagent, `model`, `tools`, `permission`, and the
  rest). Map them to the neutral tool vocabulary (`read`, `search`, `edit`, `shell`, `web`, `agent`, `todo`) and
  ask whether `permission` can express a read-only agent exactly.
- D4. Commands: `.opencode/command/*.md` frontmatter and argument syntax (`$ARGUMENTS`, `$1`, and anything else),
  then compare with `src/targets/prompt-args.ts`.
- D5. Hooks: OpenCode has no declarative hooks. Its JS/TS plugins (`tool.execute.before` and similar) are the
  closest thing. Say whether a neutral `script:` hook can map onto a generated plugin file, which input fields it
  would get, and how it denies a call. If it can't, record `none`.
- D6. MCP: the `mcp` key in `opencode.json` (`type: local|remote`, `command` array, `environment`, `enabled`), the
  `{env:NAME}` syntax, and how this compares with `PORTABLE_MCP_DIALECT`.
- D7. Settings and permissions: which keys are user-owned config that sigil could merge, and is JSONC with comments
  something sigil can write without losing the user's comments?
- D8. Distribution: is there a plugin or package channel (npm plugins in `plugin: [...]`), a project scope or user only,
  and can it ship skills, agents or commands, or only code?

Test: `npx prettier --check docs/decisions/opencode-target-2026-11.md`. Every row has a docs link that resolves today.

### 2. Reuse map and neutrality table `[inline: architecture judgment]`

For each Kind table row, name the sigil piece it would reuse and note any gap, with `file:line` citations: the
`AGENTS.md` aggregate (Codex, Copilot `build-helpers.ts`), `McpDialect` and `EnvSyntax`, `ConfigKindTable`, the
`ToolDialect` and `restrictionOutcome` for agent tools, `HookInputDialect`, `KindEmitSpec` limits, and the existing
JSON merge (`renderConfig`), noting whether it handles `.jsonc`. Draft a capability row (`native`, `via` or `none`)
for each kind and channel.

Then build the **neutrality table**: every OpenCode difference from steps 1–2, each with the layer that absorbs it.
A row with no layer goes into the decision as a needed neutral concept, with what it costs. Also answer the
reuse-first question: if OpenCode reads `AGENTS.md` and `.agents/skills/`, how much of a target is already covered
by `agents-standard`, and is a small `opencode` target (agents, commands, MCP) worth more than a doc saying "use
agents-standard"?

Test: every citation points to a line that exists (`sed -n <line>p <file>`), then `npm run validate`. No row in the
neutrality table changes the catalog or schema without naming a new neutral concept for it.

### 3. Live probe in OpenCode `[inline: probes OpenCode's own loader and model behavior]`

Gate: a free OpenCode model answers `opencode run` from an isolated config dir (D0) in a throwaway repo under the
scratchpad. If no free model is available, these probes become docs-only, and the ADR says the live risk is still
open, as Cursor A did. Never use the owner's `~/.config/opencode/` and never use an Anthropic provider. Keep each
probe to one or two short runs. Record each probe's expected and observed result, plus the OpenCode version, in the
Probe log:

- P1. A root `AGENTS.md` instruction is followed. Then a `CLAUDE.md` alone, with no `AGENTS.md`: is it read
  (fallback), and does the D1 setting turn that off?
- P2. A skill only in `.agents/skills/`, a second only in the native folder from D2, and a third in `.claude/skills/`:
  which are listed, which get picked by description, and how many times a name in two folders shows up.
- P3. `.opencode/command/hello.md` runs as `/hello` with the argument substituted (D4).
- P4. A subagent with read-only `permission` (D3) is refused an edit.
- P5. If D5 found a plugin route: a generated plugin denies a write to `.env`, and the raw input field names get
  recorded.
- P6. A local MCP server in `opencode.json` with `{env:NAME}` starts and receives the value.
- P7. With no OpenCode config at all, what does OpenCode already pick up from what sigil writes for other targets
  (`AGENTS.md`, `.agents/skills/`, `.claude/`)? This decides how much a target would add.

Test: each probe's summary is in the ADR, with the OpenCode version and model id.

### 4. Decision `[inline: judgment]`

Write the go/no-go in the ADR. It covers demand (owner priority 4 of 4), the maintenance cost of each catalog change
(conformance plus live probes), how much P7 already delivers with no target, and the neutral concepts step 2 says
are needed. Correct or add the OpenCode column in `distribution-channels-2026-09.md` § 3 from steps 1 and 3, and add
or decline an OpenCode entry in § 6. Also check the layout survey claim in `catalog-layout-standard-2026-10.md`
against P2 and P7.

Test: `npm run validate`, then prettier on every decision file the step changed.

### 5. Close-out `[inline: depends on step 4]`

- **Go:** write the roadmap `docs/plan-opencode-target.md`. It lists phases, not steps: capability rows, conformance
  implications, which probes gate which phase, and any neutral concept from step 2 as its own phase ahead of the
  phases that need it. It links to Rules for every target instead of copying them. Add an `opencode-target.md` brief
  row to `docs/ideas/README.md` with status `planned`, but only if the repo's brief convention needs one.
- **No-go:** the ADR is the whole record. Document the free route (`agents-standard` plus `AGENTS.md`) in
  `docs/guides/consuming.md`, and only if P7 proved it.
- Either way, add a CHANGELOG `Unreleased` → `Documentation` line only if user-facing docs changed. Update the project
  memory, then run `npm run ci:local`, which must pass.

Test: `npm run ci:local`.
