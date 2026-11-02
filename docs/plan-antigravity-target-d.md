# Plan: Antigravity target, Phase D (agents)

Phase D of [plan-antigravity-target.md](plan-antigravity-target.md). Evidence:
[antigravity-target-2026-11.md](decisions/antigravity-target-2026-11.md) (D3, probe U3, the "Tool names come from the
binary" finding, and D1 below). The phase follows
[Rules for every target](reference/architecture.md#rules-for-every-target). Branch `feat/antigravity-target-d`, one PR.

Model: the Cursor target's agent phase ([plan-cursor-target-e.md](plan-cursor-target-e.md)) and the Copilot agent spec
(`src/targets/copilot/spec/agent.ts`), which already carry a neutral `tools` list through a `names` `ToolDialect`.
Antigravity differs in three places:

- **The docs and the binary disagree on tool names.** The docs list `view_file`, `write_to_file`,
  `replace_file_content` ([Hooks, Supported tools](https://antigravity.google/docs/hooks#supported-tools)); `agy 1.4.12`
  called `read_file`, `write_file` and `edit_file` (ADR U7, B1). A misspelt or unmapped name in `tools` "may cause the
  subagent process to hang" (a known issue on [Custom subagents](https://antigravity.google/docs/subagents)). So the
  dialect writes only names a probe saw load and work.
- **An absent `tools` means no write tool** (U3), though the plugins page says "All tools". Every other target reads an
  absent list as every tool, so this spec always writes a list.
- **`model` is a tier, not a model id**: `inherit`, `flash`, `pro` on the subagents page, plus `flash_lite` on
  [Build plugins](https://antigravity.google/docs/build-plugins#subagents).

## Decisions (settled from the docs and the probes; step 1 may amend 1 and 3)

1. **`ANTIGRAVITY_AGENT_TOOL_DIALECT`, a `names` dialect, settled by D1:**

   | Neutral  | Antigravity names                                   |
   | -------- | --------------------------------------------------- |
   | `read`   | `view_file`                                         |
   | `search` | `grep_search`, `find_by_name`, `list_dir`           |
   | `edit`   | `write_to_file`, `replace_file_content`             |
   | `shell`  | `run_command`                                       |
   | `web`    | `search_web`, `read_url_content`                    |
   | `agent`  | `invoke_subagent`                                   |
   | `todo`   | none (`undefined`: no task-list tool is documented) |

   **Amended by D1:** every documented name above loaded and worked in a project agent on `agy 1.4.12`.
   `multi_replace_file_content` is dropped: it was never granted, alone or next to the other edit names (runs 10, 11).
   The observed `read_file`, `write_file` and `edit_file` load too, as a parallel set under their own names, so the
   documented ones stay.

   **One name per Antigravity tool, never a documented and an observed alias side by side.** The documented name stays
   when step 1 shows it loads and grants the tool; the observed name (`read_file`, `write_file`, `edit_file`) replaces
   it only when the documented one does not. Each extra name is one more chance of the known hang on a later `agy`,
   and a documented name is the contract the docs keep. Any name that does not load is dropped. `send_message` is
   always included by Antigravity and is never written. Every catalog agent today lists `read`, `search`, `shell` and
   sometimes `edit`, so all 39 are `exact`.

   **`todo` stays unmapped, by design.** A dialect entry must name a real tool, and no task-list tool is documented or
   observed. An agent that authors `todo` is then skipped, or written without it under `toolPolicy: nearest` with a
   warning: the same fail-closed rule every target follows (`restrictionOutcome`). No catalog agent authors `todo`.

2. **An absent `tools` writes the dialect's full list** (every neutral tool's names, in `NEUTRAL_TOOLS` order), so the
   agent keeps the meaning it has on every other target. No catalog agent omits `tools` today. Browser, image and MCP
   tools are outside the neutral vocabulary and are not written; an agent that needs them uses a provider pattern
   (passed through verbatim, as on every `names` dialect).
3. **`ANTIGRAVITY_MODEL_TIERS`: `fast` → `flash_lite`, `balanced` → `flash`, `deep` → `pro`**, written only from the
   neutral `model` (the `claude:` namespace is Claude's). An absent `model` writes nothing (`inherit` is the default).
   **Kept by D1:** `flash_lite` and `pro` both load (run 8). A value outside the tiers drops the agent with no
   warning, so the table is closed: never write anything but these three.
4. **`disallowedTools` is not mapped**: Antigravity has no denylist (D3). `restrictionOutcome` already fails closed on
   an agent that authors one (skip, or `nearest` with a warning). No catalog agent does.
5. **Frontmatter:** `name`, `description`, `model`, `tools` (a YAML block list: a string makes the loader skip the
   agent, U7). `mainAgent` and `subagent` keep their default `true`, `commandExecutionPolicy` its default `sandbox`;
   none is a catalog field. Body: `# <title>` and the Boundary section, as Cursor and Copilot write it.
6. **Path:** `.agents/agents/<name>.md` (project). No other target writes `.agents/agents/`, and Antigravity reads no
   other target's agent folder (P6), so no shared-file refusal.

Out of this phase: user-scope agents, `skills` / `mcpServers` / `inheritMcp` on agents, the plugin `agents/` folder
(Phase F), and hook matcher names (Phases H, E), which will reuse step 1's observed names.

## Regression guards (every step)

`npm test` green with no change to existing expectations outside the files a step names. In particular
`test/targets/tool-dialect.test.ts`, `test/targets/tool-restriction.test.ts`, the Claude, Copilot and Cursor agent spec
tests, `test/targets/antigravity.test.ts`, `test/targets/antigravity-mcp.test.ts`, and
`test/fixtures/output-snapshot/build.json` (it changes only in step 4, for the new agent files).

Probes and the live check run in a throwaway `git init` repo under the scratchpad. Never write to `~/.gemini/` beyond
what `agy` itself writes.

## Step 1 `[inline: probe measures Antigravity's own agent loader]`: D1 in the ADR

On the current `agy` (record `agy --version`), with `agy --model gemini-3.8-flash-low --output-format stream-json
--print-timeout 90s`, a repo holding `notes.txt` (codeword) and one agent file per run in `.agents/agents/`. Each run
uses `--agent <name>` unless it says otherwise, and a session-only `--settings` allow rule for the tools it needs
(print mode soft-denies Ask). Record, per run, `agy agents` (listed or not), the tool names the transcript shows called,
and whether it finished or hung.

- Run 1: `tools: [view_file]`, "read notes.txt and print the codeword". Expected: codeword, and the called name
  (`read_file` or `view_file`).
- Run 2: `tools: [read_file]`, same task. Records whether the observed name loads, is ignored, or hangs.
- Run 3: `tools: [view_file, write_to_file, replace_file_content, multi_replace_file_content]`, "create `a.txt`, then
  change one word in it". Expected: both done; record the called names.
- Run 4: run 3 with `write_file` and `edit_file` instead of the documented edit names. Records which set grants writes.
- Run 5: `tools: [grep_search, find_by_name, list_dir]`, "find the file holding the codeword". Expected: found.
- Run 6: `tools: [view_file, run_command]`, "run `echo d1-shell`". Expected: `d1-shell`.
- Run 7: `tools: [read_url_content, search_web]`, "fetch https://example.com and print its title". Expected: the title.
- Run 8: one agent with every name decision 1 holds after runs 1-7, plus `model: flash_lite`; then the same with
  `model: pro`. Expected: listed, finishes a read task, no hang (the guard against the known issue).
- Run 9: U3 again, plus the subagent path: a `tools: [view_file, grep_search]` agent with `mainAgent: false`; the main
  session (no `--agent`) is asked to delegate "write `b.txt`" to it. Expected: no `b.txt`.

Add a `### Phase D` subsection after `### Phase C` in the ADR's probe log, with one row, D1, and the runs. Amend
decisions 1 and 3 here before step 2 is sent: the table holds only names that loaded and worked, one per tool, the
documented name when it works and the observed one only in its place (decision 1). In the ADR's `## Decision`, name the dialect as settled by D1.

Test: `npx prettier --check docs/decisions/antigravity-target-2026-11.md docs/plan-antigravity-target-d.md`.

## Step 2 `[worker:medium]`: tool dialect and model tiers

Files: new `src/targets/antigravity/tool-dialect.ts`, new `test/targets/antigravity-agent.test.ts`.

- `ANTIGRAVITY_AGENT_TOOL_DIALECT: ToolDialect` (`kind: 'names'`), decision 1's table as amended by step 1, with a
  module comment citing the Hooks supported-tools page, D3, U3 and D1 (observed names win over documented ones).
- `antigravityAgentToolNames(authored: readonly string[]): string[]`: `renderTools(dialect, authored).names`.
- `ANTIGRAVITY_ALL_TOOL_NAMES: readonly string[]`: every defined entry of the dialect in `NEUTRAL_TOOLS` order, deduped
  (decision 2).
- `ANTIGRAVITY_MODEL_TIERS: Readonly<Record<'fast' | 'balanced' | 'deep', string>>`, decision 3 as amended.

Cases in `antigravity-agent.test.ts`:

| Case                                                     | Expected                                                          |
| -------------------------------------------------------- | ----------------------------------------------------------------- |
| `antigravityAgentToolNames(['read', 'search'])`          | `read`'s names then `search`'s, in table order                    |
| `['read', 'search', 'shell', 'edit']`                    | Four groups in that order, no duplicates                          |
| Legacy `['Read', 'Grep', 'Bash']`                        | Same as `['read', 'search', 'shell']`                             |
| A provider pattern `['read', 'mcp:github/*']`            | `read`'s names, then `mcp:github/*` verbatim                      |
| `renderTools(dialect, ['todo'])`                         | `exact: false`, `missing: ['todo']`                               |
| `renderTools(dialect, ['read','search','shell','edit'])` | `exact: true`                                                     |
| `ANTIGRAVITY_ALL_TOOL_NAMES`                             | Equals `antigravityAgentToolNames([...NEUTRAL_TOOLS])`, no `todo` |
| `ANTIGRAVITY_MODEL_TIERS`                                | Decision 3's three values                                         |

Test: `npm test -- test/targets/antigravity-agent.test.ts`, then `npm test`.

## Step 3 `[worker:medium]`: the agent emit spec

Files: new `src/targets/antigravity/spec/agent.ts`, `src/targets/antigravity/spec/index.ts`,
`src/targets/antigravity/doc-refs.ts`, `test/targets/antigravity-agent.test.ts`.

- `doc-refs.ts`: `ANTIGRAVITY_SUBAGENTS_DOC` = `https://antigravity.google/docs/subagents#custom-subagents`, title
  `Antigravity — Custom subagents`, `verifiedOn` today, covers: "`.agents/agents/<name>.md`, Markdown with YAML
  frontmatter: `name`, `description`, `tools` (a list), `model` (`inherit`, `flash`, `pro`); an absent `tools` grants no
  write tool (U3)". `ANTIGRAVITY_PLUGIN_SUBAGENTS_DOC` = `https://antigravity.google/docs/build-plugins#subagents`,
  covers: "`model` tiers include `flash_lite`; omit file-edit and shell tools for a read-only agent".
- `spec/agent.ts`, modelled on `src/targets/copilot/spec/agent.ts`: `ANTIGRAVITY_AGENT_SPEC` with `kind: 'agent'`,
  `outputPath` `.agents/agents/<name>.md`, `pathPattern` `/\.agents\/agents\/[^/]+\.md$/`, `toolDialect`,
  `emitEmptyFrontmatter: true`, the title-and-Boundary body section, `forbiddenKeys: ['applyTo', 'paths']`,
  `lexicon: ANTIGRAVITY_LEXICON`, `bodyForbids: [UNTRANSLATED_TOKEN_FORBID]`, both docs. Frontmatter mappings, in
  order: `name`; `description` via `yamlScalar`; `model` from the neutral `model` through `ANTIGRAVITY_MODEL_TIERS`;
  `tools` with `alwaysEmit: true`, serializing an authored non-empty list through `antigravityAgentToolNames` and an
  absent or empty one as `ANTIGRAVITY_ALL_TOOL_NAMES`, always as a YAML block list (`tools:` then `  - <name>` lines).
  Module comment: decisions 2, 4 and 5.
- `spec/index.ts`: add the spec to `ANTIGRAVITY_EMIT_SPECS`. Not wired into capabilities yet (step 4), so `add`
  still skips agents here.

Cases (render through `renderArtifact` with the real catalog, as the Copilot agent spec test does):

| Case                                                  | Expected                                                                         |
| ----------------------------------------------------- | -------------------------------------------------------------------------------- |
| `typescript/ts-code-reviewer`                         | `name`, `description`, `tools` block list of read/search/shell names, no `model` |
| `shared/code-reviewer` (`model: balanced`)            | `model: flash` line before `tools`                                               |
| `typescript/ts-refactor-specialist` (has `edit`)      | `tools` includes the edit names                                                  |
| A fixture agent with no `tools`                       | `tools` holds `ANTIGRAVITY_ALL_TOOL_NAMES`                                       |
| A fixture with `model: fast` / `deep`                 | Decision 3's values                                                              |
| A fixture with `claude: {model: opus}` and no `model` | No `model` line                                                                  |
| A fixture with `disallowedTools`                      | `restrictionOutcome` is `skip` (or `nearest` with `toolPolicy: nearest`)         |
| A fixture with `tools: ['read', 'todo']`              | `restrictionOutcome` `skip`, naming `todo`                                       |
| `restrictionOutcome` for every catalog agent          | `exact`                                                                          |
| Body                                                  | Starts with `# <title>`; no `{sigil:` token left                                 |
| The `tools` value parsed back with js-yaml            | An array of strings (never a string, U7)                                         |

Test: `npm test -- test/targets/antigravity-agent.test.ts`, then `npm test`.

## Step 4 `[worker:medium]`: wire agents into the target

Files: `src/targets/antigravity/{capabilities,metadata,index}.ts`, `test/targets/antigravity-agent.test.ts`;
regenerated `docs/reference/capabilities.md` and `test/fixtures/output-snapshot/build.json`.

- `capabilities.ts`: `agent: { mode: 'native' }`; module comment names `.agents/agents/`.
- `metadata.ts`: `'.agents/agents'` in `ANTIGRAVITY_INIT_DIRS`; an `agent` vocabulary entry (`agent`, `Agents`,
  `subagents in .agents/agents/`).
- `index.ts`: module comment and `afterInstallHint` name `.agents/agents/` (`Antigravity picks up .agents/skills/,
.agents/rules/ and .agents/agents/ in its next session.`).
- `npm run build`, then commit the regenerated files.

End-to-end cases (temp project, the helpers `antigravity-mcp.test.ts` uses):

| Case                                                                                             | Expected                                                                                |
| ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `add --target antigravity typescript/ts-code-reviewer`                                           | `.agents/agents/ts-code-reviewer.md` written, in the manifest                           |
| `add` again                                                                                      | File unchanged                                                                          |
| `update` after the catalog agent's `description` changes                                         | File rewritten                                                                          |
| `uninstall typescript/ts-code-reviewer`                                                          | File removed                                                                            |
| `add` of a fixture agent with `disallowedTools`                                                  | Skipped with `restrictionOutcome`'s reason, nothing written                             |
| `build --target antigravity`                                                                     | One `.agents/agents/<name>.md` per catalog agent                                        |
| `capabilities.test.ts`                                                                           | Passes with `agent` native                                                              |
| `sync --check` (`provider-kind-coverage`, `declared-but-unemitted`, `tool-restriction-coverage`) | Clean                                                                                   |
| Project with `cursor` and `antigravity` both installing one agent                                | `.cursor/agents/` and `.agents/agents/` each hold it; uninstalling one leaves the other |

Test: `npm test`, `npm run build && git diff --exit-code docs/reference/capabilities.md`,
`node dist-cli/cli.js sync --check`.

## Step 5 `[inline: user-facing copy]`: docs

- `docs/setup/antigravity.md`: an `## Agents` section: the folder, `agy --agent <name>` and `/agents`, the tool list
  written from the neutral one (and that an agent with no `tools` gets the full list, since Antigravity's default is
  none), the model tiers, `commandExecutionPolicy: sandbox` as the default for `run_command`, and print mode's
  approval for writes and shell. Drop agents from the "not built yet" line.
- `docs/decisions/neutral-agent-vocabulary-2026-11.md`: the Antigravity column (dialect and tiers).
- `docs/reference/spec.md` agent destinations and tool mapping, `README.md` if it lists per-target kinds,
  `CHANGELOG.md` (Unreleased).
- The ADR's § 3 and § 6 rows for agents.

Test: `npm run ci:local`.

## Step 6 `[inline: live check measures Antigravity]`: a sigil-installed agent runs

In a throwaway repo with a small TypeScript file: `sigil add --target antigravity typescript/ts-code-reviewer`, then
`agy --agent ts-code-reviewer --model … -p "Review src/app.ts, then write your findings to review.md."` with no write
allow rule. Expected: a review in the output, `agy agents` lists it, no `review.md` (the agent has no edit tool). Then
`sigil uninstall` and check `.agents/agents/` is empty. Record it in the ADR probe log, mark Phase D done in the roadmap,
and update the project memory.

Test: the run returns a review and leaves no `review.md`;
`npx prettier --check docs/decisions/antigravity-target-2026-11.md`.
