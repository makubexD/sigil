# Cursor target (2026-11)

Status: Phase A (live probe) done 2026-11-01, on Cursor Agent CLI `2026.10.22-27dcf5f`, Linux. The phases are in
[plan-cursor-target.md](../plan-cursor-target.md); this record holds what the probes found and what each finding
changes.

## How the probes ran

Unlike Codex's probes, these used a real model. Cursor's CLI was signed in on the free plan, and every run was
`agent -p` (print mode) with Cursor's default model (`Auto`) in a fresh `git init` repo built from fixture files, never
in this repo. The budget was one or two runs per question, each asking for a short answer. `--output-format
stream-json` shows each tool call with its arguments and result, which is how most rows below were read.

Two runs needed `--force`, which lets print mode run tool calls that aren't read-only. Claude Code's auto-mode
classifier refused to start those from the session, so the owner ran them by hand (A6 run 2, A7 run 2). The rest ran
from the session.

So this proves what Cursor's CLI loads, what reaches the model, and what blocks a tool call, on one version. It does
not prove anything about the desktop app, Windows, or a workspace without `--trust`: that last case was never run.

## Results

| #   | Question                                             | Observed                                                                                                                                                                                                                                                                 |
| --- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A1  | Do `.mdc` rules load by mode?                        | `alwaysApply: true` loads; a `.md` in `.cursor/rules/` is ignored. A `globs` rule did **not** attach when the prompt named a matching path. **It attaches once the agent reads a matching file** (Phase B run 1: quoted, unquoted and comma-joined `globs` all attached) |
| A2  | Is a `.cursor/skills` skill picked and its ref read? | Yes: picked from its `description`, `references/value.md` read on demand                                                                                                                                                                                                 |
| A3  | Same skill name in `.cursor/` and `.claude/`?        | **One listing, `.cursor` wins** (inferred from the model's listing). Cursor also lists every skill in `~/.claude/skills/` and `~/.claude/plugins/`                                                                                                                       |
| A4  | `preToolUse` payload for a write; does exit 2 deny?  | Exit 2 denies. `tool_input.file_path`, absolute. **The edit's hook call was named `Read`**, a shell write `Shell` with `tool_input.command`                                                                                                                              |
| A5  | Does a `.claude/settings.json` hook run too?         | **Inconclusive.** It never ran, but its `Edit\|Write` matcher matched neither call Cursor made (`Read`, `Shell`)                                                                                                                                                         |
| A6  | `${env:NAME}` in `.cursor/mcp.json` `env`?           | Expanded (`golf-99`). Print mode needs `--approve-mcps` to load the server and `--force` to call it; without `--force` the call fails, exit 0                                                                                                                            |
| A7  | What does a `readonly: true` subagent allow?         | It runs in Ask mode: Write and both Shell calls tried (`touch`, `ls -la`) refused, Glob works                                                                                                                                                                            |
| A8  | Does a local plugin install, and its rule load?      | **Docs-only.** No install command; `marketplace add` takes a git URL. A rule loaded with `--plugin-dir` did not reach the model                                                                                                                                          |

## Skills: a warning, not a refusal

Decision 1 said `add` refuses a `cursor` install that would load a skill twice, unless A3 showed Cursor dedupes by name.
On the model's own listing it did, for the case that matters: with `probe-skill` in both `.cursor/skills/` and `.claude/skills/`, Cursor used the
`.cursor` body and listed the skill once. So in a project with both `claude-code` and `cursor` installed, `add` warns
and goes on (Phase B).

A3 found one more thing. Cursor's listing held every skill in `~/.claude/skills/` and in Claude Code's plugin cache
(`~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/skills/`), and A8 showed the same for those plugins' MCP
servers. Two same-named skills in two different `~/.claude/skills/` folders were both listed, so the `.cursor`-wins
rule is not a general dedupe by name. Phase B should not offer a home-scope `cursor` skill install to a user whose
Claude Code already has sigil's plugin: those skills already reach Cursor.

## Rules: globs need a live check

The `alwaysApply: true` half of Decision 2 is confirmed. The `globs` half is not. Naming `src/app.ts` in the prompt
didn't attach the scoped rule, but the agent never read the file in that run, so the documented behaviour (attach when a
matching file is in context) was never exercised. Decision 2 stands on the docs. Phase B's tests can't settle it; Phase
G's live check must run one prompt that makes the agent read a matching file, and report the scoped rule's codeword.

