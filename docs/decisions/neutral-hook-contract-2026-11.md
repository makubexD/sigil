# A provider-neutral hook contract (2026-11-02)

Status: accepted. Roadmap: the Antigravity target's Phase H. The implementation took its tables from this record.

## Context

[target-neutrality-regression-2026-11.md](target-neutrality-regression-2026-11.md) found two leaks in the `hook` kind:

- **V1.** `event` and `matcher` are Claude Code's names, in the zod schema and in all three catalog hooks
  (`Edit|Write`, `Bash`, `Edit|Write|MultiEdit|NotebookEdit`). Claude, Copilot and Codex copy the matcher through.
  Only Cursor translates it, with a table of its own.
- **V2.** The hook scripts read Claude's stdin (`tool_input.file_path`, `tool_name`, `agent_type`), and
  `protect-config` also parses Copilot's raw `apply_patch` string and Codex's `tool_input.command` patch. That puts
  three provider contracts in one catalog file. Antigravity sends `toolCall.name` / `toolCall.args.Path`
  ([antigravity-target-2026-11.md](antigravity-target-2026-11.md) P4), which none of them reads.

This record supersedes Decision 2 of [copilot-hooks-2026-10.md](copilot-hooks-2026-10.md) ("keep `event` as authored").

## Sources

Checked 2026-11-02:

