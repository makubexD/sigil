# Plan: the Antigravity target (roadmap)

Phases, not steps. Each phase gets its own step-level plan, `docs/plan-antigravity-target-<phase>.md`, when it starts.
The evidence is the decision record [antigravity-target-2026-11.md](decisions/antigravity-target-2026-11.md) (the
eval, plan [plan-antigravity-eval.md](plan-antigravity-eval.md)). Its verdict is **go, staged, with target id
`antigravity`**. Probe ids (P1-P6, U1-U7) refer to that record's probe log, and V1-V7 to
[target-neutrality-regression-2026-11.md](decisions/target-neutrality-regression-2026-11.md).

## Ground rules

These are [Rules for every target](reference/architecture.md#rules-for-every-target), repeated so each phase plan
starts from them:

1. **The catalog stays provider-neutral.** Every Antigravity difference is resolved in the layer that parses or emits
   it (`KindEmitSpec`, `ToolDialect` and tier table, `ProviderLexicon`, `EnvSyntax`, `McpDialect`, `ConfigKindTable`,
   hook translation, `capabilities.ts`), never in `catalog/`, the zod schema, or `load` / `validate` / `resolve`. A
   difference no layer carries becomes a new neutral concept in its own phase, never a provider field or literal.
2. **Official sources only.** Every claim cites antigravity.google (or the Google Developers Blog). Where the docs and
   `agy` disagree, the binary decides, and the claim is kept by a live probe. Undocumented means undocumented, until a
   probe settles it.
3. **Documented best practices are data:** limits on `KindEmitSpec.limits`, scopes, trust and approval rules in
   `docs/setup/antigravity.md`. sigil's own backup and merge rules hold.

## Capability rows (target for the end of the roadmap)

| Kind     | Scaffold                               | Plugin            | Phase |
| -------- | -------------------------------------- | ----------------- | ----- |
| skill    | native                                 | native            | B, F  |
| rule     | native (`AGENTS.md`, `.agents/rules/`) | native (`rules/`) | B, F  |
| mcp      | native                                 | native            | C, F  |
| agent    | native                                 | native            | D, F  |
| hook     | native, after Phase H                  | native, after H   | E, F  |
| prompt   | none (P3: no argument substitution)    | none              | n/a   |
| settings | none (the CLI owns its settings file)  | none              | n/a   |

## Phases

| Phase | Ships                                                                 | Gate                                                           |
| ----- | --------------------------------------------------------------------- | -------------------------------------------------------------- |
| A     | Setup note: what reaches Antigravity today with no target             | none (P1, P6)                                                  |
| B     | `--target antigravity`: skills and rules                              | P1, P2, U5; scoped rules also need a multi-turn glob probe     |
| C     | MCP in `.agents/mcp_config.json` and the user file                    | P5                                                             |
| D     | Agents in `.agents/agents/`                                           | U3, and tool names re-probed                                   |
| H     | Neutral hook I/O contract, events and matchers, for every hook target | V1, V2; owner signs off the contract                           |
| E     | Antigravity hooks in `.agents/hooks.json`                             | H merged; P4 re-run                                            |
| F     | Antigravity plugin channel, sigil's own builder                       | U7; a probe that an installed plugin's skill reaches a session |
| G     | Live check, the ADR updated, the brief cut, the probe script kept     | B-F merged                                                     |

### Phase A: setup note (done 2026-11-02)

Shipped `docs/setup/antigravity.md` with no code: `sigil add --target agents-standard` (or `codex`) writes
`.agents/skills/` with each skill's rules inlined, and `sigil build` for those targets writes the root `AGENTS.md` with
the repo-wide rules (`add` does not, A1). Antigravity loads both (P1, P2, A1). Nothing written for Claude reaches it
(P6). The page carries the print-mode approval note and the 20,000-token rules budget; MCP's Ask approval waits for
Phase C, since no MCP reaches Antigravity yet. Plan: [plan-antigravity-target-a.md](plan-antigravity-target-a.md).

### Phase B: the target, with skills and rules

- `src/targets/antigravity/`: `index.ts`, `capabilities.ts`, a `ProviderLexicon` (`conventions-file: AGENTS.md`,
  `rules-dir`, `skills-dir`), metadata and `aggregateDocs`, registered with `registerTarget()`.
- Skills: the Agent Skills spec in `.agents/skills/`, which Codex and `agents-standard` also write. `add` must refuse
  the second owner through `Target.sharesSkillFilesWith`, as it does for those two. A second workspace level does not
  shadow the root (U5).
- Rules: repo-wide rules in `AGENTS.md`; other rules in `.agents/rules/<id>.md` with `trigger: always_on`. `trigger:
glob` did not attach in P1's single-turn runs, so scoped rules ship only after a multi-turn probe shows they do.
  Until then a scoped rule is skipped with its reason, or inlined into the skills that use it. The 24,000-byte file
  limit goes on `KindEmitSpec.limits`. `appliesTo` translates in the rule spec, and the rule-globs agreement test
  grows a fourth row.
- Prompts: `none`. Revisit only if a later `agy` substitutes skill arguments (U1, P3).

### Phase C: MCP

`.agents/mcp_config.json` (project) and `~/.gemini/config/mcp_config.json` (user, with the `.sigil.bak` backup) through
a `ConfigKindTable` and an `McpDialect`. `${NAME}` is not expanded (P5), but the server inherits `agy`'s environment,
so an identity entry (`NAME: {sigil:env:NAME}`) is dropped and still works; any other env token is skipped with its
reason.

### Phase D: agents

`.agents/agents/<name>.md`. Tool names come from the binary, not the docs (`read_file` / `write_file` observed,
`view_file` / `write_to_file` documented), through a `names` `ToolDialect` and a tier table (`flash_lite`, `flash`,
`pro`). An agent with no `tools` gets no write tool (U3), so an "all tools" catalog agent must list them. Agent `tools`
is a YAML list (U7: a string makes the loader skip the agent).

### Phase H: neutral hook contract (all hook targets)

The neutral concept the ADR's neutrality table names, and the regression's V1 and V2:

- A named hook input shape that catalog hook bodies read, and an adapter each hook target puts in front of the command
  (identity for Claude, Copilot, Codex and Cursor; a rewrite of `toolCall.name` / `toolCall.args` for Antigravity).
- Matchers in the neutral tool vocabulary (`edit`, `shell`, …), mapped by each target's `ToolDialect`; event names
  with a table per target. Copilot and Codex stop copying Claude names through.
- The three catalog hooks rewritten against it, and a regression test per target that a deny really denies.

This phase touches every hook target, so it ships ahead of Phase E and on its own.

### Phase E: Antigravity hooks

`.agents/hooks.json` and `~/.gemini/config/hooks.json`, named hooks at the top level (U7's validate note), events and
matchers from Phase H's tables. Exit 2 and `{"decision": "deny"}` both deny on `1.4.12` though a docs page says a
non-zero exit fails open (P4), so the regression test keeps checking it.

### Phase F: plugin channel

U7 showed `agy plugin import` of a Claude plugin is not a channel: the skills imported but never reached a print
session, the agent was skipped for a string `tools`, and the hook was never loaded (`hooks/hooks.json` is ignored, and
`Edit|Write` matches no Antigravity tool). So sigil builds the plugin itself: the manifest (closed schema), `skills/`,
`rules/` as files (no inlining needed), `agents/` with list-valued `tools`, `hooks.json` at the root, and
`mcp_config.json` with `variables`. `agy plugin validate --strict` runs on every built plugin as a conformance check.
Before this phase ships, a probe must show an installed plugin's skill reaching a session; if it never does, the
channel stays `none` and this phase is cut.

### Phase G: close-out

A live check of each shipped kind on the current `agy`, the ADR's status updated, the brief
`docs/ideas/antigravity-cli-target.md` deleted and its row removed. The probe fixtures stay as a script, so the probes
re-run in one command on each `agy` update (the ADR's maintenance-cost note).
