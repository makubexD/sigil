# Cursor target (2026-11)

Status: Phase A (live probe) in progress. This file holds the raw probe log until step 8 of
[plan-cursor-target-a.md](../plan-cursor-target-a.md) shapes it into the decision record.

## Probe log

### Setup

- Cursor Agent CLI `2026.10.22-27dcf5f` (`agent` and `cursor-agent` in `~/.local/bin`), Linux, signed in on the free
  plan.
- Print mode: `agent -p [--output-format text|json|stream-json]`. `-p` "has access to all tools, including write and
  shell".
- Trust and approval flags: `--trust` (trust the workspace without prompting), `--approve-mcps` (approve all MCP
  servers), `-f`/`--force`/`--yolo` (allow commands unless denied), `--auto-review`, `--sandbox enabled|disabled`.
- Read-only modes: `--mode plan|ask` (`--plan`).
- Model: `--model <id>`, `--list-models`, `agent models`.
- Listing: `agent mcp list | list-tools <id> | enable | disable | login`. No command lists rules or skills.
- Plugins: `--plugin-dir <path>` loads a local plugin directory; `agent plugin marketplace add <gitUrl> | list |
remove | update`. No `plugin install` command is listed.
- Every probe runs in a fresh `git init` repo made by a scratchpad helper (`mkrepo.sh <fixture>`), never in this repo.

### A1, rules

Fixture: `.cursor/rules/always.mdc` (`alwaysApply: true`, ALPHA), `scoped.mdc` (`globs: "src/**/*.ts"`,
`alwaysApply: false`, BRAVO), `both.mdc` (same glob plus `description`, `alwaysApply: false`, CHARLIE),
`.cursor/rules/notes.md` (DELTA), and `src/app.ts`. Both runs: `agent -p --trust --output-format json "<prompt>"`.

| Run | Prompt                                                                                             | Observed | Expected              |
| --- | -------------------------------------------------------------------------------------------------- | -------- | --------------------- |
| 1   | `List every codeword your rules give you; answer with the words only.`                             | `ALPHA`  | `ALPHA`               |
| 2   | `I am working on src/app.ts. List every codeword your rules give you; answer with the words only.` | `ALPHA`  | `ALPHA BRAVO CHARLIE` |

- `alwaysApply: true` loads; the `.md` file in `.cursor/rules/` is ignored. Confirmed.
- **Naming a matching path in the prompt does not attach a `globs` rule**, with or without `description`. Neither run
  made a tool call (about 3 s each), so the agent never read `src/app.ts`. Whether a glob rule attaches once the agent
  reads or edits a matching file is **not tested**: the two-run budget was spent. Run 2 also shows the agent did not
  fetch `both.mdc` on its `description`.

### A2 + A3, skills

Fixture: `.cursor/skills/probe-skill/SKILL.md` (description `Use when asked for the probe checksum`, body: read
`references/value.md` and answer with it), `references/value.md` holding `ECHO-42`, and
`.claude/skills/probe-skill/SKILL.md` with the same name and description, body `Answer with FOXTROT-7 only.` Both runs:
`agent -p --trust --output-format stream-json "<prompt>"`; stream-json shows each tool call.

| Run | Prompt                                                                                       | Observed                                                                                          |
| --- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 1   | `What is the probe checksum?`                                                                | `ECHO-42`. Tool calls: read `.cursor/skills/probe-skill/SKILL.md`, then its `references/value.md` |
| 2   | `List the skills you can use, names only. For each one, also give the path of its SKILL.md.` | `probe-skill` listed **once**, at `.cursor/skills/probe-skill/SKILL.md`, under "Workspace"        |

