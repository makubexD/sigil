# Plan: Antigravity target, Phase E (hooks)

Phase E of [plan-antigravity-target.md](plan-antigravity-target.md). Evidence:
[antigravity-target-2026-11.md](decisions/antigravity-target-2026-11.md) (D5, P4, U7 and E1 below) and the neutral hook
contract [neutral-hook-contract-2026-11.md](decisions/neutral-hook-contract-2026-11.md) (Phase H), whose decision 4
table already holds an Antigravity row with "Phase E" gaps. The phase follows
[Rules for every target](reference/architecture.md#rules-for-every-target). Branch `feat/antigravity-target-e`, one PR.

Model: the Cursor hook code (`src/targets/cursor/hook-dialect.ts`, `hook-ops.ts`, `config.ts`), which already renders
the neutral contract into a one-line `node -e` command. Antigravity differs in four places
([Hooks](https://antigravity.google/docs/hooks), checked 2026-11-02):

- **The file is keyed by hook name.** `hooks.json` maps a hook name to its events (`{"safety-gate": {"PreToolUse":
[…]}}`); there is no `hooks` wrapper and no `version`. U7 saw a `"hooks"` wrapper load as one hook named `hooks`.
- **Two entry shapes.** `PreToolUse` / `PostToolUse` take `[{matcher, hooks: [{type, command, timeout}]}]`;
  `SessionStart`, `PreInvocation`, `PostInvocation` and `Stop` take the handlers directly (`[{type, command}]`) and
  ignore a matcher.
- **The docs and the binary disagree on tool names and arguments.** The docs list `write_to_file`,
  `replace_file_content`, `multi_replace_file_content` with `TargetFile`; P4 saw `agy 1.4.12` call `write_file` with
  `Path`. A matcher that names only one set lets the other through, so the hook table names both (unlike the agent
  dialect, where an extra name risks the known hang).
- **Deny.** The plugins page says a non-zero exit fails open; P4 saw exit 2 deny. The contract denies with exit 2, so
  the deny test and the live check keep checking it on every `agy` update.

## Decisions (settled from the docs and the probes; step 1 may amend 1-4)

1. **`ANTIGRAVITY_HOOK_TOOL_DIALECT`, a `names` dialect** (decision 2 of the contract):

   | Neutral  | Antigravity hook names                                                                           |
   | -------- | ------------------------------------------------------------------------------------------------ |
   | `read`   | `view_file`, `read_file`                                                                         |
   | `search` | `grep_search`, `find_by_name`, `list_dir`                                                        |
   | `edit`   | `write_to_file`, `replace_file_content`, `multi_replace_file_content`, `write_file`, `edit_file` |
   | `shell`  | `run_command`                                                                                    |
   | `web`    | `search_web`, `read_url_content`                                                                 |
   | `agent`  | `invoke_subagent`                                                                                |
   | `todo`   | none (`undefined`: no task-list tool is documented or observed)                                  |

   Documented names from Hooks § Supported tools; the observed set (`read_file`, `write_file`, `edit_file`) from P4,
   U7 and D1. Step 1 drops any name E1 shows the binary never reports and adds any edit-shaped name it does report.
   Rendered joined with `|`; the docs' matcher is a regular expression where a bare name matches exactly.

2. **`ANTIGRAVITY_HOOK_EVENTS`:** `before-tool` → `PreToolUse`, `after-tool` → `PostToolUse`, `session-start` →
   `SessionStart`, `stop` → `Stop`. **Refused:** `prompt-submit` (`PreInvocation` fires before every model
   invocation, not once per prompt, so it is not the same event), `subagent-stop` and `notification` (no event).
   A `stop` script that exits 2 is recorded by E1: if the loop does not continue, the setup page says a stop hook
   cannot block here (the docs block a stop only with `decision: "continue"` on stdout, outside contract v1).

3. **`ANTIGRAVITY_HOOK_INPUT`:** `toolField: 'toolCall.name'`, `inputField: 'toolCall.args'`, `pathFields:
['TargetFile', 'Path', 'AbsolutePath']`, `commandField: 'CommandLine'`, no `patch` (no Antigravity tool carries patch
   text), no `agentField` and no `cwdField` (the stdin has neither; `workspacePaths` is an array and `Cwd` is a
   `run_command` argument only), `toolNames: invertHookToolNames(<table above>)`. Step 1 records the argument keys E1
   sees for each edit name and amends `pathFields`; it sets `agentField` only if a subagent's stdin names its agent.
   Only `shared/protect-config` ships to Antigravity (the other two catalog hooks are `platforms: [claude]`), and it
   reads `files` only.

4. **The entry.** One op per install, the fragment `{ "<hook name>": { "<Event>": [<entry>] } }` with the default
   `object-spread` strategy on the hook-name key, so `replaceMerge`, `reverseMerge` and drift work unchanged and a
   user's other hooks are never touched. Hook name: the artifact id with `/` replaced by `-`
   (`shared-protect-config`); ids are kebab-case (`KEBAB_ID_RE`), so the name is too. Tool events write
   `[{matcher?, hooks: [{type: 'command', command, timeout?}]}]` (no `matcher` key for `*`, which the docs read as
   every tool); other events write `[{type: 'command', command, timeout?}]`. `enabled` is never written (default on).
   `command` is a `script` hook's `nodeEvalCommandLine` (base64, no quoting), or a `command` hook's
   `nodeEvalCommandLine` / `posixCommandLine`, exactly as Cursor. `timeout` is seconds on both sides and passes through.
   The writer's `section` (shown in `add`'s plan box) is `(hook name)`.

5. **Scopes:** `project` → `.agents/hooks.json` (root `project`), `user` → `.gemini/config/hooks.json` (root `home`,
   `.sigil.bak` through the shared config writer); `local` is refused. Hooks in `settings.json` are not loaded (docs),
   so nothing is written there.

6. **Capabilities:** `hook` scaffold `native`. No plugin channel yet (Phase F).

Out of this phase: the plugin `hooks.json` (Phase F), stdout decisions (`overwrite`, `ask`, …; not in contract v1),
`PreInvocation` / `PostInvocation`, a Windows shell check (the hooks page names no shell; the setup page says hooks are
checked on Linux only), and a hook-name collision check: like an MCP server key, a user hook with the same name is
replaced, which the setup page states.

## Regression guards (every step)

`npm test` green with no change to existing expectations outside the files a step names. In particular
`test/targets/hook-input.test.ts`, `test/targets/hook-render.test.ts`, `test/targets/cursor-hooks.test.ts`,
`test/targets/antigravity.test.ts`, `test/targets/antigravity-mcp.test.ts`, `test/targets/capabilities.test.ts`,
`test/hooks/deny-contract.test.ts` and `test/fixtures/output-snapshot/build.json`. Run one file with
`npm run pretest && node --test test-compiled/<dir>/<file>.test.js`.

Probes and the live check run in a throwaway `git init` repo under the scratchpad. Never write to `~/.gemini/` beyond
what `agy` itself writes; nothing in this phase installs at user scope against the real home.

## Step 1 `[inline: probe measures Antigravity's own hook runner]`: E1 in the ADR

On the current `agy` (record `agy --version`), with `agy --model gemini-3.8-flash-low --output-format stream-json
--print-timeout 90s` and the `-p` prompt last. The repo holds `.agents/hooks.json` written by hand in the decision 4
shape, `notes.txt` (codeword) and an existing `.env.local`. A recorder hook is a `node -e` line that appends its stdin
as one JSON line to `hooks.log` in the scratchpad and exits 0.

- Run 1, P4 again: a `PreToolUse` hook named `shared-protect-config` with matcher `*` that exits 2 with a reason on
  stderr when any string argument ends in `.env`; "create `.env` holding `A=1`". Expected: no `.env`, the reason in
  the stream.
- Run 2, the names: a recorder on `PreToolUse` with matcher `*`; "create `a.txt`, change one word in it, change two
  separate lines of `notes.txt`, read `notes.txt`, find the file holding the codeword, run `echo e1`". Record each
  `toolCall.name` and its argument keys.
- Run 3, the matcher: the recorder with matcher `write_to_file|replace_file_content|multi_replace_file_content|write_file|edit_file`
  (decision 1's edit set), same edits plus a read. Expected: every edit logged, no read.
- Run 4, other events: recorders on `SessionStart` and `PostToolUse` (decision 4 shapes). Expected: both fire.
- Run 5, `Stop`: a `Stop` hook that exits 2 the first time (marker file) and 0 after. Record whether the loop continued.
- Run 6, subagents: the recorder on `PreToolUse` and a project agent `.agents/agents/e1-reader.md`
  (`tools: [view_file, run_command]`); the main session is asked to have `e1-reader` run `echo e1-sub`. Record whether
  the subagent's calls reach the hook and any field naming the agent.

Add a `### Phase E` subsection after `### Phase D` in the ADR's probe log, with one row, E1, and the runs. Amend
decisions 1-3 here before step 2 is sent (names the binary reported, path keys, `agentField`, the `Stop` note). In
the ADR's D5, replace the "binary disagrees" line with E1's result.

Test: `npx prettier --check docs/decisions/antigravity-target-2026-11.md docs/plan-antigravity-target-e.md`.

## Step 2 `[worker:medium]`: the hook dialect

Files: `src/targets/antigravity/hook-dialect.ts` (new), `src/targets/antigravity/doc-refs.ts`,
`test/targets/hook-input.test.ts`.

- `doc-refs.ts`: add `ANTIGRAVITY_HOOKS_DOC` (`https://antigravity.google/docs/hooks`, the same `DocRef` shape and
  `checked` date style as `ANTIGRAVITY_MCP_DOC`).
- `hook-dialect.ts`, modelled line for line on `src/targets/cursor/hook-dialect.ts`: a private
  `ANTIGRAVITY_HOOK_TOOL_NAMES` (decision 1 as amended), exported `ANTIGRAVITY_HOOK_TOOL_DIALECT`
  (`{ kind: 'names', names }`), `ANTIGRAVITY_HOOK_EVENTS` (`ReadonlyMap<HookEvent, string>`, decision 2's four
  entries), and `ANTIGRAVITY_HOOK_INPUT` (decision 3 as amended). The module doc cites the hooks page and the ADR's
  P4 / E1; each constant's doc says where its names come from.
- Tests, a new `describe('Antigravity hook input')` in `hook-input.test.ts`, each through `normalizeHookInput(raw,
ANTIGRAVITY_HOOK_INPUT, 'before-tool')`:
  - `{"toolCall":{"name":"write_file","args":{"Path":"/r/.env","Content":"x"}}}` → `{event:'before-tool', tool:'edit',
files:['/r/.env']}`.
  - `{"toolCall":{"name":"write_to_file","args":{"TargetFile":"/r/a.ts"}}}` → `tool:'edit'`, `files:['/r/a.ts']`.
  - `multi_replace_file_content` with `TargetFile` → `tool:'edit'`, that one file.
  - `{"toolCall":{"name":"run_command","args":{"CommandLine":"npm test","Cwd":"/r"}}}` → `tool:'shell'`,
    `command:'npm test'`, `files:[]`, no `cwd`.
  - `{"toolCall":{"name":"browser_click","args":{}}}` → no `tool`, `files:[]`.
  - Claude's shape `{"tool_name":"Write","tool_input":{"file_path":"/r/.env"}}` → no `tool`, `files:[]`.
  - `not json` → `undefined`.
  - `invertHookToolNames` round trip: every name in the table maps back to its neutral tool, and `todo` maps from none.

Test: `npm run pretest && node --test test-compiled/targets/hook-input.test.js` — all pass, the new cases included.

## Step 3 `[worker:medium]`: the hook ops

Files: `src/targets/antigravity/hook-ops.ts` (new), `src/targets/antigravity/config.ts`,
`test/targets/antigravity-hooks.test.ts` (new).

- `hook-ops.ts`, modelled on `src/targets/cursor/hook-ops.ts` without the PowerShell check:
  `antigravityHookSkipReason(artifact)` (event refusal, then matcher refusal, each ending with "Add 'platforms:'
  without 'antigravity' so this hook is not installed there.") and `buildAntigravityHookOps(artifact, scope)`, which
  throws `SigilError` with the skip reason, then returns one op: `...destinationFor(ANTIGRAVITY_CONFIG_KINDS, 'hook',
scope, 'Antigravity')` (file and root only), `fragment: { [hookName]: { [Event]: [entry] } }`, `strategy: {}`.
  `hookName` is `artifact.id.replaceAll('/', '-')`. The entry follows decision 4; a script is composed with
  `composeHookScript(script, ANTIGRAVITY_HOOK_INPUT, neutralEvent, tools)` and written with `nodeEvalCommandLine`.
  Event refusal text: "Antigravity has no '<event>' hook event to map to — it has tool, session-start and stop
  events only." Matcher refusals reuse Cursor's wording with "Antigravity".
- `config.ts`: add the `hook` writer to `ANTIGRAVITY_CONFIG_KINDS` (section `(hook name)`, decision 5's two
  destinations with displays `.agents/hooks.json, git-committed` and `~/.gemini/config/hooks.json, all projects`,
  arrow-wrapped builders as for `mcp`), and the hook lines in the module doc.
- Tests (`antigravity-hooks.test.ts`, built from small in-memory artifacts as `cursor-hooks.test.ts` does):
  - `before-tool` + `matcher: edit` + a script, project scope → file `.agents/hooks.json`, root `project`, fragment key
    `shared-x`, `PreToolUse[0].matcher` equal to decision 1's edit names joined with `|`, `hooks[0].type` `command`,
    `command` starting `node -e`, no `timeout` key.
  - same with `timeout: 10` → `hooks[0].timeout` 10.
  - `matcher: '*'` and no matcher → no `matcher` key.
  - `session-start` + a command → `SessionStart: [{type:'command', command}]` (no `hooks` wrapper, no matcher).
  - `stop` → key `Stop`.
  - `prompt-submit`, `subagent-stop`, `notification` → `antigravityHookSkipReason` returns the event refusal, and
    `buildAntigravityHookOps` throws it.
  - `session-start` with `matcher: edit` → matcher refusal.
  - `matcher: todo` → matcher refusal naming `todo`.
  - user scope → file `.gemini/config/hooks.json`, root `home`; `local` → throws the scope refusal.
  - legacy `PreToolUse` + `Edit|Write` renders the same entry as `before-tool` + `edit`.
  - the composed script, run with `sh -c` on `{"toolCall":{"name":"write_file","args":{"Path":"/r/.env"}}}`, sees
    `input.tool === 'edit'` and `input.files` `['/r/.env']` (a script that prints `JSON.stringify(input)`).

Test: `npm run pretest && node --test test-compiled/targets/antigravity-hooks.test.js` — all pass.

## Step 4 `[worker:medium]`: wire hooks into the target

Files: `src/targets/antigravity/capabilities.ts`, `src/targets/antigravity/index.ts`,
`src/targets/antigravity/aggregate-docs.ts`, `docs/reference/capabilities.md` (regenerated), `test/targets/antigravity.test.ts`.

- `capabilities.ts`: `hook: { mode: 'native' }`; module doc says hooks go to `.agents/hooks.json` /
  `~/.gemini/config/hooks.json`.
- `index.ts`: `readonly hookInput: HookInputDialect = ANTIGRAVITY_HOOK_INPUT` (as Cursor); scope descriptions
  `project — .agents/hooks.json and .agents/mcp_config.json, git-committed` and
  `user — ~/.gemini/config/hooks.json and ~/.gemini/config/mcp_config.json, all projects`; `afterInstallHint` gains
  "Hooks in .agents/hooks.json load in the next session."; the module and method docs mention hooks.
- `aggregate-docs.ts`: a second entry, source `antigravity .agents/hooks.json / ~/.gemini/config/hooks.json
aggregate`, doc `ANTIGRAVITY_HOOKS_DOC`.
- `npm run build` regenerates `docs/reference/capabilities.md` (the hook row turns native).
- Tests in `antigravity.test.ts`: `supportsKind(antigravity, 'hook')` true; `configScopes(['hook'], dir)` lists project
  and user; `scaffoldConfig('shared/protect-config', catalog, {scope:'project'})` returns one op on
  `.agents/hooks.json` with key `shared-protect-config`; `configSkipReason` of `shared/worker-mode-guard` is undefined
  and `add` never offers it (it is `platforms: [claude]`, so it is filtered before the target).

Test: `npm run build && npm run validate && node dist-cli/cli.js sync --check && npm run pretest && node --test
test-compiled/targets/antigravity.test.js test-compiled/targets/capabilities.test.js` — all pass, `sync --check`
clean (`provider-kind-coverage`, `config-target-render`, `hook-provider-input`).

## Step 5 `[worker:medium]`: deny test and install round trip

Files: `test/hooks/deny-contract.test.ts`, `test/commands/antigravity-hooks-install.test.ts` (new).

- `deny-contract.test.ts`: add `{ name: 'antigravity', target: new AntigravityTarget(), form: 'command-line' }`; the
  render case reads `fragment['shared-protect-config'].PreToolUse[0].hooks[0].command` and runs it with
  `runCommandLine`. Payloads: `writePayload('antigravity', p)` is `{"toolCall":{"name":"write_file","args":{"Path":p,
"Content":"x"}}}`; add a second Antigravity-only case with `write_to_file` / `TargetFile`. The existing cases apply
  unchanged: `.env` exits 2 with the reason on stderr, `src/index.ts` exits 0, unparseable stdin exits 0.
- `antigravity-hooks-install.test.ts`, modelled on the existing config install tests (use the helper that
  `test/commands/update-config.test.ts` uses to run `add` / `update` / `uninstall` in a temp project and a temp HOME):
  - project `add shared/protect-config --target antigravity` into a dir whose `.agents/hooks.json` already holds a
    user hook `mine` → the file holds `mine` unchanged and `shared-protect-config`; the manifest records the fragment.
  - `add` again → still one `shared-protect-config` key with one `PreToolUse` entry.
  - `uninstall` → the file holds `mine` only.
  - user scope with a pre-existing `~/.gemini/config/hooks.json` holding `mine` → `hooks.json.sigil.bak` written once,
    holding the original bytes.
  - edit the installed command by hand → `status` shows it modified, `update` refuses without `--force`; delete the
    key → `update` restores it without `--force`.

Test: `npm run pretest && node --test test-compiled/hooks/deny-contract.test.js
test-compiled/commands/antigravity-hooks-install.test.js` — all pass, Antigravity included.

## Step 6 `[inline: user-facing copy]`: docs

Files: `docs/setup/antigravity.md`, `docs/reference/config-kinds.md`, `docs/decisions/neutral-hook-contract-2026-11.md`,
`docs/decisions/antigravity-target-2026-11.md`, `CHANGELOG.md`, `docs/plan-antigravity-target.md`.

- Setup page: a Hooks section (files per scope, the named-entry shape, the events and refusals, that a user hook with
  the same name is replaced, exit 2 denies on the `agy` version E1 ran, Linux-only check, the `Stop` note if E1 calls
  for it).
- `config-kinds.md`: Antigravity rows in the hook scope table and the event / matcher paragraph.
- Contract ADR: the Antigravity column in decisions 1 and 2, the decision 4 row's "Phase E" cells filled, decision 6
  amended.
- Antigravity ADR: `## Decision` names hooks as shipped.
- CHANGELOG `Unreleased`: Antigravity hooks.
- Roadmap: Phase E `(done <date>)` with a short summary and the plan link, as the other phases.

Test: `npm run build && npx prettier --check docs CHANGELOG.md && npm run validate`.

## Step 7 `[inline: live check measures Antigravity]`: E2, a sigil-installed hook denies

In a throwaway repo: `npm run sigil -- add shared/protect-config --target antigravity --project-dir <repo>` (project
scope), then `agy -p "create .env holding A=1"`. Expected: no `.env`, `sigil-hook: blocked write to protected file`
in the stream. Then "create `notes.txt`" → written. Then `sigil uninstall` → `.agents/hooks.json` holds no sigil key.
Record E2 under Phase E in the ADR's probe log. If the deny fails, stop and report before the PR.

Test: `npx prettier --check docs/decisions/antigravity-target-2026-11.md`.
