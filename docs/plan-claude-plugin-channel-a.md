# Plan: plugin-agent field guard (Phase A of `plan-claude-plugin-channel.md`)

Branch: `fix/plugin-agent-field-guard`, which already holds the roadmap commit. One PR.

## What was checked (2026-10-30)

- **The restriction holds.** `plugins/components` § "Frontmatter fields in plugin agents" lists `permissionMode`, `hooks`,
  `mcpServers` and `initialPrompt` as ignored. `sub-agents` agrees on the first three. The ADR named three; the fourth is
  new.
- **Nothing is broken today.** The 44 published plugin agents carry only `name`, `description`, `tools` and `skills`.
  Emission is allowlist-based, so a field reaches a file only if a `FieldMapping` emits it. The guard stops a future
  mapping from shipping a field plugins silently drop, such as a read-only `permissionMode` that does nothing there.
- **`skills:` is fine as it is.** The spec comment says a plugin agent can't preload a skill by its bare name. Probed
  with Claude Code 2.1.314: `cli-builder:cli-auditor`, with `skills: - cli` as published, received the full skill body,
  the same as a copy using `cli-builder:cli`. The comment is out of date, so step 2 corrects it.

## Design

Use the existing `variant` mechanism, as `spec/skill.ts` does. `checkOutputContract` runs on every `build`, so a
forbidden key fails the build.

- `CLAUDE_AGENT_SPEC` keeps its name, gains `variant: 'scaffold'`, and its `pathPattern` narrows to `.claude/agents/`.
  Keeping the name means no test import changes.
- A new `CLAUDE_PLUGIN_AGENT_SPEC` spreads it, with `variant: 'plugin'`, a `plugins/<pack>/agents/` pattern, and the
  four keys added to `forbiddenKeys`. It also cites `CLAUDE_PLUGIN_COMPONENTS_DOC`.
- The scaffold spec does not forbid them: `.claude/agents/` files honour all four.

## Steps

### Step 1 `[worker:medium]`: RED tests

File: `test/targets/output-contract.test.ts` only. Add a `describe('Claude plugin agent field guard')` block.

Use `new ClaudeCodeTarget().outputContracts`, and this helper for the file content:
``const agentFile = (key = '') => `---\nname: a\ndescription: d\n${key}---\n\nBody.\n`;``

| #   | Case                         | Input                                                                                                         | Expected                                                          | Before step 2 |
| --- | ---------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------- |
| 1-4 | each ignored key is refused  | `plugins/p/agents/a.md`, one case per `permissionMode`, `hooks`, `mcpServers`, `initialPrompt` (`<key>: x\n`) | one violation, `label` `agent (plugin)`, `problem` naming the key | fails         |
| 5   | scaffold agents keep them    | `.claude/agents/a.md` with `permissionMode: plan\n`                                                           | no violations                                                     | passes        |
| 6   | a clean plugin agent passes  | `plugins/p/agents/a.md`, `agentFile()`                                                                        | no violations                                                     | passes        |
| 7   | existing keys stay forbidden | `plugins/p/agents/a.md` with `paths: x\n`                                                                     | one violation naming `paths`                                      | passes        |
| 8   | each channel gets its spec   | `specFor(CLAUDE_EMIT_SPECS, 'agent', 'plugin')` and `'scaffold'`                                              | `.variant` is `'plugin'` and `'scaffold'`                         | fails         |

Test: `npm run build && npm run build:test && node --test test-compiled/targets/output-contract.test.js`.
Expected: cases 1-4 and 8 fail on their assertions, not on setup; 5, 6, 7 pass. Commit the tests with step 2.

### Step 2 `[worker:medium]`: split the spec

Files: `src/targets/claude-code/spec/agent.ts`, `src/targets/claude-code/spec/index.ts`, `src/targets/doc-refs.ts`.

- Make the two spec changes from Design. List `CLAUDE_PLUGIN_AGENT_SPEC` before `CLAUDE_AGENT_SPEC` in `CLAUDE_EMIT_SPECS`.
- Name the four keys in a module-private `PLUGIN_IGNORED_AGENT_KEYS` constant, with a one-line comment citing the doc.
- `doc-refs.ts`: set `CLAUDE_PLUGIN_COMPONENTS_DOC.verifiedOn` to `2026-10-30` and add the ignored fields to `covers`.
- Replace the end of the `claudeSkillsMapping` comment ("skills inside a plugin are namespaced … scaffolded alongside
  them") with: bare names also resolve for plugin agents, probed on Claude Code 2.1.314. The rest of it stays.
- Update the header comment, which says agent has no variant split.

Test: `npm run build && npm run build:test && node --test test-compiled/targets/output-contract.test.js test-compiled/targets/emit-files.test.js test-compiled/targets/claude-code.test.js test-compiled/targets/capabilities.test.js test-compiled/targets/output-snapshot.test.js test-compiled/commands/tool-restriction.test.js test-compiled/targets/agent-skill-preload.test.js && node dist-cli/cli.js sync --check`.
Expected: all pass, the output snapshot needs no update (no emitted byte changes), and `sync --check` reports no
errors, with `provider-kind-coverage` still satisfied by the scaffold variant.

### Step 3 `[worker:medium]`: record it

Files: `CHANGELOG.md`, `docs/decisions/distribution-channels-2026-09.md`, `docs/plan-claude-plugin-channel.md`.

- `CHANGELOG.md`, `[Unreleased]`, `### Changed`: `sigil build` fails when a Claude plugin agent would carry a field
  plugins ignore (`permissionMode`, `hooks`, `mcpServers`, `initialPrompt`).
- ADR, in the note after the roadmap table: record the plugin-agent field guard as done on the merge date. In the
  compatibility table (line ~110), add `initialPrompt` to the fields the agent row says Claude plugins ignore.
- Roadmap: remove the "Not confirmed in the current docs" bullet, and mark Phase A done with the PR number.

Test: `npx prettier --check docs CHANGELOG.md`.

### Step 4 `[inline: close-out]`

`npm run ci:local`, `workflow-report .`, `/agent-skills:review`, PR, merge on green CI, then delete this plan after
merge. The roadmap stays until Phase D is done.
