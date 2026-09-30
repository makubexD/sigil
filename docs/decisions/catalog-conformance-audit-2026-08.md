# Catalog conformance audit + engine — 2026-08-07

## What prompted this

The `doc-refs-audit-and-lifecycle-2026-08.md` pass (2026-08-06/07) locked in a verification
standard for the spec layer: every `KindEmitSpec.docs` citation must name the provider's
canonical home, not merely a page that mentions the format. But that standard was applied to
`src/targets/doc-refs.ts` and the `KindEmitSpec`s only — the 96 artifacts in `catalog/` that are
supposed to _conform to_ that standard were never swept against it. The in-flight
quality-elevation pass made the cost concrete: it elevated the TypeScript language to the new
`whenToUse`/density standard and left the other four languages behind, and in doing so exposed a
real regression in the spec layer itself.

`catalog/` is the product — everything else in this repo exists to propagate those artifacts into
other people's projects. A one-time hand sweep would have fixed today and rotted at the next
standard change, so the deliverable is two things: the catalog brought current, and a
**conformance engine** inside `sigil sync` that did the bringing, so the next standard change is a
rule edit plus one `--apply`, not another manual pass.

## What the audit found

**A real regression, not just drift.** `CLAUDE_PLUGIN_SKILL_SPEC` maps `whenToUse → when_to_use`
frontmatter. `COPILOT_SKILL_SPEC.frontmatter` was `[name, description]` only, with no fallback —
any skill authoring `whenToUse` lost that text entirely on Copilot, present in neither frontmatter
nor body. Claude gained a field the elevation pass introduced; Copilot silently dropped the
content. Fixed by adding a `## When to Use` body section to `COPILOT_SKILL_SPEC`
(`src/targets/copilot/spec/skill.ts`) — verified end-to-end post-fix:
`dist/claude/.../cs-audit-deps/SKILL.md` carries `when_to_use:`, `dist/copilot/.../SKILL.md`
carries the new body section.

**The elevation reached TypeScript only.**

| Signal                              | angular | csharp | python | react | typescript | shared |
| ----------------------------------- | ------- | ------ | ------ | ----- | ---------- | ------ |
| skills with `whenToUse` (pre-sweep) | 0/7     | 0/7    | 0/1    | 0/1   | 6/7        | —      |
| avg skill body lines                | 91      | 130    | 125    | 144   | 90         | —      |
| rules with `appliesToRationale`     | 1/12    | 1/11   | 0/1    | 0/1   | 1/11       | 2/2    |
| agents with `relatedArtifacts`      | 8/8     | 7/8    | 0/1    | 0/1   | 7/7        | 0/1    |

17 of 23 skills kept `## When to Use` as body prose — the exact defect
`skill-dispatch-audit-2026-08.md` identified — and `typescript/ts-release` was missed inside the
already-elevated language. 24 artifacts hardcoded `.claude/` in prose that ships unchanged into
Copilot's `.github/` tree.

**Citation coverage was incomplete on the spec side.** Five emitted outputs had zero `DocRef`:
`.mcp.json`, `.claude/settings.json` (hooks and settings both), `.claude-plugin/plugin.json`, and
`.claude-plugin/marketplace.json` — JSON merges and manifests, not markdown renders, so no
`KindEmitSpec` covered them. Live research found `plugin.json` and `marketplace.json` actually have
**separate** canonical pages (`plugins-reference` vs `plugin-marketplaces`), so six new `DocRef`s
were added, not five, each cited to Anthropic's own `claude-directory.md` file-reference table
where it has a row, and wired as `AGGREGATE_DOC_REFS` entries (`src/targets/all-emit-specs.ts`) —
the same mechanism `copilot-instructions.md`/`AGENTS.md` already used. `sync --stale 0` now lists
27 citations (was 20 before this pass; +6 aggregates, +1 from the new `copilot/workflow` spec
inheriting `COPILOT_PROMPT_FILES_DOC`).

`copilot/workflow` was declared in `COPILOT_SUPPORTED_KINDS` with **no spec at all** — it rendered
through `buildPromptFile` with no derived contract and no citation, and never appeared in `sync`'s
supersession report despite inheriting prompt-file supersession. Fixed by extracting
`buildPromptLikeSpec(kind)` in `src/targets/copilot/spec/prompt.ts` and adding
`COPILOT_WORKFLOW_SPEC`, so `prompt` and `workflow` can't drift apart in shape.

