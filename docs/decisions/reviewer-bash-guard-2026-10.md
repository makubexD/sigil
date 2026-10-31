# Reviewer Bash guard: can a hook see the agent? (spike, 2026-10-28)

Audit row 15 (`docs/audits/2026-10-16/results.md`). The principal's
finding (`evidence/panel/principal.md` §3.3): read-only agents carry Bash, "read-only by instruction, not
sandboxed". A PreToolUse guard scoped to reviewer agents was the candidate, if Claude Code exposes the agent to hooks.

## Verdict: go, route (a)

A project-level PreToolUse hook sees which subagent made the call. No new agent frontmatter is needed.

## Evidence

**Docs** (code.claude.com/docs/en/hooks, read 2026-10-28): `agent_id` is a common input field; SubagentStart and
SubagentStop document `agent_type` as the agent's frontmatter `name`, or the plugin-scoped `plugin:name` for a plugin
agent. The sub-agents page also documents a `hooks:` block in agent frontmatter (route b).

**Probe** (Claude Code 2.1.312, `claude -p --model haiku`, temp project). A `.claude/settings.json` PreToolUse hook on
`Bash` logged its stdin; a project agent `probe-reviewer` (`tools: Bash`) had its own frontmatter PreToolUse logger.
The main session ran `echo main-session`, then the subagent ran `echo from-subagent`.

| Call         | `agent_type`     | `agent_id`          | Hook that fired |
| ------------ | ---------------- | ------------------- | --------------- |
| main session | absent           | absent              | settings        |
| subagent     | `probe-reviewer` | `aaf7215eeae00cd9f` | settings        |

The frontmatter hook (route b) did not fire in this run. Route (a) needs nothing from it, so route (b) was not pursued.

## Decisions

1. **Scope: every read-only agent that carries Bash, not only two families.** 21 language agents say "makes no
   edits" and list Bash: the code-reviewer, security-auditor, architecture-reviewer and api-compat-reviewer families
   (5 languages each) and `angular/ng-template-reviewer`. The owner chose all 21 over the roadmap's 10. A catalog
   test keeps the hook's name pattern and the catalog in step.
2. **Denylist of write-shaped commands, with documented blind spots.** Reviewers are told to run builds, tests,
   linters and audits (`ng build`, `ng test`, `tsc --noEmit`, `eslint`, `npm audit`, `ruff`), so an allowlist would
   block their normal work.
3. **Claude only (`platforms: [claude]`).** Copilot's PascalCase PreToolUse payload has no agent fields
   (`docs/decisions/copilot-hooks-2026-10.md`), so the guard can't tell a reviewer from the main session there.
4. **Plugin-scoped names match too.** A plugin-installed reviewer reports `agent_type` as `plugin:name`; the guard
   strips the prefix. Hooks ship only through `add` (plugin channel `none`), while the agents may come from a plugin.
