# Target neutrality regression (2026-11)

Status: audit, 2026-11-01. Step 7 of the Antigravity eval
([antigravity-target-2026-11.md](antigravity-target-2026-11.md)). It checks the five shipped targets
(`claude-code`, `copilot`, `codex`, `agents-standard`, `cursor`) against
[Rules for every target](../reference/architecture.md#rules-for-every-target). Antigravity is not shipped, so it is
out of scope. The fixes below are follow-up work, not part of that plan.

## How it ran

At commit `0622bba`: `sigil sync --check` (exit 0: 0 errors, 47 advisory warnings,
39 `tool-restriction-coverage` and 8 `body-density`), then a grep over `catalog/`, `src/load.ts`, `src/resolve.ts`,
`src/validate/`, `src/schema/` and `src/targets/` for each check below, read by hand. `provider-term-leak` covers only
lexicon literals in whole-file kinds, so product names (`Claude Code`, `Copilot`) and config-kind bodies were grepped
separately.

## What passes

| Check                                              | Result                                                                                                                                                                                                                                                                                                                                        |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Provider branch in `load` / `validate` / `resolve` | None. Provider names appear only in comments (`src/validate/scope-checks.ts:9`, `src/validate/schema-checks.ts:17`). The `claude:` frontmatter namespace (`src/schema/index.ts:199-215`) is the sanctioned extension point                                                                                                                    |
| Kind support declared outside `capabilities.ts`    | None. Every target declares kinds in its `capabilities.ts`. `WRITABLE_PLUGIN_KINDS` is implementation coverage, cross-checked by `test/targets/capabilities.test.ts`                                                                                                                                                                          |
| Official-docs citation for each claim              | Every `KindEmitSpec` has `docs:`, and every target has `aggregateDocs` (`agents-standard` through `AGENTS_STANDARD_AGGREGATE_DOCS`, `src/targets/agents-standard/index.ts:54`). Hosts are the providers' own: `code.claude.com`, `docs.github.com`, `code.visualstudio.com`, `learn.chatgpt.com`, `cursor.com`, `agentskills.io`, `agents.md` |
| Documented limits on `KindEmitSpec.limits`         | The 500-line and listing limits are constants feeding `limits` (`src/targets/*/spec/skill.ts`, `src/targets/cursor/spec/rule.ts:63`, `src/targets/copilot/spec/agent.ts:78`). No rule hard-codes a provider limit. One open question below                                                                                                    |
| Tool names and model hints                         | `legacy-tool-name` passes. Agent tools go through each `ToolDialect`. `agents-standard` keeping Claude-style `allowed-tools` names is a recorded decision (`docs/decisions/neutral-agent-vocabulary-2026-11.md`, decision 6)                                                                                                                  |
| Lexicon literals in whole-file bodies              | `provider-term-leak` passes                                                                                                                                                                                                                                                                                                                   |
| `settings` bodies naming Claude Code               | Allowed: `settings` is Claude-owned (`KindDescriptor.ownedBy`), e.g. `catalog/shared/settings/allow-dev-tools.settings.md:6`                                                                                                                                                                                                                  |
| Claude-only artifacts                              | `mk-check`, `reviewer-bash-guard` and `worker-mode-guard` carry `platforms: [claude]`                                                                                                                                                                                                                                                         |

## Violations

### V1. Hook events and matchers are Claude names in the schema and the catalog

- `src/schema/index.ts:308-316` (`HOOK_EVENTS`) and `:336-340` (`matcher`, "Claude Code `matcher` field").
- `catalog/shared/hooks/protect-config.hook.md:10` (`Edit|Write`), `reviewer-bash-guard.hook.md:10` (`Bash`),
  `worker-mode-guard.hook.md:11` (`Edit|Write|MultiEdit|NotebookEdit`).
- Copilot (`src/targets/copilot/hook-ops.ts:27`) and Codex (`src/targets/codex/hook-ops.ts:70`) copy the matcher
  through. It works today because both accept Claude names: Copilot's PascalCase aliases report them
  (`docs/decisions/copilot-hooks-2026-10.md:28`), and Codex's probe A4 saw `Edit|Write` fire
  (`docs/decisions/codex-target-2026-10.md:22`). Cursor translates through a table (`src/targets/cursor/hook-ops.ts:17-62`).
- `docs/decisions/neutral-agent-vocabulary-2026-11.md:136` says "Each hook target already translates them in its
  `hook-ops.ts`". Only Cursor does.

**Fix.** The neutral-matcher phase the Antigravity ADR proposes (matchers in the neutral tool vocabulary, mapped by each
`ToolDialect`, and neutral event names with a table per target). Until then, correct the line in the vocabulary ADR.

### V2. Hook commands read Claude's stdin

`catalog/shared/hooks/protect-config.hook.md` reads `tool_input` (lines 66-67 describe the Copilot and Codex shapes it
also handles), and `worker-mode-guard.hook.md:47` reads `tool_input.file_path`. All four hook targets send a
Claude-shaped payload, so this holds today, but it is a provider contract in catalog source. Antigravity sends
`toolCall.args.Path` (`docs/decisions/antigravity-target-2026-11.md`, P4), which no current hook reads.

**Fix.** The neutral hook I/O contract (Antigravity ADR, neutrality table), in the same phase as V1.

### V3. MCP bodies list destinations for two targets and ship to four

`provider-term-leak` exempts config kinds (`src/commands/sync/conformance/rules/provider-term-leak.ts:23-28`), and
their prose has gone stale:

- `catalog/shared/mcps/filesystem.mcp.md:7`, `:27-28`; `context-mode.mcp.md:7`, `:21-22`; `maku-jam.mcp.md:7`,
  `:21-22`. Each says "Connects Claude Code (and Copilot)" and lists only those two files, but none sets `platforms`,
  so each also ships to Codex (`.codex/config.toml`) and Cursor (`.cursor/mcp.json`).
- `ado.mcp.md:7`, `:42-43`: `platforms: [claude, copilot, cursor]` (`:24`), and the body leaves Cursor out.

**Fix.** Neutral descriptions ("Connects your AI tool to …"). Drop the per-target destination list from the bodies:
`sigil add` already prints the destination, and `docs/reference/config-kinds.md` holds the scope tables.

### V4. The authoring prompt names two targets as the full set

`catalog/shared/prompts/author-artifact.prompt.md:39` says "Right now that means: Claude Code and GitHub Copilot",
with a two-column kind table at `:46`. Five targets ship. The prompt ships to every target that takes prompts.

**Fix.** Replace the list and table with a pointer to `docs/reference/capabilities.md` (or the `sigil` command that
prints it), so the prompt never goes stale.

### V5. The `feature` skill carries per-provider setup

`catalog/shared/skills/feature/SKILL.md:34-41`, `:50`, and `references/examples.md:3`, `:8`: install commands for
Claude Code and Copilot CLI, and a mode map with Claude Code and VS Code Copilot columns. That is one body with
provider sections, which rule 1 rules out. No lexicon term fits multi-line setup.

**Fix (needs a decision).** Either neutral prose that links the agent-skills project's own setup page per tool, or a
new neutral concept for "install a third-party plugin" with a lexicon term per provider. The first is cheaper and
needs no new layer.

### V6. Two rules give a Copilot-specific reason

`catalog/shared/rules/cli-rules.rule.md:35` and `wizard-rules.rule.md:48`: "Copilot joins applyTo globs with commas,
so brace sets can't be …". The guidance (one glob per extension) is neutral, and only the reason names a provider.

**Fix.** Keep the guidance and reword the reason: "some targets join globs with commas".

### V7. Claude and Copilot hand-roll config dispatch

`src/targets/claude-code/config.ts:82` and `src/targets/copilot/config.ts:38` branch on `kind === 'hook'`. Only Codex
and Cursor set `configKinds`. This is already recorded as known debt (`docs/reference/architecture.md`, Adding a
platform target). It is listed here so the regression has the full picture.

**Fix.** Move both onto a `ConfigKindTable`, as Cursor did.

## Open, not a violation

- **Copilot skill body length.** Four skill specs carry the Agent Skills spec's 500-line body guidance
  (`src/targets/agents-standard/spec/skill.ts:46`). Copilot's (`src/targets/copilot/spec/skill.ts:83`) carries only
  `AGENT_SKILLS_LIMITS`. Add the limit if GitHub's skill docs adopt the spec's guidance. Check those docs first.
- **Copilot instruction-file length.** No instruction-file size limit was found on GitHub's repository instructions
  page
  ([Adding repository custom instructions](https://docs.github.com/en/copilot/how-tos/configure-custom-instructions/add-repository-instructions)).
  None is assumed.
- **`mk-delegate` ships everywhere.** `catalog/shared/skills/mk-delegate/SKILL.md:8` describes a headless Claude Code
  worker, but the skill drives an external CLI (`mk-exec`) any agent can run. Whether to add `platforms: [claude]`, as
  `mk-check` has, is the owner's call.

## Fix list

| #   | Fix                                                      | Where                                                    | Size                 | Status                                    |
| --- | -------------------------------------------------------- | -------------------------------------------------------- | -------------------- | ----------------------------------------- |
| V1  | Neutral hook events and matchers, a table per target     | schema, catalog hooks, each `hook-ops.ts`                | phase                | fixed, `neutral-hook-contract-2026-11.md` |
| V1  | Correct "each hook target already translates them"       | `docs/decisions/neutral-agent-vocabulary-2026-11.md:136` | one line             | fixed, `antigravity-target-2026-11.md`    |
| V2  | Neutral hook I/O contract                                | catalog hooks, each hook target                          | phase (with V1)      | fixed, `neutral-hook-contract-2026-11.md` |
| V3  | Neutral MCP descriptions, no per-target destination list | 4 `catalog/shared/mcps/*.mcp.md`                         | small                | fixed, `antigravity-target-2026-11.md`    |
| V4  | Point the prompt at the capability table                 | `author-artifact.prompt.md`                              | small                | fixed, `antigravity-target-2026-11.md`    |
| V5  | Decide neutral prose or a new concept, then apply        | `feature` skill and its reference                        | decision, then small | fixed, `antigravity-target-2026-11.md`    |
| V6  | Reword the reason                                        | 2 rules                                                  | one line each        | fixed, `antigravity-target-2026-11.md`    |
| V7  | `ConfigKindTable` for Claude and Copilot                 | `claude-code/config.ts`, `copilot/config.ts`             | medium               | open                                      |
