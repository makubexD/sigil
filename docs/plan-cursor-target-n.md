# Plan: Phase N, a provider-neutral agent vocabulary

Roadmap: [plan-cursor-target.md](plan-cursor-target.md) § Phase N, Decision 7. Branch `feat/neutral-agent-vocabulary`,
one PR. Phase E (Cursor agents) builds on it.

## Goal

The catalog says _what an agent or skill needs_, in one vocabulary. Each target's emit layer turns that into what the
provider really reads, and leaves out what the provider can't use. Today the catalog writes Claude Code's tool names
(`Read`, `Grep`, `Bash`, …), and the schema's own comment already says the field is "vendor-neutral … adapters map
these". This phase makes that true for tools, tool policy, and model hints.

## Today (checked 2026-11-01)

- 39 agents: `tools: [Read, Grep, Glob]`. No `disallowedTools`.
- 41 skills: `allowedTools` over `Read` (41), `Bash` (39), `Write` (24), `Glob` (22), `Edit` (21), `Grep` (17).
- 3 agents use `claude:`: one `model: sonnet`, one `effort: medium`, one `maxTurns: 10`.
- Claude emits the names unchanged. Copilot agents get them unchanged; Copilot accepts them as compatible aliases. The
  shared skill mapping (`allowedToolsMapping` in `targets/shared/skill-sections.ts`) copies them unchanged to Copilot,
  agents-standard, Codex and Cursor skills. Claude names in a Cursor or Codex skill are a leak.
- Hook `matcher`s (`Edit|Write`, `Bash`) are Claude names too. Each hook target already translates them in its
  `hook-ops.ts`. **Out of scope here**, noted as a follow-up.

## Sources

