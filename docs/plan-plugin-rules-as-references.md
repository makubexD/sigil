# Plan: plugin skills load rules on demand (roadmap)

> **Brief:** [plugin-rules-as-references](ideas/plugin-rules-as-references.md) ·
> **ADR:** [Phases 1b and 1c](decisions/distribution-channels-2026-09.md#phases-1b-and-1c-2026-11-03)

**Status: deferred 2026-11-04, low priority.** Don't start it from `/next`. The runs must use Claude, because the eval
measures Claude's own behaviour, and up to about 108 of them is too much for the owner's $20 plan. DeepSeek can't stand in.
Once the higher-priority work is done, the owner decides how to run it.

Claude plugins can't ship loose rules, so `build` inlines them into each skill under `## Applied Rules`. That section is
58% of what a plugin skill loads on invoke (82k of 141k tokens, re-measured on v0.9.0: same 82k across 52 skills). This
roadmap decides whether moving it out is worth doing, then does it only if the eval says so.

## The catch this plan is built around

Moving text to a reference saves nothing when the model reads the reference: the same tokens arrive through a Read
instead of the skill, one turn later. The brief's first criterion only asks that adherence doesn't drop, and a model that
reads everything passes it with no saving at all. So:

- A single `rules.md` can't win. If it is read the saving is 0, and if it isn't read the rules are lost.
- The only real saving is selective reading: a skill with several rules, where the model opens only the rules this task
  needs. So the candidate form is **one reference file per rule, plus an index in SKILL.md**. This settles the brief's
  first open question. A skill keeps its own copies, so no skill has to reach a sibling's folder.
- 34 of the 52 skills carry one rule (37.9k tokens) and 18 carry two or more (44.2k tokens). A single-rule skill saves only
  on runs that rightly skip its rule, so the realistic ceiling is well under the 58% headline.
- The eval measures tokens actually loaded, and the go bar requires a real saving. A no-go is a likely and useful outcome.

Also check: Claude Code keeps invoked skills across compaction, and a Read result has no such promise. Inline rules may
survive a long session better than referenced ones. Phase A records what the docs say; it does not measure this.

## Phases

### Phase A: eval, with Claude (`docs/plan-plugin-rules-as-references-a.md`)

Three arms built from `dist/claude/plugins/` by a script, with no change to `src/`: `none`, `inline` and `reference`. Rule-
sensitive tasks in TypeScript and Python (the brief's second open question: two languages are enough, the mechanism
doesn't depend on the language). Ends in a recorded go or no-go.

Merges as its own PR either way: the harness and results stay in `test/evals/`.

### Phase B: build (only on a go)

Written as a step plan after Phase A, because the bar's result decides its shape. Expected scope, not a commitment:

- `src/targets/claude-code/spec/skill.ts`: the plugin variant writes the index section and the rule files. Copilot reads
  the same plugins, so it follows; `sigil add` output doesn't change.
- The rule files reach `emit-files.ts` as generated references, and `output-contract.ts` covers them.
- `provider-limits` measures the new SKILL.md, and a rule's size limit if the docs state one for references.
- `reference-links`, `validate:claude-plugins` and the marketplace drift check accept the new files.
- `docs/reference/spec.md`, `docs/guides/consuming.md`, `docs/guides/operations.md`, CHANGELOG.
- `.claude/rules/repo-architecture.md` if the "two delivery modes" text changes.

### Phase C: close out (either outcome)

Move the brief's still-true facts into the ADR (1c, go or no-go with the numbers), delete the brief and its row in
`docs/ideas/README.md`, and delete the plan files in a finished-plans PR.

## Not in this roadmap

`sigil add` output, other targets' emitters, `scripts/` and `assets/` packaging (ADR 1c: no catalog skill needs them).