Phase B run 1 (below) did that in a probe repo: after reading `src/app.ts` the agent reported all three scoped rules'
codewords, so a `globs` rule attaches on a read, quoted or not, and a comma-joined list matches on its second glob. Phase
G still checks it against sigil's own `.mdc` output.

## Hooks: the matcher and A5

Exit 2 denies, and the path is in `tool_input.file_path`, which `protect-config` already reads, so the hook needs no
parser change for Cursor (Phase C's "fix the parser first" doesn't apply). Two results change Phase C:

1. **The edit tool's `preToolUse` call is named `Read`.** When asked to create `.env`, Cursor's edit fired a hook call
   with `tool_name: "Read"` and `tool_input.file_path`, and the block there stopped the edit. Whether a second,
   write-named call would follow is unknown. If Phase C maps Claude's `Edit|Write` matcher to a Cursor matcher such as
   `Write`, the hook may never see an edit. Phase C's RED test must capture an allowed edit's calls (a matcher-less hook
   that logs and exits 0) before it picks a matcher.
2. **A5 is inconclusive.** The `.claude/settings.json` hook never ran, but its matcher was `Edit|Write`, and the only
   calls Cursor made were named `Read` and `Shell`, which match neither, even with the documented `Edit`→`Write`
   mapping. So the run doesn't show whether Cursor ignores Claude hooks or only that the matcher never matched. Phase C
   reruns it with a matcher-less `.claude` hook next to the `.cursor` one and counts the runs.

A shell write (`printf … > .env`) reaches the hook only as `tool_input.command`, the same gap `protect-config` has on
Claude's `Bash`.

## MCP: approval in print mode

`${env:NAME}` is expanded, so Phase D's `EnvSyntax` for Cursor is `${env:NAME}` as documented. A project MCP server is
`not loaded (needs approval)` until approved (`agent mcp enable <id>` or `--approve-mcps`), and in print mode a tool call
also needs `--force`. Without it the call is rejected as `User rejected MCP: …` and the run still exits 0. Phase D's
setup note must say both.

## Agents: `readonly` is tighter than assumed

The roadmap said `readonly: true` "still allows read-only shell and web tools". In this version it doesn't allow shell
at all: the subagent runs in Ask mode, and both shell calls it tried (`touch made.txt`, `ls -la`) and the Write all failed with `You are in ask mode and cannot run
non read-only tools.` Glob worked. That is close to the catalog's `tools: [Read, Grep, Glob]`, which makes Decision 5
safer than it looked. Web tools never came up. This rests on the subagent's own report: its tool calls aren't in the
parent's stream, but the error text is Cursor's.

## Plugins: try the Claude route first

The CLI has no plugin install command, and a rule in a `--plugin-dir` plugin (`.cursor-plugin/plugin.json` plus
`rules/hotel.mdc`, folder discovery) did not reach the model. A8 is docs-only. Since Cursor already loads skills and
MCP from Claude Code's installed plugins, Phase F should first check whether sigil's published Claude marketplace
plugin already works in Cursor, then decide whether a `.cursor-plugin/` build adds anything (rules are what it could
add, and they are what failed here).

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
- **A5: inconclusive.** `hook-claude.log` was never created, but the hook's `Edit|Write` matcher matched neither call
  Cursor made (`Read`, `Shell`), so this doesn't show that Cursor skips `.claude/settings.json` hooks.
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

- **A7 confirmed, and narrower than the roadmap assumed: a `readonly: true` subagent runs in Ask mode, which refused
  both shell calls tried, even `ls -la`, along with Write.** Read-only tools (Glob) work. The roadmap's "it still allows
  read-only shell" is wrong for this version, which makes `readonly: true` a closer fit for `tools: [Read, Grep, Glob]`.
