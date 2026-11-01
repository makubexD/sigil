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
