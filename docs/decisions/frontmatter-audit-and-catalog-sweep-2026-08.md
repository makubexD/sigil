# Frontmatter audit + full catalog conformance sweep (2026-08-10)

## Why

Two threads, joined:

1. Finishing the editorial conformance pass the 2026-08-07 audit left open (68 findings across
   the catalog, run through `sigil sync --apply --editorial` with no `ANTHROPIC_API_KEY` — the
   model client is injectable, and this session's model supplied proposals directly through the
   same four correctness rails the automated path uses).
2. The user asked why catalog frontmatter headers are so long, suspecting dead/unused fields
   inflating file size past provider limits.

## Finding: the frontmatter-length premise was half right, inverted on the more important half

- **No provider size limit was ever close to being breached.** Emitted output is already minimal
  (Claude `SKILL.md` ≤ 8 keys, Copilot `SKILL.md` 2 keys, rules 1 key). The only documented cap —
  Claude's 1,536-char `description` + `when_to_use` skill-listing truncation — had a catalog worst
  case of 576 chars (`typescript/ts-release`) before this pass, verified against
  [Claude Code — Skills](https://code.claude.com/docs/en/skills) (2026-08-10).
- **The long headers are the catalog's own neutral authoring schema** — `id`/`kind`/`title`/
  `language`/`uses`/`extends`/`tags` feed the resolver, `sigil search/get`, the wizard, and the
  manifest. Not dead weight; a different layer than what a provider ever sees.
- **But the audit found the opposite of dead weight**: `tools` (`AgentSchema`) was authored on
  ~26 agents — several explicitly read-only in their own `description` — but mapped by neither
  `CLAUDE_AGENT_SPEC` nor `COPILOT_AGENT_SPEC`. Both providers default an absent `tools` to _all_
  tools, so every emitted agent silently inherited full write access, including `Write`/`Edit` on
  agents whose description promised read-only behavior. Fixed by wiring `tools` into both specs
  (`938a2c4`).
- **Genuine dead weight did exist**, just smaller than suspected: `severity: recommended` (35
  files) and `extends: []` (27 files) explicitly reasserted their own zod schema default, changing
  nothing. Stripped via a new `redundant-default` conformance rule (`34842b0`, `0843eb4`). The
  per-artifact `version` field (`BaseFields`) was fully dead — 0 catalog uses, self-documented as
  unused — removed along with every reader/writer (`e2b7b28`).

## Durable tooling, not a hand sweep

Per the standing requirement from the 2026-08-07 audit ("build tooling that propagates future
standard changes automatically, not a one-time pass"), every fix above shipped as a new or
extended `sigil sync` conformance rule before the catalog content changed:

| Rule                             | Class                    | Catches                                                                                                                                                                                                                                                                                        |
| -------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `declared-but-unemitted`         | mechanical               | A frontmatter field authored but unmapped by any provider spec — the exact shape of the `tools` gap. Derived from each spec's `FieldMapping[]`, not a hand-listed field set.                                                                                                                   |
| `redundant-default`              | mechanical, with `fix()` | A field whose value deep-equals its zod schema default. Derived from `getSchema(kind)`'s live shape via `ZodDefault._def.defaultValue()`.                                                                                                                                                      |
| `description-budget`             | editorial                | `description` + `whenToUse` over Claude's 1,536-char cap. Zero violations today — a regression guard, not a current fix.                                                                                                                                                                       |
| `when-to-use-quality` (extended) | editorial                | Broadened to also catch a skill with **no** `whenToUse` at all (previously only caught a weak one) — `when-to-use-lift` only fires when there's a body section to extract, so a skill with neither fell through both rules undetected (`python/py-pytest-testing`, `react/component-testing`). |

## A bug in the first version of `redundant-default`

The rule's first cut treated `RuleSchema.appliesTo`'s default (`["**/*"]`) as inert the same way
`severity`/`extends` are — and stripped it from 5 files. It isn't inert:
`CLAUDE_SCAFFOLD_RULE_SPEC` reads raw, un-defaulted frontmatter (`load.ts` never runs artifacts
through zod; `validate.ts` checks against the schema but never writes defaults back onto
`artifact.frontmatter`) and gates its `paths:` block on `appliesTo`'s **presence**, not its value
— an authored `["**/*"]` still emits `paths: ["**/*"]`, while an omitted `appliesTo` emits no
frontmatter block and the rule loads unconditionally every session. `test/targets/claude-code.test.ts`'s
existing scaffold test caught this immediately (not a test written for this rule) — fixed by
excluding `appliesTo` from the rule's candidate fields and restoring it on the 5 files (`0843eb4`).

## Editorial sweep results

Run language-by-language via the same no-API-key harness pattern proven on TypeScript in the
prior session (a throwaway `.cjs` script in scratchpad, injecting a `modelClient` whose proposals
this session authored directly, routed through the real `runEditorialFindings` and its four rails):

| Language   | Findings resolved | Left open                                             | Commit                    |
| ---------- | ----------------- | ----------------------------------------------------- | ------------------------- |
| typescript | 17/18             | 1 body-density                                        | `496b682` (prior session) |
| angular    | 27/28             | 1 body-density                                        | `4c92efa`                 |
| csharp     | 25/31             | 5 body-density + (related-artifacts fixed separately) | `a816d03`, `c8a9917`      |
| python     | 2/3               | 1 body-density                                        | `d62c80a`                 |
| react      | 2/3               | 1 body-density                                        | `d62c80a`                 |

**9 `body-density` findings are left open catalog-wide** (typescript ×1, angular ×1, csharp ×5,
python ×1, react ×1) — every skill whose body exceeds the ~90-line soft target against the
`typescript/ts-audit-deps` exemplar. `typescript/ts-release` was assessed in the prior session and
found to have no genuinely cuttable prose without degrading load-bearing output-format templates
(the changelog/checklist sections). The other 8 were not individually re-assessed this session —
each needs the same per-skill judgment call (what's re-teaching vs. load-bearing) that took real,
line-by-line work for `ts-release`, and is deferred as a follow-up rather than rushed across 8
files without that same care.

## Bugs found and fixed along the way (prior session, still load-bearing here)

Carried forward from the TypeScript pass: a race condition on same-file editorial findings, a
full-reserialize bug in the editorial write path, and an overwrite-existing-key data-loss bug in
`frontmatter-patch.ts`'s `applyFrontmatterPatch` — see `79c2882` and this doc's prior version in
git history for the detail. All three are covered by regression tests in
`test/commands/sync-conformance.test.ts`.

## Verification

Every commit in this arc was preceded by `npm run check` (tsc + lint + format + `check-doc-comments`

- full test suite) and `npm run validate` (schema + reference-graph integrity) passing, and
  `npm run catalog:build` succeeding for both `dist/claude/` and `dist/copilot/`. Test count grew
  506 → 523 across the session (new regression tests for `redundant-default`,
  `declared-but-unemitted`, `description-budget`, `when-to-use-quality`'s missing-whenToUse case,
  and a stale-fixture fix in `copilot.test.ts` that the python/react whenToUse authoring surfaced).

## Follow-up not done this session

- The 9 open `body-density` findings (per-skill trims, deferred above).
- Running the mechanical/editorial sweep isn't needed again — `sigil sync --check` is now the
  living source of truth for what remains; re-run it rather than trusting this document's counts
  as they age.