- The subagent's own tool calls are not in the parent's stream-json, so run 2 rests on its report. The error string is
  Cursor's, quoted verbatim.
- In print mode the parent agent rejects state-changing shell commands unless `--force` is given, while plain reads
  (`ls`) run. Web tools never came up.

### A8, plugins

- **The CLI cannot install a plugin.** `agent plugin` has only `marketplace add <gitUrl> | list | remove | update`; there
  is no `install` or `add` for a plugin, and `marketplace add` takes a git URL, not a local folder.
- One run with the documented local-load flag instead: a plugin folder with `.cursor-plugin/plugin.json`
  (`{"name": "probe-plugin", "version": "0.0.1", "description": …}`) and `rules/hotel.mdc` (`alwaysApply: true`,
  HOTEL), folder discovery (no `rules` field). Run: `agent -p --trust --plugin-dir <folder> --output-format stream-json
"List every codeword your rules give you; answer with the words only."` Observed: `(none)`. The agent searched the
  repo, its session memory and the README; neither `HOTEL` nor `probe-plugin` appears anywhere in the stream.
  **A plugin rule loaded with `--plugin-dir` did not reach the model.** Whether the layout or the flag is at fault is
  not settled.
- **Cursor loads Claude Code's installed plugins.** The same run listed and called an MCP server named
  `plugin-context-mode-context-mode`, which is the `context-mode` plugin installed in `~/.claude/plugins/`; A3 showed
  the same for those plugins' skills. Phase F should test whether sigil's published Claude marketplace plugin already
  works in Cursor through this route before designing a `.cursor-plugin/` build.
- A8 is **docs-only** for Phase F: no install path in the CLI, and the one local-load attempt failed.

### Phase B probes

Cursor Agent CLI `2026.10.22-27dcf5f` (`agent --version`), model `Auto`, each run in a fresh `git init` repo from
`mkrepo.sh`. Both runs: `agent -p --trust --output-format stream-json "<prompt>"`, exit 0.

**Run 1, globs on a read.** Fixture: `.cursor/rules/quoted.mdc` (`globs: "**/*.ts"`, BRAVO), `unquoted.mdc`
(`globs: **/*.ts`, ECHO), `joined.mdc` (`globs: "docs/**/*.md,**/*.ts"`, KILO), each `alwaysApply: false` with a
`description`, plus `src/app.ts`. Prompt: `Read src/app.ts, then list every codeword your rules give you; answer with
the words only.`

- Tool calls: one MCP tool lookup (the `context-mode` server from `~/.claude/plugins/`, as in A8), then a read of
  `src/app.ts`. No `.mdc` file was read.
- Answer: `KILO BRAVO ECHO`. **All three attached after the read.** Cursor's parser accepts the unquoted `**/*.ts`
  as well as the quoted one, and a comma-joined value matches on its second glob. Since the agent never opened a
  `.mdc` file, their bodies reached it from the read, not from the descriptions (A1 run 2 showed a described glob rule
  does not attach without one).

**Run 2, `.agents` against `.cursor`.** Fixture: `.cursor/skills/probe-skill/SKILL.md` (answer `ECHO-42`) and
`.agents/skills/probe-skill/SKILL.md` (same name and description, answer `GOLF-3`). Prompt: `What is the probe
checksum? Then list the skills you can use with the path of each SKILL.md.`

- Tool calls: one read, `.cursor/skills/probe-skill/SKILL.md`. No glob this time.
- Answer: `ECHO-42`. The listing named `probe-skill` **once**, under "Repo skill", at `.cursor/skills/probe-skill/`;
  `.agents/skills/` appears nowhere in it. As with A3 (`.claude`), Cursor's own copy wins on a name clash, so the
  `.agents` copy goes unused rather than loading twice. The listing again held every `~/.claude/skills/` and
  `~/.claude/plugins/` skill.
