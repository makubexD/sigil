# Plan: ADR Phase 8, the OpenCode target (roadmap)

Source: [distribution-channels-2026-09](decisions/distribution-channels-2026-09.md) § 6, Phase 8, and the
[OpenCode evaluation](decisions/opencode-target-2026-11.md), which holds the Kind table, the capability rows, the reuse
map, the neutrality table, the probe log and the decision. This roadmap doesn't repeat them.

This is a phase-level roadmap, not a step plan. Each phase is one branch and one PR, and gets a step-level
`docs/plan-opencode-target-<phase>.md` when it starts. A phase that opens with a spike ends the spike in a written
go/no-go, and a recorded no-go counts as done. Every phase follows
[Rules for every target](reference/architecture.md#rules-for-every-target).

Standing procedure: RED first, `npm run ci:local` green, merge on green CI. Close-out per phase: `workflow-report .`,
`/agent-skills:review`, a `CHANGELOG.md` entry, the ADR note updated, and the step plan deleted after merge.

Ban guardrail: never connect Anthropic or Claude in OpenCode, not even for a probe. Live checks use a free OpenCode
model from the isolated home in the ADR's D0, never the owner's `~/.config/opencode/`.

## Summary

The evaluation ended in a staged go. `agents-standard` already reaches OpenCode for skills and repo-wide rules, so the
target's value is 39 agents, 2 prompts and 4 MCP servers. Scope is the scaffold channel only: `hook`, `settings` and
`workflow` stay `none`, and the `plugin` channel stays undefined. No phase changes `catalog/` or the zod schema, and no
new neutral concept is needed.

| Phase | What                                       | Gate           | Probes that cover it |
| ----- | ------------------------------------------ | -------------- | -------------------- |
| A     | Setup note for the free route              | None           | P1, P2, P7           |
| B     | Probe `@opencode/cli`: U1 and U2           | Spike go/no-go | New                  |
| C     | Shared changes in the target layer         | B says go      | None, unit tests     |
| D     | The target: skills, rules, agents, prompts | C merged       | P2, P3, P4           |
| E     | MCP, user scope and the re-run script      | D merged       | P6                   |

## Phase A: setup note

`docs/guides/consuming.md` documents the free route: a full `agents-standard` build carries skills and `AGENTS.md`, while
`sigil add` carries skills with their rules inlined. It states what stays out (agents, prompts, MCP) and P7's two limits
when a Claude install shares the repo: colliding skills and user-only prompts offered to the model, both removed by
`OPENCODE_DISABLE_CLAUDE_CODE_SKILLS`. It also says that no `.env` guard exists on OpenCode through sigil. This ships whatever Phase B finds.

## Phase B: V2 probe

A spike. Install `@opencode/cli` beside V1 without touching the global install, in the same isolated home, and repeat P2,
P3, P4 and P6 in V1 shape. U1 is the gate: if agents, commands or MCP don't load, the ADR's decision is revised and the
work ends at Phase A. U2 is recorded only, because it decides whether hooks can ever ship and doesn't gate the target.

## Phase C: shared changes

Each is target-layer code with no behavior change for existing targets, proven by byte-identical `dist/` output:

1. `McpDialect` gains `stdioType: 'local'`, a `remoteType` that sets a value, `envKey` and `commandForm: 'array'`.
2. `bodyTransform` receives the artifact, for positional arguments from `args:`.
3. A new `opencode-home` `ConfigRoot` that honors `XDG_CONFIG_HOME`, listed in `isHomeScopedRoot`.

The hint in `src/commands/add/read-config.ts:23` gets a target-aware word for a commented `.json` file, or stays, as the
step plan decides from the reuse map.

## Phase D: the target

`src/targets/opencode/` with its capabilities, lexicon and emit specs, per the ADR's capability rows. Implications the step
plan must cover:

- Skills join `sharesSkillFilesWith` in all three peers, never `.opencode/skills/` (P2 showed the winner can change).
- The agent spec writes `permission` in object form for `read`, because P4 returned a `.env` value with `read: allow`.
- The prompt helper maps `{{name}}` to `$<position>` in `args:` order. Only the last argument holds spaces (P3).
  `explain-diff` lists `diff` first, so it needs a quoted diff. Test a real diff holding `"` before shipping it, and say
  so in the setup docs, or mark the prompt skipped for this target.
- `bodyForbids` covers `` !`cmd` `` and `@file` in prompts.
- Open question: should `add --target opencode` warn when `.claude/skills/` exists? Settle it from P7 in the step plan.

## Phase E: MCP, user scope and re-run

The `mcp` kind through an `McpDialect` value and a `ConfigKindTable` entry, writing `.opencode/opencode.json` and the user
`opencode.json` (`.json` only). A `probe:opencode` script, on the model of `scripts/probe-antigravity.mjs`, re-runs the
loader probes on one command. Close the ADR's Phase 8 row in `distribution-channels-2026-09.md` here.
