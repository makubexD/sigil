# Antigravity CLI target (evaluation)

## Objective

Decide whether to add an Antigravity CLI target and, if yes, how. Antigravity CLI (`agy`) is the agent CLI Google
maintains for individual accounts. It replaced Gemini CLI, which stopped serving those accounts on 2026-06-18
([Google Developers Blog](https://developers.googleblog.com/an-important-update-transitioning-gemini-cli-to-antigravity-cli/)).
The deliverable is an evaluation of what Antigravity's project files and plugins can carry, compared with sigil's
seven kinds, ending in a go/no-go. On a go, a phased roadmap follows. The install route if built would be
`sigil add --target antigravity`.

The eval plan was [plan-antigravity-eval.md](../plan-antigravity-eval.md); its verdict is go, staged, and the roadmap is [plan-antigravity-target.md](../plan-antigravity-target.md).

## Evidence

- [distribution-channels-2026-09](../decisions/distribution-channels-2026-09.md) § 3 has a "Gemini extension" column
  from before the transition: skill, agent (preview), prompt as `commands/*.toml`, hook and mcp; rules as one
  always-on context file; settings partial. § 6 has no phase for it. The column needs re-checking against
  Antigravity's docs.
- Google's post says Antigravity CLI keeps Agent Skills, Hooks, Subagents and Extensions (now Antigravity plugins),
  without full parity.
- No target for it exists under `src/targets/`. Adding one is a new folder plus one `registerTarget()` call
  (`docs/reference/architecture.md`, Extension model).
- Rules in Gemini CLI went into one always-on context file, unlike Claude's and Copilot's per-file rules. If
  Antigravity keeps that, its aggregation would resemble Copilot's `AGENTS.md` builder
  (`src/targets/copilot/build-helpers.ts`).

## Out of scope

- Implementation (this brief ends in a decision).
- Gemini CLI as its own target: it now serves only paid API and Enterprise keys.
- Codex and Cursor ([cursor-target](cursor-target.md)).

## Success criteria

- A table of sigil kinds against Antigravity mechanisms, each row checked against Antigravity's official docs, with a
  current docs link.
- A recorded go/no-go in `docs/decisions/` with the reasoning (user demand, maintenance cost).
- If go: a roadmap with capability rows and conformance implications.
- `npm run ci:local` green (includes `sigil validate` and `sigil sync --check`).

## Riskiest assumption

That demand exists: every added target multiplies the conformance and live-probe cost of each catalog change.

## Open questions

- Does Antigravity read the `AGENTS.md` that Copilot and Codex already get, making a target almost free?
- Do commands still use TOML, and does that need a TOML writer shared with Codex?
- Do Antigravity plugins support project-scoped install, or only user scope?