- [Copilot custom agents configuration](https://docs.github.com/en/copilot/reference/custom-agents-configuration):
  tool aliases, case-insensitive. `execute` (`shell`, `Bash`, `powershell`), `read` (`Read`, `NotebookRead`), `edit`
  (`Edit`, `MultiEdit`, `Write`, `NotebookEdit`), `search` (`Grep`, `Glob`), `agent` (`custom-agent`, `Task`), `web`
  (`WebSearch`, `WebFetch`), `todo` (`TodoWrite`). `model`: "If unset, inherits the default model".
- [Copilot skills](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/customize-cloud-agent/add-skills):
  `allowed-tools` pre-approves tools ("If a tool is not listed … Copilot will prompt you"), with the example
  `allowed-tools: shell` and a warning to pre-approve `shell` only for trusted skills.
- [Claude Code skills](https://code.claude.com/docs/en/skills): `allowed-tools` "grants permission for the listed tools
  during the turn that invokes the skill … It does not restrict which tools are available … Deny and ask rules still
  override `allowed-tools`." Permission-rule patterns (`Bash(git *)`) are allowed.
- [Agent Skills spec](https://agentskills.io/specification): `allowed-tools` is "a space-separated string of tools that
  are pre-approved to run. Experimental. Support for this field may vary between agent implementations", with the
  example `Bash(git:*) Bash(jq:*) Read`.
- [Codex skills](https://developers.openai.com/codex/skills): `SKILL.md` needs `name` and `description`, and options go
  in `agents/openai.yaml`. There is no `allowed-tools`.
- [Cursor skills](https://cursor.com/docs/context/skills): the field table (`name`, `description`, `paths`,
  `disable-model-invocation`, `icon`, `color`, `metadata`) has no `allowed-tools`.
- [Cursor subagents](https://cursor.com/docs/context/subagents): no tool list, only `readonly` ("no file edits, no
  state-changing shell commands"). `model` is `inherit` (the default) or a model id.
- [Claude Code subagents](https://code.claude.com/docs/en/sub-agents) (`CLAUDE_AGENTS_DOC`): `tools` (allowlist),
  `disallowedTools` (denylist, applied first). The delegation tool is the `Agent` tool. `model` is an alias (`sonnet`,
  `opus`, `haiku`, `fable`), a full id, or `inherit`. `effort`.

## Per-target table (decided from the sources above)

| Field                   | Claude                                                                                                                      | Copilot                                                                       | agents-standard                             | Codex     | Cursor (Phase E)                      |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------- | --------- | ------------------------------------- |
| agent `tools`           | `read`→Read, `search`→Grep+Glob, `edit`→Edit+Write, `shell`→Bash, `web`→WebFetch+WebSearch, `agent`→Agent, `todo`→TodoWrite | `read`, `search`, `edit`, `execute`, `web`, `agent`, `todo` (primary aliases) | no agents                                   | no agents | `readonly: true` iff ⊆ {read, search} |
| agent `disallowedTools` | same names                                                                                                                  | not carried (inexact)                                                         | —                                           | —         | `readonly: true` iff ⊇ {edit, shell}  |
| skill `allowedTools`    | same names                                                                                                                  | `read`, `search`, `edit`, `shell`, `web` (the doc's own `shell`)              | Claude-style names (the spec's own example) | left out  | left out                              |
| `model` tier            | `fast`→haiku, `balanced`→sonnet, `deep`→opus                                                                                | left out (inherits)                                                           | —                                           | —         | left out (`inherit`)                  |
| `effort`                | as written                                                                                                                  | left out                                                                      | —                                           | —         | left out                              |

## Design

1. **Neutral tool names** (`src/tool-vocabulary.ts`, platform-neutral): `read`, `search`, `edit`, `shell`, `web`,
   `agent`, `todo`. This is Copilot's primary alias set, with `shell` in place of `execute`: `shell` is Copilot's
   own skill example, Cursor's tool name and Codex's word, and Copilot accepts it as an alias. `LEGACY_TOOL_ALIASES` maps each Claude name to its neutral
   name, using Copilot's table. `normalizeTools(list)` returns the neutral list, deduped in first-seen order, plus the
   legacy names it saw. The schema accepts neutral and legacy names. `sync --check` flags legacy names, and `--apply`
   rewrites them (`legacy-tool-name`).
2. **`ToolDialect` per target** (`src/targets/tool-dialect.ts`): data saying how a neutral list is written. It's either
   `{ kind: 'names', names: Record<NeutralTool, readonly string[] | undefined> }` (a list of provider names; an
   `undefined` entry means the provider has no such tool) or `{ kind: 'read-only-flag', readOnly: NeutralTool[] }`
   (Phase E, Cursor). `renderTools(dialect, neutral)` returns `{ exact: boolean, missing: NeutralTool[], ... }` and
   what to write. Specs serialize through it, so no spec ever copies a catalog tool name unchanged.
3. **`toolPolicy: strict | nearest`** on agents. The default is `strict`, so the safe choice applies when nothing is
   said. When a target's dialect can't express an agent's restriction exactly:
   - `strict`: the target skips the agent with a reason. `add` / the wizard skip it the way they skip a hook a target
     can't render, `build` leaves it out, and `tool-restriction-coverage` fails `sync --check` (as
     `config-target-render` does) until `platforms:` excludes the target.
   - `nearest`: the closest mapping is written and a warning is reported, at `--check` and on install.
   - `disallowedTools` a dialect can't carry is inexact in the same way. Today's hard refusal
     (`assertRestrictionsCarried`) becomes the strict path.
4. **Skills' `allowedTools` is a pre-approval, not a restriction.** Leaving it out only means more permission prompts,
   so a target that can't express it, or doesn't document the field, leaves it out. No policy is needed.
5. **Model hints:** neutral `model: fast | balanced | deep` and `effort: low | medium | high` on agents. Each target has
   a tier table. Claude: `fast` → `haiku`, `balanced` → `sonnet`, `deep` → `opus`, effort as written. Copilot, Cursor,
   Codex: no table yet, so the line is left out and the tool's default model applies. `claude.model` / `claude.effort`
   stay as Claude-only overrides that win on Claude, so the CLAUDE.md invariant is kept and extended.
6. **Family defaults** (`catalog/standard.yaml`): a family may declare `tools: { allow: [...], policy: strict }` for its
   agent members (and `allowedTools` for skill members). Consumer commands never read `standard.yaml`, so member
   files still carry their values: `family-skeleton` fails `--check` when a member's value differs from its family's,
   unless the family lists it under `toolExceptions: { <id>: <reason> }`. `--apply` writes the family value into a
   member that lacks it. The base sets the rule, and each artifact file shows exactly what ships.

## Decisions (chosen 2026-11-01, owner delegated the choice; each checked against the sources)

1. **Coarse neutral names are accepted, so a few skill pre-approvals widen.** Neutral `search` is Grep _and_ Glob, and
   `edit` is Edit _and_ Write. A skill that listed only `Grep` will also pre-approve `Glob` on Claude, and one with
   only `Edit` will also pre-approve `Write` (step 7 lists each one). That's acceptable because, per Claude's skills
   doc, `allowed-tools` grants only one turn and restricts nothing, and deny and ask rules still win. Grep and Glob
   are both read-only. Copilot's own table treats Edit and Write as one tool. Agent `tools`: all 39 carry
   `Read, Grep, Glob, Bash`, which render back exactly. Amended 2026-11-01 (step 7 found it): 5 also carry `Edit`
   without `Write` (the `*-debugger` agents), so on Claude they gain `Write`. Accepted: each already has `Bash`, which
   writes files, so no agent gains a capability. The 5 `*-refactor-specialist` agents already list both.
2. **`shell`, not `execute`** (Design 1).
3. **Family defaults are checked, not inherited** (Design 6). Inheriting at resolve time would mean consumer commands
   read `standard.yaml`, which today's invariant forbids. It would also make an artifact file stop saying what ships.
4. **Absent `toolPolicy` means `strict`** (fail closed). Every family in today's catalog is a read-only reviewer, so
   this changes no output.
5. **Model tiers map only where the provider has stable aliases.** Claude's are documented (`haiku` / `sonnet` /
   `opus`). `fable` gets no tier, because the docs give it no place in a cost/strength order. Copilot ids are vendor
   model names, and Cursor documents `inherit` as the default, so both leave the line out until a table is chosen as
   data.
6. **The agents-standard skill keeps Claude-style `allowed-tools` names**, the convention in the spec's own example.
   Codex and Cursor leave the field out: neither documents it, and leaving out a pre-approval only adds prompts.
7. **Scoped shell patterns are deferred.** Claude (`Bash(git *)`) and the spec (`Bash(git:*)`) allow them, and no
   catalog skill uses one. A later `shell(<pattern>)` neutral form can map to both.

## Regression guards (every step)

`npm test` green with no change to existing expectations outside the files a step names.
`test/fixtures/output-snapshot/build.json` changes only in steps 7, 8 and 9, and only as each step lists. Claude
agent output stays byte-identical throughout, except the 5 `*-debugger` agents gaining `Write` in step 7 (Decision 1).

## Step 1 `[inline: user-facing decision record]`: the vocabulary record

Write `docs/decisions/neutral-agent-vocabulary-2026-11.md` from this plan's Sources, Per-target table and Decisions,
quoting each doc, with the date read. Add each new source as a `DocRef` where a later step cites it. Steps 7-9 take
their tables from this record. `npm run format:check`.

## Step 2 `[worker:medium]`: `src/tool-vocabulary.ts`

Files: `src/tool-vocabulary.ts` (new), `test/tool-vocabulary.test.ts` (new).

`NEUTRAL_TOOLS = ['read', 'search', 'edit', 'shell', 'web', 'agent', 'todo'] as const` and `NeutralTool`.
`LEGACY_TOOL_ALIASES: Readonly<Record<string, NeutralTool>>` is Copilot's table: `Read`, `NotebookRead` → read;
`Grep`, `Glob` → search; `Edit`, `MultiEdit`, `Write`, `NotebookEdit` → edit; `Bash`, `execute`, `powershell` →
shell; `WebSearch`, `WebFetch` → web; `Task`, `Agent`, `custom-agent` → agent; `TodoWrite` → todo. Matching is
case-sensitive for legacy names and exact for neutral names. `normalizeTools(list: readonly string[]): { tools:
NeutralTool[]; legacy: string[]; unknown: string[] }` dedupes in first-seen order. Module comment: platform-neutral,
cite the Copilot doc.

| Input                               | Expected `tools`            | `legacy`                   | `unknown`        |
| ----------------------------------- | --------------------------- | -------------------------- | ---------------- |
| `['Read', 'Grep', 'Glob']`          | `['read', 'search']`        | `['Read', 'Grep', 'Glob']` | `[]`             |
| `['read', 'search']`                | `['read', 'search']`        | `[]`                       | `[]`             |
| `['Bash', 'Edit', 'Write', 'Read']` | `['shell', 'edit', 'read']` | all four                   | `[]`             |
| `['read', 'Read']`                  | `['read']`                  | `['Read']`                 | `[]`             |
| `['frobnicate']`                    | `[]`                        | `[]`                       | `['frobnicate']` |
| `['READ']`                          | `[]`                        | `[]`                       | `['READ']`       |

Test: `npm test -- test/tool-vocabulary.test.ts`.

## Step 3 `[worker:medium]`: schema

Files: `src/schema/index.ts`, `test/schema*.test.ts` (whichever holds AgentSchema/SkillSchema tests), generated
`schema/*.schema.json` via `npm run build`.

- `tools`, `disallowedTools` (agent) and `allowedTools` (skill): each item is a neutral name, a key of
  `LEGACY_TOOL_ALIASES`, or a provider-specific pattern (amended 2026-11-01: contains `(` or `/`, or starts with
  `mcp__`). Today's schema accepts patterns (`Bash(git log:*)`, `mcp__github__get_issue`) and
  `test/targets/tool-name-injection.test.ts` pins that, so only an unknown bare name is rejected. Keep `.min(1)` and
  the `ToolName` regex as a second check. Update the comments: neutral vocabulary, legacy names accepted for now,
  patterns passed as provider-specific, mapped per target.
- Agent: `toolPolicy: z.enum(['strict', 'nearest']).optional()` (absent = strict), `model: z.enum(['fast', 'balanced',
'deep']).optional()`, `effort: z.enum(['low', 'medium', 'high']).optional()`. `claude.model` / `claude.effort` stay.
  The comment says they override the neutral ones on Claude.

| Case                                             | Expected                 |
| ------------------------------------------------ | ------------------------ |
| agent `tools: [read, search]`                    | valid                    |
| agent `tools: [Read, Grep]` (legacy)             | valid                    |
| agent `tools: [frobnicate]`                      | invalid                  |
| agent `toolPolicy: nearest`, `toolPolicy: loose` | valid / invalid          |
| agent `model: balanced`, `model: sonnet`         | valid / invalid          |
| skill `allowedTools: [shell, Read]`              | valid                    |
| the whole catalog                                | `npm run validate` clean |

Test: `npm run build && npm test -- <schema test file>`, `npm run validate`.

## Step 4 `[worker:medium]`: `legacy-tool-name` conformance rule

Files: `src/commands/sync/conformance/rules/legacy-tool-name.ts` (new), `test/commands/legacy-tool-name.test.ts`
(new). The tests call the rule's `detect` / `fix` directly.

Class `mechanical`, severity `error`. One finding per artifact whose `tools`, `disallowedTools` or `allowedTools` holds
a legacy name; the detail lists the names and their neutral replacements. `fix()` rewrites each field to
`normalizeTools(...).tools`, keeping the other frontmatter byte-identical (follow an existing mechanical rule's fix).

| Case                                     | Expected                                        |
| ---------------------------------------- | ----------------------------------------------- |
| agent `tools: [Read, Grep, Glob]`        | one finding; fix writes `tools: [read, search]` |
| skill `allowedTools: [Bash, Read, Grep]` | one finding; fix writes `[shell, read, search]` |
| agent `tools: [read, search]`            | no finding                                      |
| artifact with no tool fields             | no finding                                      |

Do **not** run `--apply` on the catalog here. Write the rule and its tests, but leave it out of `registry.ts` until
step 14, which registers it and migrates the catalog in one commit. That way `sync --check` stays green at every
step.

Test: `npm test -- test/commands/legacy-tool-name.test.ts`.

## Step 5 `[worker:medium]`: `ToolDialect` and `renderTools`

Files: `src/targets/tool-dialect.ts` (new), `src/targets/spec-types.ts`, `test/targets/tool-dialect.test.ts` (new).

`ToolDialect` as Design 2. `renderTools(dialect, authored: readonly string[])` normalizes first, then:

- `names`: returns `{ names: string[] (deduped, neutral order then dialect order), exact: missing.length === 0,
missing }`.
- `read-only-flag`: returns `{ readOnly: true, exact: true }` when every tool is in `readOnly`, else `{ readOnly:
false, exact: false, missing: <the others> }`.

**Patterns (settled 2026-11-01):** a provider-specific pattern (step 3) lands in `normalizeTools(...).unknown`. A
`names` dialect passes it through verbatim, after the mapped names and in authored order, and it doesn't affect
`exact`. That's today's behavior, and `test/targets/tool-name-injection.test.ts` pins it. A `read-only-flag` dialect
counts it as missing (inexact). Mapped names follow the neutral tools' first-seen order, then the dialect's order
within each one.

Add `readonly toolDialect?: ToolDialect` to `KindEmitSpec` (documented: required on any agent spec, and on a skill
spec that maps `allowedTools`).

| Case                                                                 | Expected                                     |
| -------------------------------------------------------------------- | -------------------------------------------- |
| names dialect {read: [Read], search: [Grep, Glob]}, `[read, search]` | names `[Read, Grep, Glob]`, exact            |
| same dialect, legacy `[Read, Grep, Glob]`                            | same result                                  |
| same dialect, `[read, shell]`                                        | names `[Read]`, not exact, missing `[shell]` |
| read-only-flag {readOnly: [read, search]}, `[read, search]`          | readOnly true, exact                         |
| read-only-flag, `[read, edit]`                                       | readOnly false, not exact, missing `[edit]`  |

Test: `npm test -- test/targets/tool-dialect.test.ts`.

## Step 6 `[worker:medium]`: tool policy at render time

Files: `src/targets/tool-restriction.ts`, `src/targets/emit.ts`, `test/commands/tool-restriction.test.ts`.

Replace `droppedRestrictions` / `assertRestrictionsCarried` with `restrictionOutcome(spec, frontmatter): { kind:
'exact' } | { kind: 'nearest'; warning: string } | { kind: 'skip'; reason: string }`. `tools` / `disallowedTools`
is inexact when the spec has no mapping for it (today's `droppedRestrictions`), or when the spec has a `toolDialect`
and `renderTools` is not exact. Transition (amended 2026-11-01): no spec has a dialect until steps 7-8, so a mapped
field on a spec with no dialect counts as exact here, as it does today. Step 8 removes that fallback. Inexact plus `toolPolicy` `nearest` gives
`nearest`; otherwise `skip`, with the reason naming the missing tools and the target's limitation. `renderArtifact`
throws a `SigilError` on `skip` (callers check first; see step 10), keeping today's message and hint. Export
`toolSkipReason(spec, artifact)` for selection.

| Case                                                       | Expected                       |
| ---------------------------------------------------------- | ------------------------------ |
| Claude-like names dialect, `tools: [read, search]`         | exact                          |
| dialect without `shell`, `tools: [read, shell]`, no policy | skip, reason names `shell`     |
| same, `toolPolicy: nearest`                                | nearest, warning names `shell` |
| spec with no `tools` mapping, `tools` set                  | skip                           |
| spec mapping `tools` with no `toolDialect` (transition)    | exact                          |
| existing cases in the file (Copilot `disallowedTools`, …)  | same pass/fail as today        |

Test: `npm test -- test/commands/tool-restriction.test.ts`.

## Step 7 `[worker:medium]`: Claude tool dialect

Files: `src/targets/claude-code/tool-dialect.ts` (new), `src/targets/claude-code/spec/agent.ts`,
`src/targets/claude-code/spec/skill.ts`.

`CLAUDE_TOOL_DIALECT` from the step 1 record (`read` → `Read`, `search` → `Grep`, `Glob`, `edit` → `Edit`, `Write`,
`shell` → `Bash`, `web` → `WebFetch`, `WebSearch`, `agent` → `Agent`, `todo` → `TodoWrite`). The agent
`tools` / `disallowedTools` and skill `allowed-tools` mappings serialize `renderTools(...).names` in today's YAML form,
and both specs set `toolDialect`. Tests in `test/targets/claude-code.test.ts`:

| Case                                     | Expected                                                          |
| ---------------------------------------- | ----------------------------------------------------------------- |
| every catalog agent (still legacy names) | output byte-identical to before this step                         |
| agent `tools: [read, search]`            | `tools:` lists `Read`, `Grep`, `Glob`                             |
| skill `allowedTools: [shell, read]`      | `allowed-tools:` lists `Bash`, `Read`                             |
| catalog skills                           | identical except the widenings listed in the summary (Decision 1) |

Update the output snapshot. Test: `npm test -- test/targets/claude-code.test.ts test/targets/output-snapshot.test.ts`.

## Step 8 `[worker:medium]`: Copilot tool dialect

Files: `src/targets/copilot/tool-dialect.ts` (new), `src/targets/copilot/spec/agent.ts`,
`src/targets/copilot/spec/skill.ts`.

`COPILOT_TOOL_DIALECT` has two name sets: agent `tools` uses the primary aliases (`shell` → `execute`), skill
`allowed-tools` uses `read`, `search`, `edit`, `shell`, `web`, as in the skills doc. Every agent spec now has a
dialect, so remove step 6's transition fallback in `src/targets/tool-restriction.ts`: a mapped field on an agent spec
with no `toolDialect` is now inexact (update the step 6 test row to `skip`). Tests in `test/targets/copilot.test.ts`:

| Case                                 | Expected                                                                                                          |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| every catalog agent                  | `tools: ["read","search","execute"]`, plus `"edit"` on the 10 that list Edit (amended 2026-11-01: all carry Bash) |
| agent `tools: [Read, Bash]` (legacy) | `tools: ["read","execute"]`                                                                                       |
| skill allowed-tools                  | as the step 1 record says                                                                                         |

Update the output snapshot. Test: `npm test -- test/targets/copilot.test.ts test/targets/output-snapshot.test.ts`.

## Step 9 `[worker:medium]`: open-standard skill `allowed-tools`

Files: `src/targets/shared/skill-sections.ts`, plus the dialect constants the step 1 record names for agents-standard,
Codex and Cursor (in each `targets/<name>/tool-dialect.ts`, one file each).

`allowedToolsMapping` serializes through the spec's `toolDialect`. A spec with no dialect leaves the line out (Design
4). Tests in `test/targets/agents-standard.test.ts`, `codex.test.ts`, `cursor.test.ts`: a skill with `allowedTools:
[Bash, Read]` emits exactly what the record says per target (or no line). No Claude tool name appears in a Codex or
Cursor skill. Update the output snapshot.

Test: `npm test -- test/targets/agents-standard.test.ts test/targets/codex.test.ts test/targets/cursor.test.ts
test/targets/output-snapshot.test.ts`.

## Step 10 `[worker:medium]`: strict agents are skipped, not thrown, on install and build

Files: `src/commands/add/plan-ids.ts`, `src/wizard/steps/add/plan-preview.ts`, `src/targets/emit-files.ts` (or the
`compile` loop it serves).

Selection's `skipReason` becomes `a => target.configSkipReason?.(a) ?? wholeFileSkipReason(target, a)`, a helper next
to `toolSkipReason` that finds the target's spec for the kind. `compile` skips an artifact with a skip reason. A
`nearest` render reports its warning through the command's existing warning channel. Tests (fake target with a dialect
lacking `shell`, in `test/commands/tool-restriction.test.ts`):

| Case                                          | Expected                                         |
| --------------------------------------------- | ------------------------------------------------ |
| `add` of a strict agent with `shell`          | skipped, reason printed, nothing written, exit 0 |
| `add` of a nearest agent with `shell`         | written, warning printed                         |
| `compile` of a catalog holding the strict one | no file for it                                   |

Test: `npm test -- test/commands/tool-restriction.test.ts`.

## Step 11 `[worker:medium]`: `tool-restriction-coverage` reads the outcome

Files: `src/commands/sync/conformance/rules/tool-restriction-coverage.ts`, `test/commands/tool-restriction.test.ts`.

For each agent and each target it ships to: `skip` → error finding (detail: the reason, then "set platforms: to exclude
<target>, or toolPolicy: nearest"), `nearest` → warning finding, `exact` → none.

| Case                                                   | Expected    |
| ------------------------------------------------------ | ----------- |
| strict agent with `shell`, shipping to the fake target | one error   |
| same with `platforms:` excluding it                    | none        |
| nearest agent with `shell`                             | one warning |
| current catalog                                        | none        |

Test: `npm test -- test/commands/tool-restriction.test.ts`.

## Step 12 `[worker:medium]`: Claude model and effort hints

Files: `src/targets/claude-code/spec/agent.ts`, `test/targets/claude-code.test.ts`.

A `model` mapping from neutral `model` through `{fast: haiku, balanced: sonnet, deep: opus}`, emitted only when
`claude.model` is absent. The same for `effort`. The existing `claudeHintMapping`s stay and win.

| Case                                     | Expected                |
| ---------------------------------------- | ----------------------- |
| `model: balanced`                        | `model: sonnet`         |
| `model: fast`, `claude: { model: opus }` | `model: opus` only      |
| `effort: high`                           | `effort: high`          |
| no hints                                 | no `model:` / `effort:` |
| Copilot render of `model: balanced`      | no `model:` line        |

Test: `npm test -- test/targets/claude-code.test.ts test/targets/copilot.test.ts`.

## Step 13 `[worker:medium]`: family tool defaults

Files: `src/catalog-standard.ts`, `src/commands/sync/conformance/rules/family-skeleton.ts`,
`test/commands/family-skeleton.test.ts` (or the file holding that rule's tests).

Family schema: optional `tools: { allow: NeutralTool[]; policy?: 'strict' | 'nearest' }` (agent families),
`allowedTools: NeutralTool[]` (skill families), `toolExceptions: Record<id, reason>`. `family-skeleton` reports a member
whose normalized `tools` / `toolPolicy` (absent = strict) or `allowedTools` differs, unless the member is listed in
`toolExceptions`. Its fix writes the family's value when the member has none. Update the comment block in
`catalog/standard.yaml` (the format, no data yet).

| Case                                                              | Expected                             |
| ----------------------------------------------------------------- | ------------------------------------ |
| family `tools.allow: [read, search]`, member `[Read, Grep, Glob]` | no finding (normalized equal)        |
| member `[read]`                                                   | one finding                          |
| same member listed in `toolExceptions`                            | no finding                           |
| member with no `tools`                                            | finding; fix writes `[read, search]` |
| family with no `tools`                                            | no check                             |

Test: `npm test -- test/commands/family-skeleton.test.ts`.

Amended 2026-11-01: `family-skeleton` is `editorial`, and `--apply` runs `fix()` only for `mechanical` rules
(`fix-mechanical.ts`). So the check is a new mechanical rule, `family-tools`
(`src/commands/sync/conformance/rules/family-tools.ts`, registered in `registry.ts`; with no family data yet it reports
nothing), tested in `test/commands/family-tools.test.ts`. Sent in two parts: 13a the `standard.yaml` schema and comment,
13b the rule, registry and tests.

## Step 14 `[worker:medium]`: migrate the catalog

Files: `catalog/standard.yaml`, then every file `sigil sync --apply` rewrites, and the one agent with
`claude.model: sonnet` / the one with `claude.effort: medium`.

Register `legacy-tool-name` in `src/commands/sync/conformance/registry.ts`. Every agent family gets
`tools: { allow: [read, search], policy: strict }`. Run `node dist-cli/cli.js sync --apply`
(after `npm run build`); it rewrites the 39 agents and 41 skills to neutral names. Replace `claude.model: sonnet` with
`model: balanced`, and `claude.effort: medium` with `effort: medium` (dropping an emptied `claude:` block). No other
edits.

Checks: `node dist-cli/cli.js sync --check` clean, `npm run validate` clean, `git grep -nE "^\s+- (Read|Grep|Glob|Bash|Edit|Write)$"
catalog` empty, `test/fixtures/output-snapshot/build.json` unchanged by this step (the rendering already matched in
steps 7-9).

Test: `npm test`.

Amended 2026-11-01: `[read, search]` contradicts Decision 1 (every agent carries `Bash`), so each agent family gets the
normalized set its members carry today, which `--apply` leaves unchanged: `debugger` and `refactor-specialist`
`[read, search, edit, shell]`, every other agent family `[read, search, shell]`, all `policy: strict`. Skill families get
no `allowedTools` here (`document` is not uniform). `shared/code-reviewer` keeps `claude.maxTurns`, so its `claude:`
block stays.

## Step 15 `[inline: user-facing copy]`: docs and invariants

`CLAUDE.md` (a new invariant: catalog tool names and model hints are neutral, mapped only through a target's
`ToolDialect` / tier table, never copied unchanged; extend the `claude:` invariant with "overrides the neutral
hint"), `docs/reference/spec.md` (the agent and skill field tables, a per-target mapping table),
`docs/guides/authoring.md` (how to write `tools`, `toolPolicy`, `model`), `docs/reference/troubleshooting.md` (the
skip reason and the legacy-name finding), `CHANGELOG.md` (Unreleased: the vocabulary, the legacy aliases, the Copilot
`tools` change, the Claude skill widenings), and the roadmap's Phase N marked done. Note hook matchers as the follow-up.
`npm run format:check`, then `npm run ci:local`.
