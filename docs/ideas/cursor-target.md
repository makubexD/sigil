# Cursor target

## Objective

Add a `cursor` target so `sigil add --target cursor` and `sigil build --target cursor` deliver the
catalog to Cursor. Planned in
[distribution-channels-2026-09](../decisions/distribution-channels-2026-09.md) (section 6, Phase 6:
`.cursor/rules/*.mdc`, agents, commands, hooks, MCP, and the Cursor plugin, the one format that
carries rules; matrix in section 3). This brief does not restate it.

## Evidence

- `src/targets/index.ts:19-20` registers only the Claude and Copilot targets; there is no
  `src/targets/cursor/`.
- Rules are the kind other targets cannot carry in a plugin; Cursor would be the first with a
  native rule plugin (ADR section 3), which would exercise the `plugin` capability channel
  (`src/targets/capability-types.ts`) in a new way.
- The extension recipe is `src/targets/index.ts:3-7`.

## Out of scope

- Codex and Gemini ([codex-target](codex-target.md), [gemini-cli-target](gemini-cli-target.md)).
- Anything else in the ADR.

## Success criteria

- ADR Phase 6 scope delivered in shippable stages; `rule` maps to `.cursor/rules/*.mdc` with
  `appliesTo` translated to the Cursor glob field without gating on `language`.
- Capability table complete and `docs/reference/capabilities.md` regenerated.
- Conformance rules (`provider-kind-coverage`, `declared-but-unemitted`, `provider-term-leak`)
  pass with a Cursor lexicon.
- A live check in Cursor confirms rules and skills load.
- `npm run ci:local` green (includes `sigil validate` and `sigil sync --check`)

## Riskiest assumption

That `.mdc` rule frontmatter (rule modes such as always, auto-attached, manual) maps cleanly onto
sigil's `appliesTo` plus `severity` without a new authored field.

## Open questions

- Which Cursor rule mode does an unscoped sigil rule become?
- Does Cursor read `AGENTS.md`, and should it share Copilot's emitter?
- Is Cursor's plugin format documented enough to emit (to verify against Cursor docs)?
