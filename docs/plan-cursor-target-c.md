# Plan: Cursor target, Phase C (hooks in `.cursor/hooks.json`)

Roadmap: [plan-cursor-target.md](plan-cursor-target.md) § Phase C. Probe results:
[cursor-target-2026-11.md](decisions/cursor-target-2026-11.md) (A4, A5, § Hooks: the matcher and A5). Branch
`feat/cursor-hooks`, one PR.

Model: Codex's hook writer (`src/targets/codex/hook-ops.ts`, `config.ts`) and Copilot's `version: 1` handling
(`src/targets/copilot/hook-ops.ts`, `version` as a `file-marker` key).

## Decisions (owner, 2026-11-01)

1. **Events.** The eight events Cursor documents as Claude Code aliases are in scope (third-party hooks doc, "Hook
   Step Mapping"): `PreToolUse`→`preToolUse`, `PostToolUse`→`postToolUse`, `UserPromptSubmit`→`beforeSubmitPrompt`,
   `Stop`→`stop`, `SubagentStop`→`subagentStop`, `SessionStart`→`sessionStart`, `SessionEnd`→`sessionEnd`,
   `PreCompact`→`preCompact`. The rest:
   - `SubagentStart` → `subagentStart` **only without a matcher**. Claude matches it against an agent name, Cursor
     against a subagent type (`explore`, `shell`, `generalPurpose`), so a matcher can't be translated.
   - `Notification`, `PermissionRequest` and any other Claude event have no Cursor equivalent.
   - A hook sigil can't render for Cursor is **skipped with its reason, never a crash**: `add` and the wizard list it
     under skipped, like an unsupported kind (step 5), and `sync --check` fails when a catalog hook ships to Cursor
     but can't render there, so an author adds `platforms:` before release (step 6). Today all three catalog hooks
     render (`worker-mode-guard` is `platforms: [claude]`).
   - Not now: a `cursor:` frontmatter namespace for Cursor-only events (`beforeShellExecution`, `afterFileEdit`, …).
     Add it when a catalog hook needs one.
2. **Matchers are translated by a data table in code** (`CURSOR_TOOL_NAMES` in `hook-ops.ts`), never copied:
   `Bash`→`Shell`, `Read`, `Grep`, `Task`, `WebFetch`, `WebSearch` unchanged; `Write`, `Edit`, `MultiEdit`,
   `NotebookEdit` → the **edit matcher** step 1 measures. `Glob` and regex matchers (`Edit.*`, `^Bash$`) can't be
   translated, so they are skipped (Decision 1). A hook that never matches would let every call through. The edit
   matcher is chosen fail-safe: `Write` if step 1 shows an edit's calls named `Write`; otherwise `Read|Write`, which
   over-fires (a `.env` read is blocked too) rather than never firing. A test pins the table and the doc ref's
   `verifiedOn`, so `sync --stale` asks for a re-check when Cursor's docs change.
3. **The install takes care of Cursor's hook rules itself**, warning only where it can't:
   - **Empty stdout.** Cursor's docs say a `preToolUse` / `subagentStart` hook that exits 0 with invalid JSON blocks
     the call, and catalog hooks print nothing. If step 1 confirms it, the Cursor writer wraps each `node -e` script
     on those events with an exit handler that prints `{"permission":"allow"}` on exit 0, without changing the catalog.
     A non-`node -e` hook on those events is skipped with that reason. If step 1 shows empty stdout passes, no wrapper.
   - **`node` missing.** A hook that can't start fails open on every target. `add` warns when a hook's `command` is
     not on `PATH` (step 7).
   - **Claude Code hooks also run in Cursor** (if step 1 shows it): `add` and `status` say the hook runs twice (step 8).
   - **Trusted workspace only:** the after-install hint says so.
   - **Windows runs hooks through PowerShell:** the `node -e` line works there; another command with a `'` in a word is
     skipped (Decision 1).
4. **Scopes:** both write `.cursor/hooks.json`, under the project root (`root: project`) or `~` (`root: home`, already
   home-scoped, so `ensureHomeBackup` applies). `local` is refused: Cursor has no personal per-project hook file.

Out of this phase: `failClosed` (with it, a machine without `node` blocks every call), prompt-type hooks, MCP
(Phase D), moving Codex to skip-not-throw (same seam, separate change).

## Step 1 `[inline: probe measures Cursor's own hook runner]`: an edit's calls, empty stdout, A5 again

A throwaway git repo in the scratchpad (`mkrepo.sh`, as in Phase A) is a valid test bed: project hooks load from its
`.cursor/hooks.json` once the workspace is trusted (`--trust`), and Claude hooks from its `.claude/settings.json` while
Cursor's Third-Party Imports setting is on (the default). Never run it in this repo. The Linux CLI (`agent`,
`2026.10.22-27dcf5f`, signed in) is what's measured; the desktop app and Windows PowerShell stay unmeasured until
Phase G. Record prompts, `agent --version` and output in a new `### Phase C probes` subsection of the ADR's probe log,
and update the A5 row.

