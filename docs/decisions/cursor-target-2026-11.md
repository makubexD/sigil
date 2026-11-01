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