- Claude: [Hooks reference](https://code.claude.com/docs/en/hooks) (events, matcher rules, "for tool events, that
  field is `tool_name`") and the [tools reference](https://code.claude.com/docs/en/tools-reference) (tool names).
- Copilot: [hooks reference](https://docs.github.com/en/copilot/reference/hooks-configuration), "Claude-format
  matchers" and its runtime → Claude tool name table, and the VS Code compatible inputs per event.
  [VS Code agent hooks](https://code.visualstudio.com/docs/copilot/customization/hooks) reads the same files.
- Codex: [Hooks](https://learn.chatgpt.com/docs/hooks), "Matcher patterns" and "Tool coverage".
- Cursor: [Hooks](https://cursor.com/docs/agent/hooks) ("Available matchers by hook") and
  [Third-party hooks](https://cursor.com/docs/reference/third-party-hooks) (Claude → Cursor event and tool mapping).
- Probes: Copilot ADR (the `apply_patch` live check), Codex ADR A4, Cursor ADR A4 and Phase C run 1, Antigravity ADR P4.

## Decisions

### 1. Neutral events

Kebab-case like the rest of the neutral vocabulary (`src/hook-vocabulary.ts`), one table per target:

| Neutral         | Claude             | Copilot (PascalCase alias) | Codex              | Cursor               | Antigravity    |
| --------------- | ------------------ | -------------------------- | ------------------ | -------------------- | -------------- |
| `before-tool`   | `PreToolUse`       | `PreToolUse`               | `PreToolUse`       | `preToolUse`         | `PreToolUse`   |
| `after-tool`    | `PostToolUse`      | `PostToolUse`              | `PostToolUse`      | `postToolUse`        | `PostToolUse`  |
| `prompt-submit` | `UserPromptSubmit` | `UserPromptSubmit`         | `UserPromptSubmit` | `beforeSubmitPrompt` | refused        |
| `session-start` | `SessionStart`     | `SessionStart`             | `SessionStart`     | `sessionStart`       | `SessionStart` |
| `stop`          | `Stop`             | `Stop`                     | `Stop`             | `stop`               | `Stop`         |
| `subagent-stop` | `SubagentStop`     | `SubagentStop`             | `SubagentStop`     | `subagentStop`       | refused        |
| `notification`  | `Notification`     | refused                    | refused            | refused              | refused        |

Evidence per column:

- **Claude.** Every name is a documented hook event.
- **Copilot.** The reference gives a VS Code compatible (snake_case) input for `PreToolUse`, `PostToolUse`,
  `UserPromptSubmit`, `SessionStart`, `agentStop / Stop` and `subagentStop / SubagentStop`. The last two are new since
  the Copilot ADR, which refused them for lack of a documented alias. The `notification` input mixes camelCase fields
  with `hook_event_name: "Notification"` and has no compatible form, so it stays refused.
- **Codex.** The documented event list has no notification event.
- **Cursor.** The third-party mapping, where `Notification` is "No".
- **Antigravity.** The hooks page lists `SessionStart`, `PreToolUse`, `PostToolUse`, `PreInvocation`,
  `PostInvocation` and `Stop`. `PreInvocation` fires before every model call, not once per prompt, so `prompt-submit`
  is refused; there is no subagent-stop or notification event. E1 saw `SessionStart`, `PostToolUse` and `Stop` fire,
  and a `Stop` hook's exit 2 did not keep the session going.

The seven PascalCase names stay accepted as legacy aliases (`LEGACY_HOOK_EVENT_ALIASES`), so an overlay catalog keeps
loading. `legacy-tool-name` fails `sync --check` on one in catalog source, and `--apply` rewrites it. Cursor's extra
keys (`SessionEnd`, `PreCompact`, `SubagentStart`) are not in the schema and leave its table.

### 2. Neutral matchers

A matcher is `*` (every tool), or neutral tool names joined with `|` (`edit`, `shell|edit`). Legacy aliases (`Edit`,
`Bash`, …) are accepted and flagged like events. Anything else (a regex, `mcp__.*`, an unknown name) is a schema
error. No catalog hook needs MCP matching, and a provider pattern can't mean the same thing on four targets.

Each target renders the matcher through its own hook tool table, a `names` `ToolDialect` named
`<P>_HOOK_TOOL_DIALECT`, separate from its agent dialect. Cursor's agent dialect is a read-only flag, and Antigravity's
hook calls report `write_file` where its agents take `write_to_file`.

| Neutral  | Claude                          | Copilot (PascalCase)    | Codex           | Cursor                  | Antigravity (Phase E)                                                                            |
| -------- | ------------------------------- | ----------------------- | --------------- | ----------------------- | ------------------------------------------------------------------------------------------------ |
| `read`   | `Read`                          | `Read`                  | none            | `Read`                  | `view_file`, `read_file`                                                                         |
| `search` | `Grep`, `Glob`                  | `Grep`, `Glob`          | none            | `Grep`                  | `grep_search`, `find_by_name`, `list_dir`                                                        |
| `edit`   | `Edit`, `Write`, `NotebookEdit` | `Edit`, `Write`         | `Edit`, `Write` | `Write`, `Delete`       | `write_to_file`, `replace_file_content`, `multi_replace_file_content`, `write_file`, `edit_file` |
| `shell`  | `Bash`, `PowerShell`            | `Bash`                  | `Bash`          | `Shell`                 | `run_command`                                                                                    |
| `web`    | `WebFetch`, `WebSearch`         | `WebFetch`, `WebSearch` | none            | `WebFetch`, `WebSearch` | `search_web`, `read_url_content`                                                                 |
| `agent`  | `Agent`                         | `Agent`                 | `Agent`         | `Task`                  | `invoke_subagent`                                                                                |
| `todo`   | `TodoWrite`                     | `TodoWrite`             | `update_plan`   | none                    | none                                                                                             |

Evidence per column, and what changed from the plan's starting table:

- **Claude.** The tools reference lists each name. `PowerShell` is its own tool (added to `shell`); `MultiEdit` is
  not listed, so it is neither rendered nor mapped. `edit` gains `NotebookEdit`, so `protect-config` and
  `worker-mode-guard` also match notebook writes.
- **Copilot.** The "Claude tool name" table: `bash`/`powershell` → `Bash`, `view` → `Read`, `create` → `Write`,
  `edit`/`str_replace_editor`/`apply_patch` → `Edit`, `grep`/`rg` → `Grep`, `glob` → `Glob`, `web_fetch` → `WebFetch`,
  `web_search` → `WebSearch`, `update_todo` → `TodoWrite`, `task` → `Agent` ("the literal `Task` is also accepted").
  `search`, `web`, `agent` and `todo` move from none to these names. Copilot's own `PowerShell` maps to `Bash`, so
  `shell` stays `Bash`.
- **Codex.** "Tool coverage": shell and unified exec "match as `Bash`"; `apply_patch` matches as `apply_patch`,
  `Edit` or `Write`; "`spawn_agent` also matches `Agent`"; `update_plan` is a local function tool matched by name;
  hosted tools such as `WebSearch` never reach a hook. Codex has no read or search tool. `agent` and `todo` move from
  none to `Agent` and `update_plan`.
- **Cursor.** The hooks page lists `Shell`, `Read`, `Write`, `Grep`, `Delete`, `Task` for `preToolUse`. The
  third-party mapping adds `WebFetch` and `WebSearch`, and maps `Edit` to `Write` (`Glob`: "No"). `Delete` changes a
  file, so `edit` gains it. A4 confirmed `Write` live.
- **Antigravity.** The hooks page lists the documented names; a default session reports `read_file`, `write_file`
  and `edit_file` instead (P4, E1), and an agent whose `tools` name the documented ones calls those (D1). A matcher
  naming one set lets the other through, so `read` and `edit` name both. No task-list tool is documented or seen.

A matcher naming a tool the target's table has no entry for is refused with its reason, never rendered narrower. A
guard that matches fewer calls than authored looks active and lets the rest through. `*` writes `*` (Cursor: no
`matcher` key).

### 3. The input contract (v1)

A hook that reads its input is authored as `script:`, the body of a Node.js function sigil calls with one argument:

```ts
interface HookInput {
  event: HookEvent; // the neutral event that fired
  tool?: NeutralTool; // tool events only; undefined when the provider's tool has no neutral name
  files: string[]; // every path the call names: path fields, then patch headers; deduped, as sent
  command?: string; // the shell command, only when tool is 'shell'
  agent?: string; // the subagent type, when the provider reports one
  cwd?: string;
}
```

`input` is `undefined` when stdin is not JSON or not an object; the script decides whether that fails open. A script
denies by setting `process.exitCode = 2` and writing the reason to stderr. Every hook target denies on exit 2: Claude
(hooks reference), Copilot (fail-closed on exit 2), Codex ("exit code `2` and write the blocking reason to
`stderr`"), Cursor (third-party "Exit code 2 blocking", A4), Antigravity (P4). A stdout decision object is a provider
contract and is not part of v1. `command` / `args` stay for hooks that read no input; they get the provider's raw
stdin, and `hook-provider-input` fails `sync --check` when one names a provider input field. Exactly one of `script`
and `command` is set; `args` needs `command`.

The roadmap planned identity for Claude, Copilot, Codex and Cursor. Those four send Claude-like JSON, but the tool
names (`Edit`, `apply_patch`, `Shell`) and the patch carriers differ, so every target gets a mapping and the four
differ only in data.

### 4. One normalizer, one `HookInputDialect` per target

`src/targets/hook-input.ts` holds `normalizeHookInput(raw, dialect, event)` and the `HookInputDialect` shape (the
`McpDialect` pattern: a new target supplies a value, never its own builder). `toolNames` is the inverted hook tool
table plus names a provider reports that no matcher writes (Codex `apply_patch` → `edit`, `spawn_agent` → `agent`;
Copilot `Task` → `agent`). The function is self-contained and embedded in the installed script with
`Function.prototype.toString`, so the unit-tested function is the shipped one. Patch headers use `protect-config`'s
current regex.

| Target      | Tool / arguments                  | Path fields                          | Command       | Patch                                          | Agent        |
| ----------- | --------------------------------- | ------------------------------------ | ------------- | ---------------------------------------------- | ------------ |
| Claude      | `tool_name` / `tool_input`        | `file_path`, `path`, `notebook_path` | `command`     | none                                           | `agent_type` |
| Copilot     | `tool_name` / `tool_input`        | `file_path`, `path`                  | `command`     | `Edit`, `Write`, `apply_patch`: the raw string | none         |
| Codex       | `tool_name` / `tool_input`        | none                                 | `command`     | `apply_patch`, in `command` (A4)               | `agent_type` |
| Cursor      | `tool_name` / `tool_input`        | `file_path`                          | `command`     | none                                           | none         |
| Antigravity | `toolCall.name` / `toolCall.args` | `TargetFile`, `Path`, `AbsolutePath` | `CommandLine` | none                                           | none (E1)    |

### 5. Script rendering

The installed command is `node -e <composed>`: the normalizer source, the dialect and neutral event as JSON
literals, a stdin reader, and `(function (input) { <script> })(normalized)`. Claude and Copilot write it in exec form
(`command: node`, `args` / `exec` + `args`). Codex, Cursor and Antigravity use `nodeEvalCommandLine` (base64, no shell quoting;
Codex A3 refuses `args`).

### 6. Scope

Claude, Copilot, Codex and Cursor, both scaffold and the Claude plugin (`hookFragment` is shared). Hook kind support
rows don't change. Amended by Phase E ([antigravity-target-2026-11.md](antigravity-target-2026-11.md), probe E1):
Antigravity renders hooks on the scaffold channel, and its hook kind row turned native.

## Consequences

- Every installed hook's command changes once. `sigil status` shows them outdated, and `sigil update` replaces them
  (`replaceMerge`). The CHANGELOG says so.
- An overlay catalog with a regex or MCP matcher fails validation; one with PascalCase events or Claude tool names
  still loads and is flagged by `sync --check`.
- Copilot gains `stop` and `subagent-stop` hooks and matchers for `search`, `web`, `agent` and `todo`, from the docs
  alone. They are unprobed, like the `PreToolUse` alias was before the owner's live check.
- VS Code's legacy "Local" hook parser ignores matcher values (VS Code hooks page, "Existing Local hooks"), so there a
  `before-tool` hook runs for every tool. The composed script re-checks the authored matcher against `input.tool`
  (plan step 6), so a `script` hook keeps its meaning there; a `command` hook still runs on every tool.
- Live deny check (plan step 15, 2026-11-02, Linux, `sigil add shared/protect-config` into a scratch git repo, then
  the agent in print mode asked to write `.env`):

  | Agent                      | Result                                                                                 |
  | -------------------------- | -------------------------------------------------------------------------------------- |
  | Claude Code (`claude -p`)  | Passed: no `.env`; the reply quotes `sigil-hook: blocked write to protected file .env` |
  | Copilot CLI 1.0.105 (`-p`) | Not checked: the CLI ran no repo hook (see below)                                      |
  | Codex CLI 0.166.0          | Not checked: not signed in                                                             |
  | Cursor CLI 2026.10.22      | Not checked: account usage limit reached                                               |

  Copilot CLI wrote `.env`, but it ran no hook from `.github/hooks/` at all: two plain recorder hooks beside sigil's
  (`PreToolUse` with `command`, `preToolUse` with `bash`, each appending stdin to a file) never fired either, in three
  sessions, one after the folder was opened interactively. Every session logs `Failed to reload managed hooks after
enabling managed settings {"error":"no hook session for session id …"}`. So the CLI did not load repo hooks in this
  setup; this is not a sigil payload gap. Fed directly, the installed Copilot command exits 2 for every payload
  shape Copilot is documented or logged to send (`Edit` / `Write` / `create` objects and the raw `apply_patch`
  string), and `test/hooks/deny-contract.test.ts` runs that check in CI. Copilot's live deny (last passed on CLI
  1.0.105 on 2026-10-30, `docs/decisions/copilot-plugin-channel-2026-10.md`) stays owed: rerun when the CLI loads
  repo hooks again.
