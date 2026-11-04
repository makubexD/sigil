---
paths:
  - 'src/targets/**'
  - 'src/tool-vocabulary.ts'
  - 'src/hook-vocabulary.ts'
  - 'src/schema/**'
  - 'src/commands/sync/**'
  - 'catalog/**'
---

# Neutral vocabulary and agent fields

Moved from the root `CLAUDE.md`, which keeps a one-line hard rule for each; this file loads only for the paths above.

- **Never remove `model` / `effort` / `maxTurns` / `isolation` / `skills`** from the `claude:` frontmatter namespace
  on agent `.agent.md` files. Those are Claude Code subagent fields; other adapters skip the namespace. `skills` holds
  catalog skill ids: `validate` checks them (`src/refs.ts`), the adapter emits their names, and `add` warns when one
  is not installed (`src/commands/add/co-install.ts`). Dependencies come only from `uses:`. `claude.model` /
  `claude.effort` override the neutral `model` / `effort` hints on Claude only.
- **Catalog tool names and model hints are neutral** (`read`, `search`, `edit`, `shell`, `web`, `agent`, `todo` in
  `src/tool-vocabulary.ts`; `model: fast | balanced | deep`). A target writes them only through its `ToolDialect`
  (`src/targets/<provider>/tool-dialect.ts`, run by `renderTools` in `src/targets/tool-dialect.ts`) and its tier table
  (`CLAUDE_MODEL_TIERS`). Never copy a neutral or legacy tool name into output unchanged. Provider patterns
  (`Bash(git log:*)`, `mcp__…`) are the one pass-through, verbatim, until a neutral pattern form exists. A spec with no dialect leaves a
  skill's `allowed-tools` out and makes an agent restriction inexact. `legacy-tool-name` fails `sync --check` on a
  provider name in catalog source. (see `docs/decisions/neutral-agent-vocabulary-2026-11.md`)
- **Hook events and matchers are neutral** (`src/hook-vocabulary.ts`); a hook that reads its input is a `script:` and
  gets `input`, built by the target's `HookInputDialect` (`src/targets/hook-input.ts`). Never read a provider's stdin
  field in catalog source; `hook-provider-input` fails `--check`.
- **`appliesTo` stays unchanged in `catalog/` source and the zod schema** — adapters translate it (`paths:` for
  Claude, `applyTo:` for Copilot `.instructions.md` only, `globs:` / `alwaysApply:` for Cursor `.mdc`). Never gate
  that translation on `language`. All four emitters must agree: the Claude scaffold rule spec
  (`targets/claude-code/spec/rule.ts`), the Claude plugin skill spec's inlined rules (`spec/skill.ts`), the Copilot rule
  spec (`targets/copilot/spec/rule.ts`), and the Cursor rule spec (`targets/cursor/spec/rule.ts`, whose `alwaysApply`
  test is `appliesToEveryFile` in `targets/shared/repo-wide-rules.ts`). `test/targets/rule-globs-agreement.test.ts`
  checks Claude, Copilot and Cursor over every catalog rule.
- **Every catalog frontmatter field authored on a whole-file kind must be mapped by at least one provider's
  `KindEmitSpec`**. Both providers default an absent `tools` to all tools, so an unmapped read-only agent `tools`
  field silently grants full write access (see `src/targets/claude-code/spec/agent.ts` and
  `src/targets/copilot/spec/agent.ts`). `declared-but-unemitted`
  (`src/commands/sync/conformance/rules/declared-but-unemitted.ts`) fails `--check`. It is derived from each spec's
  `FieldMapping[]`. Extend `SIGIL_INTERNAL_FIELDS` in that file only for fields that never reach a provider (`tags`,
  `severity`, `uses`, …), never to silence a real gap. (see
  `docs/decisions/frontmatter-audit-and-catalog-sweep-2026-08.md`) An agent's `tools` / `disallowedTools` must also
  reach every target it ships to. `restrictionOutcome` (`src/targets/tool-restriction.ts`) classifies each
  agent and spec pair as `exact`, `nearest` (`toolPolicy: nearest`: written with a warning) or `skip` (absent
  policy means `strict`): `add` and `build` skip that agent with the reason, a direct render still refuses, and
  `tool-restriction-coverage` reports it at `--check`. A `read-only-flag` dialect's nearest mapping narrows unless the
  list holds one of its `writes`. The schema rejects an empty list (it would emit no line,
  which means all tools).
- **Agents have no `whenToUse` frontmatter channel — only `description`**. Skills and prompts dispatch on
  `description` plus `whenToUse`; agents dispatch on `description` alone. `whenToUse:` on an agent is unread at build
  time. Put dispatch-disambiguation in `description`. `declared-but-unemitted` fails `sync --check` if the field is
  authored and unmapped. (see `docs/decisions/catalog-quality-audit-2026-08.md`)