`isStale` (`src/commands/sync/analyze.ts`) treated an unparseable `verifiedOn` as _fresh_ — a
typo'd date would have silently disabled the staleness gate. Flipped to fail-safe (unparseable =
stale).

## The conformance engine

`src/commands/sync/conformance/` — a data-driven rule registry joining template drift as `sigil
sync`'s second analyzer, sharing the same preview/`--apply`/`--check`/clean-tree-guard plumbing. A
`ConformanceRule` is data plus `detect()`/`fix()`/`editorialTask()` — the same philosophy as
`KindEmitSpec`, so a rule never touches the runner.

Eight rules shipped. Two are mechanical with a real deterministic fix (`when-to-use-lift`,
verified against 15 real artifacts); two are mechanical detect-only because their "fix" isn't
deterministic (`provider-kind-coverage` — closing a spec gap means authoring code;
`deprecated-hygiene` — currently zero findings, forward-looking); four are editorial
(`when-to-use-quality`, `body-density`, `platform-path-leak`, `applies-to-rationale`,
`related-artifacts`).

**`related-artifacts` was reclassified mid-build.** The plan approved it as mechanical (derive
`relatedArtifacts` from the `uses`/`extends` graph), but the exemplar's actual shape
(`typescript/ts-code-reviewer.agent.md`) requires picking a `relation`
(`escalates-to`/`complements`/`see-also`) _and_ writing a one-sentence `reason` per sibling — a
judgment call, not a graph derivation. Shipped as `editorial` instead; noted in the rule's own
header rather than silently deviating from the approved plan.

`--rule`/`--kind`/`--language`/`--provider` scope conformance for mass-change review — bring one
language up, or one rule across everything, each landing as its own diff. `--apply --editorial`
runs a model-backed pass for editorial findings, gated behind four correctness rails
(`editorial-rails.ts`): re-parse, zod schema, `checkOutputContract()` for every provider spec
matching the kind, and field-ownership (a proposal may only touch the fields its task declared,
never `id`/`kind`/`name`/`language`/`uses`/`extends`/`platforms`/`deprecated`). A failed rail drops
the edit and reports why — never a partial write. Uses a raw `fetch` call to the Anthropic Messages
API rather than an SDK dependency (`ts-dependencies.rule.md`'s own "prefer Node built-ins" guidance
applies directly).

**A bug was caught and fixed before the catalog sweep landed.** The first real `--apply` run's diff
showed the mechanical writer fully reserializing the frontmatter block — silently stripping
intentional double-quoting from every untouched field (`title`, `argumentHint`) — and
`extractWhenToUseSection` orphaning a bare `---` divider in the body when the removed section had
one as its own trailing separator. Both caught by reading the actual diff before committing,
reverted, fixed (the writer now only touches the exact lines a patch adds/removes, preserving
everything else byte-for-byte), and covered by two new regression tests
(`test/commands/sync-conformance.test.ts`) before re-running.

## Verification

- `npm run check` — 500/500 tests green throughout.
- `sigil sync --check` before the fix: exit 1, 15 conformance errors. After `--apply`: exit 0.
- `sigil sync --apply` on the real catalog: 15 files changed, +15/-89 lines — clean, minimal diffs
  (confirmed by reading each), no reformatting noise, no orphaned dividers.
- `npm run catalog:build` + direct inspection of `dist/claude/` and `dist/copilot/` output confirms
  the Phase 1 Copilot fix reaches real content, not just the test fixture.
- `sigil sync --stale 0` lists 27 citations (was 20); `--check` green.

## Still open (deliberately out of scope this session)

68 editorial-class conformance warnings remain (11 `body-density`, 23 `platform-path-leak`, 33
`applies-to-rationale`, 1 `related-artifacts`) — advisory, don't fail `--check`. Not applied this
session because `ANTHROPIC_API_KEY` wasn't available in the environment; the engine's editorial
pass is built, tested (all four rails have a passing/failing test in
`test/commands/sync-conformance.test.ts`), and ready to run via
`sigil sync --apply --editorial [--language <lang>]` once a key is available. Run one language at a
time and review each diff, per the plan's mass-change-review design.
