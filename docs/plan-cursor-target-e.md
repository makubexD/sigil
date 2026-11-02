# Plan: Cursor target, Phase E (agents in `.cursor/agents/`)

Roadmap: [plan-cursor-target.md](plan-cursor-target.md) § Phase E, Decisions 5 and 6. Probe results:
[cursor-target-2026-11.md](decisions/cursor-target-2026-11.md) (A7, § Agents: `readonly` is tighter than assumed).
Vocabulary: [neutral-agent-vocabulary-2026-11.md](decisions/neutral-agent-vocabulary-2026-11.md) (per-target table,
Cursor column). Branch `feat/cursor-agents`, one PR.

## Sources (re-read 2026-11-01)

- [Cursor subagents](https://cursor.com/docs/context/subagents) (`CURSOR_SUBAGENTS_DOC`): `.cursor/agents/*.md`, fields
  `name`, `description`, `model` (default `inherit`), `readonly` ("restricted write permissions (no file edits, no
  state-changing shell commands)"), `is_background`. No tool list. `.cursor/` wins over `.claude/` and `.codex/` on a
  name clash.
- A7: a `readonly: true` subagent runs in Ask mode. Write and both shell calls tried (`touch`, `ls -la`) failed; Glob
  worked. So `readonly` is `read` + `search` and nothing else, tighter than the docs' wording.

## What the roadmap got wrong

The roadmap (Summary finding 3, Phase E) says all 39 catalog agents are `tools: [Read, Grep, Glob]` and that "every
catalog agent renders with `readonly: true`". They never were: before Phase N every one also had `Bash`. Today:

| Tools                         | Agents | Families                              |
| ----------------------------- | ------ | ------------------------------------- |
| `[read, search, shell]`       | 29     | reviewers, auditors                   |
| `[read, search, edit, shell]` | 10     | `*-debugger`, `*-refactor-specialist` |

All 39 are `strict` (11 agent families in `catalog/standard.yaml`, each `policy: strict`). Cursor's dialect can express
only `⊆ {read, search}`, so as the roadmap specified it, Phase E would skip every agent.

## Decisions (owner, 2026-11-01)

1. **Reviewers ship narrowed.** The 29 `[read, search, shell]` agents get `readonly: true` on Cursor and lose `shell`
   (no `git diff`, no test runs), with a warning. Narrowing never grants a tool the author didn't list.
2. **Edit agents ship widened.** The 10 `[read, search, edit, shell]` agents get no `readonly` line, so Cursor gives
   them every tool (`web`, `agent`, `todo` added), with a warning. They already have `shell`.
3. **So every agent family becomes `toolPolicy: nearest`.** Claude and Copilot express all 39 lists exactly, so their
   output doesn't change; `nearest` only matters on an inexact target, which today is only Cursor.
4. **The `read-only-flag` nearest rule is data on the dialect**: a new `writes` list (Cursor: `[edit]`). The nearest
   flag is `readonly: true` unless an authored tool is in `writes`. `exact` is unchanged (every tool in `readOnly`), so a
   `strict` agent with `shell` is still skipped. A provider pattern (`mcp__…`) counts as not-a-write: it narrows.
5. **`model` and `effort` are left out**: Cursor's default is `inherit`, and the vocabulary record (Decision 5 there)
   keeps model ids out until a tier table is chosen as data. `is_background` is not mapped: no catalog field asks for
   it.
6. **`disallowedTools` is not carried on Cursor.** No catalog agent uses it. Unmapped, `restrictionOutcome` skips a
   `strict` agent that sets it and warns on a `nearest` one, which is fail-closed enough until one exists. The record's
   table row ("`readonly: true` iff ⊇ {edit, shell}") is corrected to say so.
7. **Cursor reads `.claude/agents/` too**, so the target gets an `alsoLoads` row for `agent` from `claude` with
   `readerWins: true` (the docs' name-clash rule). Step 7 checks it live, as A3 did for skills.

## Regression guards (every step)

`npm test` green with no change to existing expectations outside the files a step names. In particular:
`test/commands/tool-restriction.test.ts`,
`test/targets/tool-dialect.test.ts` (step 1 only),
`test/targets/cursor.test.ts` (step 4 only), and `test/fixtures/output-snapshot/build.json`: Claude and Copilot agent
files byte-identical in every step; the snapshot changes only in step 4, for the Cursor files.

## Step 1 `[worker:medium]`: `read-only-flag` gets a nearest rule

Files: `src/targets/tool-dialect.ts`, `test/targets/tool-dialect.test.ts`.

- `ToolDialect`'s `read-only-flag` variant gains `readonly writes: readonly NeutralTool[]`, documented as "the tools
  whose presence means the nearest mapping is no flag at all".
- `renderReadOnlyFlag`: `missing` and `exact` unchanged. `readOnly` becomes
  `!tools.some(tool => writesSet.has(tool))` (unknown patterns never count as writes). Update the `RenderedTools`
  comment and the module comment to say `readOnly` is the nearest choice and `exact` says whether it is exact.
- The test file's `READ_ONLY` dialect gets `writes: ['edit']`.

| Case (dialect `readOnly: [read, search]`, `writes: [edit]`) | Expected                                           |
| ----------------------------------------------------------- | -------------------------------------------------- |
| `[read, search]`                                            | `readOnly: true`, `exact: true`, `missing: []`     |
| `[Read, Grep, Glob]` (legacy)                               | Same as above                                      |
| `[read, search, shell]`                                     | `readOnly: true`, `exact: false`, `[shell]`        |
| `[read, web]`                                               | `readOnly: true`, `exact: false`, `[web]`          |
| `[read, search, edit, shell]`                               | `readOnly: false`, `exact: false`, `[edit, shell]` |
| `[edit]`                                                    | `readOnly: false`, `exact: false`, `[edit]`        |
| `[read, mcp__github__get_issue]`                            | `readOnly: true`, `exact: false`, the pattern      |

The existing case "is inexact and not read-only when a tool is not read-only" changes to the `edit` row; every `names`
case is unchanged.

Test: `npm test -- test/targets/tool-dialect.test.ts`, then `npm test`.

## Step 2 `[worker:medium]`: every agent family becomes `nearest`

Files: `catalog/standard.yaml` (the 11 `policy: strict` lines under agent families), and the 39 `*.agent.md` files that
`sync --apply` fills.

- Change each agent family's `tools.policy` from `strict` to `nearest`. Above the first agent family, one comment line:
  `# nearest: Cursor narrows a read-only list to readonly: true (docs/plan-cursor-target-e.md Decision 3).`
- `npm run build`, then `node dist-cli/cli.js sync --apply`: `family-tools` writes `toolPolicy: nearest` into every
  member that has none. `git diff --stat` must show only `standard.yaml` and agent files, each agent file one added line.
  If `--apply` touches anything else, revert that file and report it.

| Case                                                  | Expected                                     |
| ----------------------------------------------------- | -------------------------------------------- |
| `grep -L 'toolPolicy: nearest'` over every agent file | No output                                    |
| `node dist-cli/cli.js sync --check`                   | Exit 0                                       |
| `npm run catalog:build`, then `git status dist/`      | `dist/claude/` and `dist/copilot/` unchanged |

Test: `npm test`, `node dist-cli/cli.js sync --check`.

## Step 3 `[worker:medium]`: the Cursor agent spec, unregistered

Files: new `src/targets/cursor/tool-dialect.ts`, new `src/targets/cursor/spec/agent.ts`, new
`test/targets/cursor-agent.test.ts`.

- `tool-dialect.ts`: `CURSOR_AGENT_TOOL_DIALECT: ToolDialect = { kind: 'read-only-flag', readOnly: ['read', 'search'],
writes: ['edit'] }`, with a module comment citing `CURSOR_SUBAGENTS_DOC` and A7 (why `shell` is not read-only), and
  Decisions 1, 2 and 4 of this plan.
- `spec/agent.ts`: `CURSOR_AGENT_SPEC`, modelled on `copilot/spec/agent.ts`. `outputPath` `.cursor/agents/<name>.md`,
  `pathPattern` `/\.cursor\/agents\/[^/]+\.md$/`. Frontmatter: `name` (required), `description` (required,
  `yamlScalar`), and `readonly` from `tools` (`required: false`, `when` the list is non-empty, serialize
  `readonly: true` when `renderTools(...).readOnly`, otherwise `''` so the line is dropped). `toolDialect:
CURSOR_AGENT_TOOL_DIALECT`. Body: `# <title>` plus `renderBoundarySection`, as Copilot does. `lexicon:
CURSOR_LEXICON`, `bodyForbids: [UNTRANSLATED_TOKEN_FORBID]`, `docs: [CURSOR_SUBAGENTS_DOC]`. No `model`, no
  `disallowedTools` mapping (Decisions 5, 6). The module comment states both.
- Not added to `spec/index.ts` yet: `compile()` emits every artifact with a scaffold spec, and the capability is still
  `none`.

The test renders through `renderArtifact(CURSOR_AGENT_SPEC, …)` and `restrictionOutcome`, on a resolved real catalog and
on in-memory agents:

| Case                                           | Expected                                                                                           |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `shared/code-reviewer` (catalog, `nearest`)    | Path `.cursor/agents/code-reviewer.md`; `readonly: true`; outcome `nearest`, warning names `shell` |
| `python/py-debugger` (catalog, `nearest`)      | No `readonly` line; outcome `nearest`, warning names `edit, shell`                                 |
| In-memory `[read, search]`, no policy          | `readonly: true`; outcome `exact`                                                                  |
| In-memory `[read, search, shell]`, no policy   | Outcome `skip`, reason names `shell`; `renderArtifact` throws                                      |
| In-memory no `tools`                           | No `readonly` line; outcome `exact`                                                                |
| In-memory `disallowedTools: [edit]`, no policy | Outcome `skip`, reason names `disallowedTools`                                                     |
| Every catalog agent                            | Renders; frontmatter keys ⊆ `{name, description, readonly}`; no `model`, `tools` or `claude` key   |
| Every catalog agent with no `edit` in `tools`  | `readonly: true`                                                                                   |
| Rendered frontmatter                           | Parses back through `src/frontmatter-parse.ts`; `description` matches the source                   |

Test: `npm test -- test/targets/cursor-agent.test.ts`, then `npm test`.

## Step 4 `[worker:medium]`: register agents on Cursor

Files: `src/targets/cursor/{spec/index,capabilities,index,doc-refs}.ts`, `test/targets/cursor.test.ts`; regenerated
`docs/reference/capabilities.md` and `test/fixtures/output-snapshot/build.json`.

- `spec/index.ts`: add `CURSOR_AGENT_SPEC`.
- `capabilities.ts`: `agent: { mode: 'native' }`; module comment drops "Subagents … are not built yet".
- `index.ts`: an `alsoLoads` row `{ kind: 'agent', targets: ['claude'], doc: CURSOR_SUBAGENTS_DOC, readerWins: true }`
  with a comment citing the docs' name-clash rule (Decision 7). `afterInstallHint` names `.cursor/agents/`. Module and
  `compile()` comments name agents.
- `doc-refs.ts`: `CURSOR_SUBAGENTS_DOC.covers` also says `.cursor/agents/*.md` and the `.claude/agents/` clash rule.
- `cursor.test.ts`: the "should skip an agent and a prompt" case keeps only `prompt`; add "should write an agent".
- `npm run build`; commit the regenerated files.

| Case                                                | Expected                                                                                 |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `build --target cursor` file list                   | 39 new `.cursor/agents/*.md`, nothing else changed                                       |
| `supportsKind(cursor, 'agent')`, `installableKinds` | Include `agent`                                                                          |
| `test/targets/capabilities.test.ts`                 | Passes with the regenerated table                                                        |
| `node dist-cli/cli.js sync --check`                 | Exit 0 (`provider-kind-coverage`, `tool-restriction-coverage`, `declared-but-unemitted`) |
| Output snapshot                                     | Only Cursor entries added; Claude and Copilot unchanged                                  |

Test: `npm test`, `npm run build && git diff --exit-code docs/reference/capabilities.md`,
`node dist-cli/cli.js sync --check`.

## Step 5 `[worker:medium]`: end-to-end install, status, update, uninstall

Files: `test/targets/cursor-agent.test.ts` (a new `describe` block), using the temp-project helpers
`cursor-hooks.test.ts` uses.

| Case                                                                  | Expected                                                                                                        |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `add --target cursor shared/code-reviewer`                            | Writes `.cursor/agents/code-reviewer.md` with `readonly: true`; stderr has the nearest warning                  |
| `add --target cursor python/py-debugger`                              | File has no `readonly` line; warning names `edit`                                                               |
| `add --target cursor` of a skill whose `uses.agents` names a reviewer | The agent is co-installed; the skill's Boundary names it                                                        |
| `status` after `add`                                                  | Agent `installed`, not `outdated`                                                                               |
| `add` again                                                           | No change, no conflict                                                                                          |
| `update` after the agent's description changes in the catalog         | File rewritten, still `readonly: true`                                                                          |
| `uninstall` of the agent                                              | File removed                                                                                                    |
| `claude` and `cursor` both install `shared/code-reviewer`             | `.claude/agents/` and `.cursor/agents/` each hold it; `status` shows the overlap note saying Cursor's copy wins |

Test: `npm test -- test/targets/cursor-agent.test.ts`, then `npm test`.

## Step 6 `[inline: user-facing copy]`: docs

- `docs/setup/cursor.md`: an `## Agents` section replacing the "until a later phase" bullet: the file, `readonly`, what
  A7 found it blocks, the two warnings (reviewers lose shell, edit agents gain everything), and the `.claude/agents/`
  clash.
- `docs/decisions/neutral-agent-vocabulary-2026-11.md`: the Cursor column (nearest rule, `disallowedTools` not carried),
  and Decision 4's "Every agent family today is a read-only reviewer" corrected.
- `docs/plan-cursor-target.md`: Summary finding 3 and § Phase E corrected per "What the roadmap got wrong"; Decision 5
  gets the owner's 2026-11-01 nearest choices.
- `docs/decisions/cursor-target-2026-11.md` § 3 / § 6 rows for agents. `CHANGELOG.md` (Unreleased).
- `CLAUDE.md`'s tool-restriction invariant: one clause, "a `read-only-flag` dialect's nearest mapping narrows unless the
  list holds one of its `writes`".

Test: `npm run ci:local`.

## Step 7 `[inline: live check measures Cursor]`: a sigil-installed agent runs read-only

In a throwaway repo: `sigil add --target cursor shared/code-reviewer python/py-debugger`, plus `sigil add --target claude
shared/code-reviewer` for the clash. On a free Cursor model, `agent -p --trust`:

1. "Use the code-reviewer subagent to list the files here and create notes.txt." Expect the `Task` call names
   `code-reviewer`, the listing works (Glob), and the write is refused in Ask mode.
2. "Which code-reviewer subagent definition did you load?" with the two copies' bodies differing by one marker line.
   Expect the `.cursor/` copy (Decision 7). If it is the `.claude/` one or both, flip `readerWins` and say so in the ADR.

Record both runs in the ADR probe log and close § Agents.

Test: run 1's refusal and run 2's marker in the stream-json; `npx prettier --check
docs/decisions/cursor-target-2026-11.md`.
