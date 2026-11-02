# A provider-neutral agent vocabulary (2026-11-01)

Roadmap: [plan-cursor-target.md](../plan-cursor-target.md) § Phase N, Decision 7. Step plan:
[plan-cursor-target-n.md](../plan-cursor-target-n.md). Steps 7-9 of that plan take their tables from this record.

## Problem

The catalog writes Claude Code's tool names (`Read`, `Grep`, `Bash`, …) in agent `tools` and skill `allowedTools`,
although the schema calls the field "vendor-neutral … adapters map these". Claude and Copilot accept the names, but the
shared skill mapping (`allowedToolsMapping`, `targets/shared/skill-sections.ts`) copies them unchanged into the
agents-standard, Codex and Cursor skills. In a Cursor or Codex skill they are a leak. Model hints exist only as
Claude's `claude.model` / `claude.effort`.

Catalog today: 39 agents with `tools: [Read, Grep, Glob, Bash]` (10 add `Edit`, 5 of those `Write`) and no
`disallowedTools`; 41 skills whose `allowedTools` use
`Read` (41), `Bash` (39), `Write` (24), `Glob` (22), `Edit` (21), `Grep` (17); 3 agents with a `claude:` hint
(`model: sonnet`, `effort: medium`, `maxTurns: 10`).

## Sources (all read 2026-11-01)

Each source already has a DocRef; no new constant is needed.

