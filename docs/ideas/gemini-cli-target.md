# Gemini CLI target (evaluation)

## Objective

Decide whether to add a `gemini` target and, if yes, how. Gemini CLI appears in the ADR capability
matrix only as a column, with no phase assigned. The deliverable is an evaluation (what Gemini
extensions and context files can carry, versus sigil's seven kinds) and a go/no-go, followed by a
real brief if go. Install route if built: `sigil add --target gemini`, output Gemini extension and
context files.

## Evidence

- [distribution-channels-2026-09](../decisions/distribution-channels-2026-09.md) section 3 lists a
  "Gemini extension" column (skill, agent preview, prompt as `commands/*.toml`, hook, mcp; rule as
  one always-on context file; settings partial) with a source link, and section 6 has no Gemini
  phase.
- `src/targets/index.ts:19-20` registers only the Claude and Copilot targets; adding one is "one
  new file plus one `registerTarget()` call" (`src/targets/index.ts:3-7`;
  `docs/reference/architecture.md` Extension model).
- Rules map to a single file in Gemini, unlike per-file rules in Claude and Copilot, so aggregation
  logic would resemble Copilot's `AGENTS.md` builder (`src/targets/copilot/build-helpers.ts`).
- No Gemini target code exists under `src/targets/`.

## Out of scope

- Implementation (this brief ends in a decision).
- Codex and Cursor ([codex-target](codex-target.md), [cursor-target](cursor-target.md)).

## Success criteria

- A table of sigil kind versus Gemini mechanism with a current docs link per row, each verified
  against the Gemini CLI docs rather than the ADR's snapshot.
- A recorded go/no-go in `docs/decisions/` with the reasoning (user demand, maintenance cost).
- If go: a follow-up brief with capability rows and conformance implications.
- `npm run ci:local` green (includes `sigil validate` and `sigil sync --check`)

## Riskiest assumption

That demand exists: every added target multiplies conformance and live-probe cost for each catalog
change.

## Open questions

- Gemini TOML commands and `GEMINI.md` need a TOML merge primitive; is that shared with Codex?
- Can Gemini read the `AGENTS.md` that Copilot already gets, making a Gemini target almost free?
- Do Gemini extensions support project-scoped install, or only user scope?