- **A2 confirmed**: the skill was picked from its `description` by the real model (Cursor's `Auto`), and the reference
  was loaded on demand from a relative path.
- **A3: `.cursor` wins, one listing.** Run 1 used the `.cursor` body and never read the `.claude` copy. In run 2 the
  agent globbed `**/SKILL.md`, saw both files, and its reasoning says it listed paths from the prompt's
  `available_skills` section, "include both paths when duplicates exist". It gave one path for `probe-skill` and two
  for other duplicated names (below), so the `.claude` copy was not in `available_skills`. This is inferred from the
  model's output; the raw system prompt is not visible. On this evidence Decision 1's refusal becomes a warning.
- **Cursor also loads Claude Code's user-level skills.** The listing held `~/.claude/skills/**` and every skill under
  `~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/skills/`, next to `~/.cursor/skills-cursor/`. Two
  same-named skills in two different `~/.claude/skills/synced/<id>/` folders were both listed, so dedupe is not purely
  by name: it held for `.cursor` over `.claude` in the project. Consequence: a user who installed sigil's Claude
  plugin already gets its skills in Cursor, so a `cursor` home-scope skill install would double-load them.

### A4 + A5, hooks

Fixture: `.cursor/hooks.json` = `{"version": 1, "hooks": {"preToolUse": [{"command": ".cursor/hooks/guard.sh"}]}}`, no
matcher. `guard.sh` appends its raw stdin to `hook-cursor.log` and exits `2` (message on stderr) when the payload
contains `.env`. `.claude/settings.json` has a `PreToolUse` `Edit|Write` hook appending stdin to `hook-claude.log`, exit 0. Run: `agent -p --trust --output-format stream-json "Create the file .env containing X=1."`

Observed: `.env` was **not** created. The agent tried two routes, and each was blocked:

1. `editToolCall` `{ path: ".env", streamContent: "X=1\n" }` → `rejected`, reason
   `Hook blocked with message: blocked: .env is protected` plus Cursor's own `Agent note: Do not suggest workarounds to
the blocked tool.`
2. `shellToolCall` `printf 'X=1\n' > .env && …` → blocked by the same hook.

`hook-cursor.log` held exactly two payloads. Fields, verbatim (paths shortened):

```json
{"conversation_id": "…", "generation_id": "…", "model": "default", "tool_name": "Read",
 "tool_input": {"file_path": "<repo>/.env"}, "tool_use_id": "…", "session_id": "…",
 "hook_event_name": "preToolUse", "cursor_version": "2026.10.22-27dcf5f", "workspace_roots": ["<repo>"],
 "user_email": "…", "transcript_path": null}
{"…": "…", "tool_name": "Shell", "tool_input": {"command": "printf 'X=1\\n' > .env && cat .env && ls -la .env",
 "cwd": "", "timeout": 30000}, "cwd": "", "…": "…", "transcript_path": "~/.cursor/projects/<slug>/agent-transcripts/<id>/<id>.jsonl"}
```

- **A4: exit 2 blocks, and the path field is `tool_input.file_path`, absolute.** `protect-config` reads
  `tool_input.file_path ?? tool_input.path`, so it would see the file.
- **But the write's hook call reported `tool_name: "Read"`, not `Write` or `Edit`.** The edit tool fired one
  `preToolUse` before writing, named `Read`; the block there stopped it, so whether a second, write-named call follows
  is unknown. Phase C must not map Claude's `Edit|Write` matcher to a Cursor matcher that skips `Read`, or the hook
  never fires on an edit. One run can't settle it; test it in Phase C with a matcher-less hook that exits 0.
- The `Shell` payload carries only `command`. A hook that reads `file_path` sees nothing for a shell write, the same
  gap as on Claude's `Bash`.
- **A5: Cursor did not run the project `.claude/settings.json` hook.** `hook-claude.log` was never created. No double
  runs.
- Trust: with `--trust` the project hook ran without a prompt. A run without `--trust` was not made (budget).

### A6, MCP

Fixture: `.cursor/mcp.json` with server `probe` (absolute `node` path, absolute `server.js` path, `env: {"PROBE_VALUE":
"${env:SIGIL_PROBE}"}`); `server.js` is a dependency-free stdio server with one tool `probe_env`. Tested locally first:
it answers `initialize` and `tools/call`.

- Before any run, `agent mcp list` printed `probe: not loaded (needs approval)`. A project MCP server needs approval
  even in a workspace that is otherwise used with `--trust`.
- Run 1: `SIGIL_PROBE=golf-99 agent -p --trust --approve-mcps --output-format stream-json "Call probe_env and answer
with its result only."` The server started (`getMcpToolsToolCall` returned the tool's schema; `agent mcp list` then
  printed `probe: ready`), but both `mcpToolCall`s were `rejected`: `User rejected MCP: probe-probe_env`.
  `--approve-mcps` approves loading the server, not calling its tools; print mode rejects the call without a prompt.
- Run 2: the same command plus `--force`. Claude Code's auto-mode classifier denied running it from the session, so
  the owner ran it by hand (`agent -p --trust --approve-mcps --force "Call probe_env and answer with its result
only."`, text output). Output: `golf-99`.
- **A6 confirmed: `${env:NAME}` in a project `.cursor/mcp.json` `env` value is expanded** from the CLI's environment.
  Calling a project MCP tool in print mode needs three flags: `--trust`, `--approve-mcps` (load the server) and
  `--force` (allow the call). Without `--force` the call is rejected silently and the run still exits 0.

### A7, read-only subagent

Fixture: `.cursor/agents/reader.md` with `name: reader`, a `description`, `readonly: true`, and a one-line body.

| Run | Command                                                                                                                                                                                                                                              | Observed                                                                                                                                                                                                                                                                                     |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `agent -p --trust` (no `--force`): `Use the reader subagent to create notes.txt containing hi, then run touch made.txt, then run ls, and report what each attempt did.`                                                                              | The `Task` call named `subagentType: {custom: {name: "reader"}}`. The subagent refused without calling a tool: "I'm running as the read-only reader subagent, and Ask mode also forbids writes". The parent ran `touch` (rejected by print mode without `--force`) and `ls` (allowed) itself |
| 2   | `agent -p --trust --force` (run by the owner; the classifier blocks `--force` from the session): `Delegate all of this to the reader subagent and do none of it yourself: it should run touch made.txt, then run ls, then try to create notes.txt …` | The subagent tried all three. `touch made.txt` (Shell), `ls -la` (Shell) and the Write of `notes.txt` each failed with `You are in ask mode and cannot run non read-only tools. Ask the user to switch to agent mode if edits are required.` A Glob of `*` worked                            |

Neither `notes.txt` nor `made.txt` existed after either run.

- **A7 confirmed, and narrower than the roadmap assumed: a `readonly: true` subagent runs in Ask mode, and Ask mode
  blocks every Shell call, even `ls`, along with Write.** Read-only tools (Glob) work. The roadmap's "it still allows
  read-only shell" is wrong for this version, which makes `readonly: true` a closer fit for `tools: [Read, Grep, Glob]`.
- The subagent's own tool calls are not in the parent's stream-json, so run 2 rests on its report. The error string is
  Cursor's, quoted verbatim.
- In print mode the parent agent rejects state-changing shell commands unless `--force` is given, while plain reads
  (`ls`) run. Web tools never came up.