- **Run 1.** `.cursor/hooks.json`: one matcher-less `preToolUse` hook that appends stdin to `hook-cursor.log` and exits
  0 with **empty stdout**. `.claude/settings.json`: one matcher-less `PreToolUse` hook appending stdin to
  `hook-claude.log`, exit 0. Prompt: `Create notes.txt containing one line, then change that line to "done".`
- **Run 2, only if run 1 didn't write `notes.txt`.** The same with the Cursor hook printing `{"permission":"allow"}`.

| Result                             | Change                                                            |
| ---------------------------------- | ----------------------------------------------------------------- |
| An edit fires a call named `Write` | Edit matcher `Write`                                              |
| Edits fire only `Read`-named calls | Edit matcher `Read\|Write`; the ADR says the hook also sees reads |
| Run 1 writes `notes.txt`           | No stdout wrapper; step 4's wrapper item is dropped               |
| Run 1 doesn't, run 2 does          | Step 4 includes the wrapper                                       |
| Neither writes it                  | Stop and amend this plan                                          |
| `hook-claude.log` has entries      | Step 8 stays                                                      |
| `hook-claude.log` is never created | Step 8 is dropped; the ADR records it                             |

Amend steps 3, 4 and 8 with the results and commit the amendment (`docs: plan cursor hooks, step 1 results`) before
step 2.

Test: none (probe). The ADR diff and the logs are the evidence.

## Step 2 `[worker:medium]`: move the command-line helpers to a shared module

Files: new `src/targets/shared/hook-command-line.ts`; `src/targets/codex/hook-ops.ts`.

Move `nodeEvalCommandLine`, `posixCommandLine` and `windowsCommandLine` (with `NODE_EVAL_ARG_COUNT` and their doc
comments) out of `codex/hook-ops.ts` into the new module, unchanged. Its doc comment says Codex and Cursor use them.
`codex/hook-ops.ts` imports them and re-exports all three (`test/targets/codex-hooks.test.ts` imports them from
`dist-cli/targets/codex/hook-ops`). No behavior change.

Test: `npm test -- --test-name-pattern='[Cc]odex'` passes unchanged; `npm run lint` clean.

## Step 3 `[worker:medium]`: RED unit tests for Cursor hook ops

Files: new `test/targets/cursor-hooks.test.ts`.