| Source                                                                                                                                | DocRef                                     |
| ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| [Copilot custom agents configuration](https://docs.github.com/en/copilot/reference/custom-agents-configuration)                       | `COPILOT_AGENTS_DOC` (`doc-refs.ts`)       |
| [Copilot add skills](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/customize-cloud-agent/add-skills) | `COPILOT_AGENT_SKILLS_DOC`                 |
| [Claude Code skills](https://code.claude.com/docs/en/skills)                                                                          | `CLAUDE_SKILLS_DOC`                        |
| [Claude Code subagents](https://code.claude.com/docs/en/sub-agents)                                                                   | `CLAUDE_AGENTS_DOC`                        |
| [Agent Skills specification](https://agentskills.io/specification)                                                                    | `AGENT_SKILLS_SPEC_DOC`                    |
| [Codex skills](https://developers.openai.com/codex/skills) (serves the same "Build skills" page)                                      | `CODEX_SKILLS_DOC` (`codex/doc-refs.ts`)   |
| [Cursor skills](https://cursor.com/docs/context/skills)                                                                               | `CURSOR_SKILLS_DOC` (`cursor/doc-refs.ts`) |
| [Cursor subagents](https://cursor.com/docs/context/subagents)                                                                         | `CURSOR_SUBAGENTS_DOC`                     |

### What each says

**Copilot custom agents**, § Tool aliases: "All aliases are case insensitive."

| Primary alias | Compatible aliases                           |
| ------------- | -------------------------------------------- |
| `execute`     | `shell`, `Bash`, `powershell`                |
| `read`        | `Read`, `NotebookRead`                       |
| `edit`        | `Edit`, `MultiEdit`, `Write`, `NotebookEdit` |
| `search`      | `Grep`, `Glob`                               |
| `agent`       | `custom-agent`, `Task`                       |
| `web`         | `WebSearch`, `WebFetch`                      |
| `todo`        | `TodoWrite`                                  |

`tools`: "If unset, defaults to all tools." `model`: "If unset, inherits the default model." There is no denylist field.

**Copilot skills**: "you can use the `allowed-tools` field to list the tools Copilot may use without asking for
confirmation each time. If a tool is not listed in the `allowed-tools` field, Copilot will prompt you for permission
before using it." The example is `allowed-tools: shell`, followed by a warning: "Only pre-approve the `shell` or `bash`
tools if you have reviewed this skill and any referenced scripts, and you fully trust their source."

**Claude Code skills**, § Pre-approve tools for a skill: "The `allowed-tools` field grants permission for the listed
tools during the turn that invokes the skill … The grant clears when you send your next message … It does not restrict
which tools are available: every tool remains callable, and your permission settings still govern tools that are not
listed."

**Claude Code subagents**: "use the `tools` field as an allowlist or the `disallowedTools` field as a denylist. If both
are set, `disallowedTools` is applied first, then `tools` is resolved against the remaining pool." `model`: "use one of
the available aliases: `sonnet`, `opus`, `haiku`, or `fable`", a full model ID, or `inherit`. Subagents are invoked
through the Agent tool.

**Agent Skills specification**, § `allowed-tools`: "A space-separated string of tools that are pre-approved to run.
Experimental. Support for this field may vary between agent implementations." Example:
`allowed-tools: Bash(git:*) Bash(jq:*) Read`.

**Codex skills**: `SKILL.md` carries `name` and `description`; options go in `agents/openai.yaml` (`interface`,
`policy.allow_implicit_invocation`, `dependencies.tools` for MCP servers). The page has no `allowed-tools`.

**Cursor skills**, § Frontmatter fields: `name`, `description`, `paths`, `disable-model-invocation`, `icon`, `color`,
`metadata`. No `allowed-tools`.

**Cursor subagents**, § Configuration fields: `name`, `description`, `model` (default `inherit`), `readonly` ("If
`true`, the subagent runs with restricted write permissions (no file edits, no state-changing shell commands)"),
`is_background`. No tool list. § Model configuration: `inherit` "Uses the same model as the parent agent. This is the
default", or "A specific model ID".

## The vocabulary

Neutral tool names: `read`, `search`, `edit`, `shell`, `web`, `agent`, `todo`. These are Copilot's primary aliases,
with `shell` in place of `execute`. Legacy (Claude) names stay accepted for now and map through Copilot's alias table:
`Read`, `NotebookRead` → `read`; `Grep`, `Glob` → `search`; `Edit`, `MultiEdit`, `Write`, `NotebookEdit` → `edit`;
`Bash`, `execute`, `powershell` → `shell`; `WebSearch`, `WebFetch` → `web`; `Task`, `Agent`, `custom-agent` →
`agent`; `TodoWrite` → `todo`.

Agents also get `toolPolicy: strict | nearest` (absent = `strict`), `model: fast | balanced | deep` and
`effort: low | medium | high`.

## Per-target table

| Field                   | Claude                                                                                                                      | Copilot                                                                       | agents-standard                   | Codex     | Cursor (Phase E)                      |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------- | --------- | ------------------------------------- |
| agent `tools`           | `read`→Read, `search`→Grep+Glob, `edit`→Edit+Write, `shell`→Bash, `web`→WebFetch+WebSearch, `agent`→Agent, `todo`→TodoWrite | `read`, `search`, `edit`, `execute`, `web`, `agent`, `todo` (primary aliases) | no agents                         | no agents | `readonly: true` iff ⊆ {read, search} |
| agent `disallowedTools` | same names                                                                                                                  | not carried (no denylist field: inexact)                                      | —                                 | —         | `readonly: true` iff ⊇ {edit, shell}  |
| skill `allowedTools`    | same names                                                                                                                  | `read`, `search`, `edit`, `shell`, `web` (the skills doc's own `shell`)       | Claude-style names (spec example) | left out  | left out                              |
| `model` tier            | `fast`→haiku, `balanced`→sonnet, `deep`→opus                                                                                | left out (inherits)                                                           | —                                 | —         | left out (`inherit`)                  |
| `effort`                | as written                                                                                                                  | left out                                                                      | —                                 | —         | left out                              |

Claude's agent rendering of today's catalog is unchanged: `read` + `search` render back to `Read, Grep, Glob`.

## Decisions

The owner delegated these choices on 2026-11-01. Each was checked against the sources above.

1. **Coarse neutral names, so a few skill pre-approvals widen.** `search` is Grep _and_ Glob, and `edit` is Edit _and_
   Write. On Claude, a skill that listed only `Grep` also pre-approves `Glob`, and one with only `Edit` also
   pre-approves `Write`. Acceptable: per Claude's skills doc, `allowed-tools` grants permission for one turn, restricts
   nothing, and permission settings still govern the rest. Grep and Glob are both read-only, and Copilot's own table
   treats Edit and Write as one tool. On agents, the 5 `*-debugger` agents list `Edit` without `Write`, so on Claude
   they gain `Write` (found 2026-11-01 in plan step 7). Acceptable: each already has `Bash`, which writes files, so
   no agent gains a capability.
2. **`shell`, not `execute`.** `shell` is Copilot's own skill example and a compatible agent alias, Cursor's word in
   `readonly`, and Codex's. Copilot agents still get `execute`, their primary alias.
3. **Family defaults are checked, not inherited.** A family in `catalog/standard.yaml` may declare default tools and
   policy; `family-tools` fails `sync --check` on a member that differs, unless the family lists it in
   `toolExceptions`. Inheriting at resolve time would make consumer commands read `standard.yaml`, which the
   family-skeleton invariant forbids, and an artifact file would stop saying what ships.
4. **Absent `toolPolicy` means `strict`** (fail closed). A target that can't express an agent's restriction exactly
   skips the agent with a reason; `nearest` writes the closest mapping and warns. Every agent family today is a
   read-only reviewer, so this changes no output.
5. **Model tiers map only where the provider has stable aliases.** Claude documents `haiku` / `sonnet` / `opus`.
   `fable` gets no tier: the docs place it in no cost/strength order. Copilot takes vendor model ids and Cursor
   defaults to `inherit`, so both leave the line out until a tier table is chosen as data. `claude.model` /
   `claude.effort` stay as Claude-only overrides that win over the neutral hints.
6. **agents-standard skills keep Claude-style `allowed-tools` names**, the convention in the spec's own example. Codex
   and Cursor leave the field out: neither documents it, and a missing pre-approval only adds prompts.
7. **Scoped shell patterns are deferred.** Claude (`Bash(git *)`) and the spec (`Bash(git:*)`) allow them, and no
   catalog skill uses one. A later `shell(<pattern>)` neutral form can map to both.

## Out of scope

Hook `matcher`s (`Edit|Write`, `Bash`) are Claude names too. Each hook target already translates them in its
`hook-ops.ts`; moving them to the neutral vocabulary is a follow-up.
