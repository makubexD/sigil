# Plugin skills: rules as on-demand references

> **Back to:** [Ideas](README.md) · [distribution-channels ADR](../decisions/distribution-channels-2026-09.md#phases-1b-and-1c-2026-11-03)

## Objective

Cut what a Claude plugin skill loads on invoke by moving its inlined `## Applied Rules` section into a
`references/rules.md` the skill points to, without lowering how well the model follows those rules.

## Evidence

- Measured 2026-11-03 on v0.8.0 (`npm run catalog:build`, bytes / 4): 52 of the 55 skills in `dist/claude/plugins/`
  carry `## Applied Rules`. It is 58% of the text loaded on invoke (82k of 141k tokens), with a median of 1.3k and a
  max of 3.6k per skill.
- Plugins can't ship loose rules, so `build` inlines them (CLAUDE.md, "Two Claude delivery modes"). `sigil add` writes
  path-scoped `.claude/rules/` instead and is not affected.
- Skill references already ship and load on demand (`references/stack-<stack>.md`, `src/load-references.ts`).

## Out of scope

`sigil add` output, Copilot and other targets (they read the same plugins, so they follow), `scripts/` and `assets/`
(no catalog skill needs them yet).

## Success criteria

1. An eval with Claude (not the DeepSeek worker) on a fixed set of rule-sensitive tasks: the reference form follows the
   rules at least as often as the inlined form.
2. Only then: plugin SKILL.md bodies drop the section and link `references/rules.md`; `provider-limits` and the
   reference contract cover the new file.

## Riskiest assumption

That the model opens `references/rules.md` before writing code. If it doesn't, the saving costs rule adherence.

## Open questions

- One `rules.md` per skill, or one per rule shared across a plugin's skills (a skill folder may not reach a sibling's)?
- Does the eval need a per-language task set, or do two languages suffice?
