# Cursor target

## Objective

Add a `cursor` target so `sigil add --target cursor` and `sigil build --target cursor` deliver the
catalog to Cursor. Planned in
[distribution-channels-2026-09](../decisions/distribution-channels-2026-09.md) (section 6, Phase 6:
`.cursor/rules/*.mdc`, agents, commands, hooks, MCP, and the Cursor plugin, the one format that
carries rules; matrix in section 3). This brief does not restate it.

## Status

The `cursor` target has shipped. [plan-cursor-target.md](../plan-cursor-target.md) is the record, and phases A to E and N are
done. Two phases are left:

- **F, the Cursor plugin channel:** paused on Cursor's free usage limit. So far a CLI-loaded Cursor plugin loads skills and
  agents but not rules.
- **G, close-out:** a live check in Cursor, then delete this brief and its README row.

## Out of scope

- Codex and Antigravity ([codex-target](codex-target.md), [antigravity-target ADR](../decisions/antigravity-target-2026-11.md)).
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
