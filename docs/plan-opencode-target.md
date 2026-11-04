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

| Phase | What                                       | Gate       | Probes that cover it |
| ----- | ------------------------------------------ | ---------- | -------------------- |
| A     | Setup note for the free route              | None       | P1, P2, P7           |
| B     | Probe `@opencode/cli`, loader only         | None       | New                  |
| C     | Shared changes in the target layer         | B merged   | None, unit tests     |
| D     | The target: skills, rules, agents, prompts | C merged   | P2, P3, P4           |
| E     | MCP, user scope and the re-run script      | D merged   | P6                   |
| F     | V2 model-backed checks: U1 and U2          | Free quota | P4, plugin           |

## Phase A: setup note

Done on 2026-11-03: [docs/setup/opencode.md](setup/opencode.md), with its commands and variables run live.

`docs/setup/opencode.md`, the home every other tool's setup page has, documents the free route: a full `agents-standard` build carries skills and `AGENTS.md`, while
`sigil add` carries skills with their rules inlined. It states what stays out (agents, prompts, MCP) and P7's two limits
when a Claude install shares the repo: colliding skills and user-only prompts offered to the model, both removed by
`OPENCODE_DISABLE_CLAUDE_CODE_SKILLS`. It also says that no `.env` guard exists on OpenCode through sigil. This ships whatever Phase B finds.

## Phase B: V2 probe

Done on 2026-11-03, loader only: the [V2 run](decisions/opencode-target-2026-11.md#v2-run). OpenCode 2.2.5 loads V1-shaped
skills, commands, agents and MCP, and substitutes arguments as V1 does. Every free model returned `Free usage limit
reached`, so nothing that needs a model reply ran.

**Owner's decision, 2026-11-03: the quota isn't a blocker.** C to E go ahead on this result, and U1 and U2 close in Phase F.
The risk accepted: if V2 doesn't enforce agent permissions, the code still stands for V1 and the setup docs narrow to it.

## Phase C: shared changes

Done on 2026-11-04. All six targets build the same 788 files as `master`, excluding `registry.json`'s timestamp.

Each is target-layer code with no behavior change for existing targets, proven by byte-identical `dist/` output:

1. `McpDialect` gains `stdioType: 'local'`, a `remoteType` that sets a value, `envKey` and `commandForm: 'array'`.
2. `bodyTransform` receives the artifact, for positional arguments from `args:`.
3. A new `opencode-home` `ConfigRoot` that honors `XDG_CONFIG_HOME`, listed in `isHomeScopedRoot`.

The hint in `src/commands/add/read-config.ts:23` stays until Phase E, which adds the first writer it can fire for.

## Phase D: the target

Done on 2026-11-04, with [real output run on V1 and V2](decisions/opencode-target-2026-11.md#sigil-output-run).
Correction to the Summary's figures: 39 agents, but 1 prompt of 2, because `explain-diff` failed the
[quoting run](decisions/opencode-target-2026-11.md#quoting-run).

`src/targets/opencode/` with its capabilities, lexicon and emit specs, per the ADR's capability rows. Implications the step
plan must cover:

- Skills join `sharesSkillFilesWith` in all three peers, never `.opencode/skills/` (P2 showed the winner can change on V1; V2 gave `.opencode` 16 of 16).
- The agent spec writes `permission` in object form for `read`, because P4 returned a `.env` value with `read: allow`.
- The prompt helper maps `{{name}}` to `$<position>` in `args:` order. Only the last argument holds spaces (P3).
  `explain-diff` lists `diff` first, so it needs a quoted diff. On V2 a `"` inside double quotes splits it, and
  `\"` doesn't help, while `'a "b" c'` holds. Test a diff holding `'`, and on V1 too, then say so in the setup docs or
  mark the prompt skipped for this target.
- Until Phase F passes, the setup docs say agent restrictions were seen on V1 only, with hand-written files, not yet on sigil's own files or OpenCode 2. Phase F also checks that `grep` can't return `.env` lines.
- `bodyForbids` covers `` !`cmd` `` and `@file` in prompts.
- Open question: should `add --target opencode` warn when `.claude/skills/` exists? Settle it from P7 in the step plan.

## Phase E: MCP, user scope and re-run

Done on 2026-11-04, with the [Sigil MCP run](decisions/opencode-target-2026-11.md#sigil-mcp-run): 16 of 16 probes on V1 and V2, no model.

The `mcp` kind through an `McpDialect` value and a `ConfigKindTable` entry, writing `.opencode/opencode.json` and the user
`opencode.json` (`.json` only). A `probe:opencode` script, on the model of `scripts/probe-antigravity.mjs`, re-runs the
loader probes on one command. The ADR's Phase 8 row in `distribution-channels-2026-09.md` closes in Phase F.

Correction to the Summary's figures: 3 of 4 servers. `shared/ado` waits on its own plan, which moves it to `azcli` authentication
and opens it to OpenCode.

## Phase F: V2 model-backed checks

Last, and once a free model answers (try one `opencode run` first). It can run before D or E if the quota returns, and it
needs no code. Setup is in the [V2 run](decisions/opencode-target-2026-11.md#v2-run). "Nothing
happened" is never a pass alone.

| Case | Do                                                                             | Pass                                     |
| ---- | ------------------------------------------------------------------------------ | ---------------------------------------- |
| 1    | A skill in `.agents/skills/`, picked by description                            | Its body is used                         |
| 2    | `mode: subagent`, the D3 allow-list, asked through `task` to write a file      | No file, and a control agent writes one  |
| 3    | Same list, `mode: all`, write and shell through `--agent`                      | No file, and a control agent writes one  |
| 4    | Object-form `read` keeping the `.env` rules, read `.env`                       | No value, and the log shows `ask` denied |
| 5    | Same, read `note.txt`                                                          | Text returned                            |
| 6    | Object-form `read` plus `bash: allow`, run `cat .env`                          | Recorded only: V1 returned the value     |
| 7    | Root `AGENTS.md` asks for a closing word; a second repo with `CLAUDE.md` alone | Word in the first, none in the second    |
| 8    | No plugin: ask the model to write `.env`                                       | Whether V2 allows it (U2's control)      |
| 9    | V1 `.opencode/plugins/sigil-hooks.js`, throwing on that write                  | Recorded: skip, warn or fail, and a file |
| 10   | Same plugin, write `ok.txt`                                                    | Recorded: the run still works            |

U1 passes if cases 2 to 5 pass. U2 is cases 8 to 10, recorded only; if the write goes through with no message, that is the
silent guard failure behind `hook: none`, and the ADR says so plainly. If U1 fails, revise the ADR and limit the setup
docs to V1. Then close the ADR's Phase 8 row here, not in Phase E.