Use the `makeHook` / `makeCatalog` pattern from `test/targets/codex-hooks.test.ts`. Import `CursorTarget` from
`dist-cli/targets/cursor` and `buildCursorHookOps`, `cursorHookSkipReason` from `dist-cli/targets/cursor/hook-ops`
(not written yet: that is the RED). Every `describe` name starts with `Cursor hook`. Constants at the top:
`EDIT_MATCHER` (step 1's value) and `WRAPS_STDOUT` (step 1: true when the wrapper is in).

1. Events: each of the eight aliases → a fragment whose only `hooks` key is the camelCase name. `SubagentStart` with no
   matcher → `subagentStart`.
2. `cursorHookSkipReason` returns a string naming the reason, and `buildCursorHookOps` throws a `SigilError` with the
   same text, for: `Notification`, `PermissionRequest`, `Bogus`; `SubagentStart` with `matcher: reviewer`; matchers
   `Glob`, `Glob|Read`, `Unknown`, `Edit.*`, `^Bash$`; `SessionStart` with `matcher: startup`; `command: ./c.sh, args:
["it's"]` (names PowerShell). It returns `undefined` for every case in 1, 3-9.
3. Fragment for `PreToolUse`, matcher `Edit|Write`, `node -e x`, project scope: exactly
   `{ version: 1, hooks: { preToolUse: [{ type: 'command', command: <line>, matcher: EDIT_MATCHER }] } }`, `version`
   first; strategy exactly `{ version: 'file-marker', hooks: 'array-append' }`.
4. Matchers (`PreToolUse` and `PostToolUse`): `Bash` → `Shell`; `Edit|Write` and `Edit|Write|MultiEdit|NotebookEdit` →
   `EDIT_MATCHER`; `Read|Grep` → `Read|Grep`; `Bash|Edit` → `Shell|` + `EDIT_MATCHER` (deduped, first-seen order);
   `Task|WebFetch|WebSearch` → unchanged. Absent or `*` → no `matcher` key.
5. Command: `node -e <script>` → the decoded base64 is `<script>`, or, when `WRAPS_STDOUT` and the event is
   `PreToolUse`/`SubagentStart`, the wrapper prefix followed by `<script>`; on `PostToolUse` never wrapped.
   `command: ./check.sh, args: ['--strict', 'a b']` → `./check.sh --strict 'a b'`; no args → `./check.sh`. When
   `WRAPS_STDOUT`, a non-`node -e` `PreToolUse` hook is skipped (case 2's reason list gains it).
6. `timeout: 30` → `timeout: 30` in the entry; absent → no key.
7. Destination: project → `{ file: '.cursor/hooks.json', root: 'project' }`; user → `{ file: '.cursor/hooks.json',
root: 'home' }`; local → `SigilError` naming both other scopes.
8. `CursorTarget.scaffoldConfig`: an `mcp` artifact throws (Phase D); a hook with `defaultScope: user` and no `scope`
   option → user destination; with neither → project. `configScopes(['hook'], '/abs/project')` → `project` then
   `user`, `fullPath` `/abs/project/.cursor/hooks.json` and `<os.homedir()>/.cursor/hooks.json`, `section: 'hooks'`.
9. Real catalog: `shared/protect-config` → matcher `EDIT_MATCHER`; `shared/reviewer-bash-guard` → `Shell`; both decode
   to the catalog script (plus the wrapper per case 5).
10. A4's payload through the real hook: write the rendered `protect-config` command to a temp script, run it with
    `spawnSync('sh', [...])`, stdin A4's payload (`tool_name: "Read"`, `tool_input.file_path: <tmp>/.env`,
    `hook_event_name: "preToolUse"`) → exit 2, stderr contains `blocked write to protected file`. With
    `<tmp>/notes.txt` → exit 0, and stdout is `{"permission":"allow"}` when `WRAPS_STDOUT`, else empty.

Test: `npm test -- --test-name-pattern='Cursor hook'` fails, every failure a missing module or `scaffoldConfig`.

## Step 4 `[worker:medium]`: Cursor hook ops and destination

Files: new `src/targets/cursor/config.ts`; new `src/targets/cursor/hook-ops.ts`.

- `config.ts`: `resolveCursorConfigDestination(kind, scope)` per Decision 4; any kind but `hook` throws (`mcp` comes in
  Phase D). Shaped like `src/targets/codex/config.ts`.
- `hook-ops.ts`: `CURSOR_HOOK_EVENTS` (Decision 1), `CURSOR_TOOL_NAMES` (Decision 2, step 1's edit row), the matcher
  translation (split on `|`, each part a table key, map, dedupe first-seen, join `|`; `*`/absent → none; a matcher
  only on `PreToolUse`/`PostToolUse`), the command line (`nodeEvalCommandLine ?? posixCommandLine` from
  `../shared/hook-command-line`), the stdout wrapper if step 1 kept it (a script prefix registering
  `process.on('exit', code => { if (code === 0) process.stdout.write('{"permission":"allow"}') })`, added before
  base64 encoding), `cursorHookSkipReason(artifact)` (every refusal, as text), and `buildCursorHookOps(artifact,
scope)`, which throws `SigilError(reason)` when there is one, else returns the step 3 case 3 op. Cite
  `CURSOR_HOOKS_DOC` and a new `CURSOR_THIRD_PARTY_HOOKS_DOC` (added here to `doc-refs.ts`:
  `https://cursor.com/docs/reference/third-party-hooks`, verifiedOn `2026-11-01`, covers the event and tool mapping).

Test: step 3 cases 1-7, 9, 10 pass; case 8 still fails.

## Step 5 `[worker:medium]`: wire hooks into the target; skip what can't render

Files: `src/targets/cursor/index.ts`, `src/targets/cursor/capabilities.ts`, new
`src/targets/cursor/aggregate-docs.ts`, `src/types.ts`, `src/select/selection.ts`, `src/select/selector-resolve.ts`.

- `index.ts`: `configScopes` and `scaffoldConfig` as in `src/targets/codex/index.ts`, hook only. Scope descriptions
  `project — .cursor/hooks.json, git-committed`, `user — ~/.cursor/hooks.json, all projects`. `aggregateDocs`.
  `afterInstallHint` adds `Project hooks run only in a trusted workspace.` `configSkipReason = cursorHookSkipReason`
  for hooks. Module comment updated.
- `capabilities.ts`: `hook: { mode: 'native' }`; module comment updated. `CURSOR_HOOKS_DOC.covers` names both files,
  `version: 1`, camelCase events, regex `matcher`, exit 2.
- `aggregate-docs.ts`: `{ source: 'cursor .cursor/hooks.json / ~/.cursor/hooks.json aggregate', doc:
CURSOR_HOOKS_DOC }`, like `codex/aggregate-docs.ts`.
- `types.ts`: optional `Target.configSkipReason?(artifact: ResolvedArtifact): string | undefined` with a doc comment
  (a config artifact this target can't render is skipped with this reason, not an error). `selection.ts`: new
  `SkipCause` `'unrenderable'`. `selector-resolve.ts`: `classifySkippedArtifact` calls it after the platform check and
  returns `skipOf(a, 'unrenderable', reason)`. Pass it the same way `kinds.supported` reaches it (read
  `resolveSelection`'s callers first). Platform-neutral: the pipeline sees only the optional method.

Then `npm run build` (regenerates `docs/reference/capabilities.md`).

Test: all of `cursor-hooks.test.ts`; a new case there: `resolveSelection` for `--target cursor` over a catalog holding a
`Notification` hook puts it in `skipped` with cause `unrenderable` and the reason text; `npm test` passes;
`node dist-cli/cli.js sync --check` passes.

## Step 6 `[worker:medium]`: `sync --check` fails on a catalog hook Cursor can't render

Files: new `src/commands/sync/conformance/rules/hook-target-render.ts`, the rules index beside it, a test next to the
existing conformance rule tests.

For every catalog `hook` and every registered target with `hook` native and a `configSkipReason`, where the hook ships
to that target (`artifactTargetsPlatform`): a reason is an error naming the hook, the target, the reason, and the fix
(`add platforms: [...]` without that target, or change the matcher/event). Follow an existing rule's shape
(`provider-kind-coverage.ts`).

Test: a fixture hook with `event: Notification`, no `platforms` → one error; the same with `platforms: [claude]` → none;
the real catalog → none (`node dist-cli/cli.js sync --check` passes).

## Step 7 `[worker:medium]`: `add` warns when a hook's command isn't on PATH

Files: `src/commands/add/execute-config.ts` (or the add warnings module it uses), a test in
`test/commands/` beside the existing add config tests.

On any target, for a `hook` being installed: when `fm.command` is a bare name (no `/`) not found on `PATH` (look it up
the way the repo already does, or `PATH` split plus `fs.accessSync(X_OK)`; on Windows also `PATHEXT`), print one warning:
`hook <id>: '<command>' is not on PATH here, and a hook that can't start lets every call through`. Never an error: a
project install may run on another machine.

Test: with `PATH` set to an empty temp dir, `add shared/protect-config --target cursor` prints the warning and still
writes the file; with the real `PATH`, no warning.

## Step 8 `[worker:medium]`: `add` notes that Cursor also runs Claude Code hooks

Only if step 1 found `.claude/settings.json` hooks running; otherwise dropped.

Files: `src/targets/cursor/index.ts`; `test/targets/cursor.test.ts`; `src/commands/status-overlaps.ts` only if it
can't report a config kind.

Add `{ kind: 'hook', targets: ['claude'], doc: CURSOR_THIRD_PARTY_HOOKS_DOC }` to `alsoLoads` (no `readerWins`: both
run). Tests: with `shared/protect-config` installed for `claude`, `add shared/protect-config --target cursor` prints the
"loads twice" note naming the hook; installed for `cursor` alone, no note; `status` shows the note.

Test: `npm test -- --test-name-pattern='[Cc]ursor'` passes.

## Step 9 `[worker:medium]`: end-to-end install, uninstall and home backup

Files: `test/targets/cursor-hooks.test.ts` (new `describe('Cursor hook e2e')`).

Through the built CLI in temp dirs, `HOME` pointed at a temp dir:

1. `add shared/protect-config --target cursor` → `.cursor/hooks.json` is `version: 1` plus one `preToolUse` entry,
   matcher `EDIT_MATCHER`.
2. Then `add shared/reviewer-bash-guard --target cursor` → both entries, `version` once.
3. Re-adding `protect-config` the way the Codex e2e test re-adds → still one entry (replaceMerge).
4. `uninstall shared/protect-config --target cursor` → the other entry and `version: 1` remain.
5. Uninstall the other → `.cursor/hooks.json` is gone.
6. `--scope user` over an existing `~/.cursor/hooks.json` with a user hook → both kept, `.sigil.bak` equals the
   original bytes; a second user-scope `add` takes no second backup.
7. A user-written `.cursor/hooks.json` (own `preToolUse` entry, `version: 1`) → after `add` then `uninstall`, equal to
   the original object.

Test: `npm test -- --test-name-pattern='Cursor hook'` passes. A failing case is a bug to report, not a case to weaken.

## Step 10 `[worker:medium]`: docs and changelog

Files: `docs/setup/cursor.md`, `docs/reference/config-kinds.md`, `CHANGELOG.md`.

- `setup/cursor.md`: a Hooks section replacing "Hooks and MCP servers, until later phases": the two files and scopes,
  the event aliases and what is skipped (and why), the matcher translation, trusted workspace, exit 2 denies and other
  failures let the call through, the PATH warning, the stdout wrapper if kept, the double run if step 8 stayed. MCP
  stays "until Phase D".
- `config-kinds.md`: Cursor beside Codex in the opening paragraph and scope table; `.cursor/hooks.json` in the home
  backup section.
- `CHANGELOG.md` `Unreleased`: `Added` Cursor hooks; `Added` the PATH warning and the `unrenderable` skip.

Test: `npx prettier --check docs CHANGELOG.md`; `npm run ci:local` green.

## Step 11 `[inline: live check in Cursor]`: a sigil-installed hook, live

In a fresh scratchpad repo: built CLI `add shared/protect-config --target cursor`, then
`agent -p --trust --output-format stream-json "Create the file .env containing X=1, then create notes.txt containing
ok."`. Expected: no `.env` (the block reason in the stream), `notes.txt` written. Record it in the ADR's Phase C probes
and close its § Hooks section (edit matcher, wrapper, A5 answer).

Test: the two files as stated; the ADR diff.

## Close-out

`workflow-report .`, `/agent-skills:review`, PR, `pr-ready`, merge. Then mark Phase C done in the roadmap and delete
this plan file.
