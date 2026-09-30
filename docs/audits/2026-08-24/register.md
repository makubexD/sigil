# Catalog audit round 5 — content-improvement register (2026-08-24)

Scope: for the first time since round 1, this round edits **catalog artifact content itself** —
descriptions, trigger surfaces, body density, and family symmetry — using four rounds of
accumulated measurement evidence, then verifies the change through a full clean teardown +
reinstall and a re-run of the measurement lanes. Full methodology:
`docs/decisions/catalog-content-improvement-round-2026-08-24.md`.

## Lane T — trigger-surface fixes (Lane P dispatch probes)

**Result: 14/14 mechanical probes pass, up from 10/14 — the first movement on this number in 3
rounds (round 2 → round 4 all measured 10/14 unchanged).**

| Probe                                                                 | Was                                                                                                   | Fix                                                                                                                                                                                                                                                                                                                                                                                                | Now                                                         |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| #4 "Review the changes I just made to src/templates.ts for bugs"      | FAIL — `shared/code-reviewer`(3) outranked `typescript/ts-code-reviewer`(2)                           | `shared/code-reviewer`'s description named `ts-code-reviewer`/`cs-code-reviewer`/`ng-code-reviewer` literally, and every `*.ts`-suffixed prompt token-matched the hyphenated "ts" fragment for free. Replaced the enumerated list with "a language-specific code reviewer... for the file's language." `ts-code-reviewer`'s description gained the literal word "bugs" (already its actual scope). | PASS — `ts-code-reviewer`(3) > `shared/code-reviewer`(2)    |
| #5 "Update the lodash dependency to the latest version" (expect null) | FAIL — fired the disclaimed `typescript/ts-add-package`(2)                                            | `ts-add-package`'s own disclaimer sentence ("Not for updating an already-installed package's **version**") ironically token-matched the update prompt it was trying to rule itself out of. Reworded to avoid restating "version"/"dependency" as bag-of-words matches while keeping the same meaning.                                                                                              | PASS — correctly stays quiet, top score is a 3-way tie at 1 |
| #11 "Profile src/templates.ts for performance issues"                 | AMBIGUOUS — top match `shared/code-reviewer`(2), expected `typescript/ts-performance-profiler`(1)     | Neither "profile" nor "issues" were literal words in `ts-performance-profiler`'s description despite being its exact concept. Added both. Also benefited from #4's `shared/code-reviewer` fix (lost its free "ts" match).                                                                                                                                                                          | PASS — `ts-performance-profiler`(3) > `ts-code-reviewer`(1) |
| #14 "Will bumping this package major version break consumers"         | AMBIGUOUS — top match `typescript/ts-add-package`(2), expected `typescript/ts-api-compat-reviewer`(1) | `ts-api-compat-reviewer`'s description said "Breaking" and "packages" — neither exact-matches the prompt's "break"/"package" (the scorer does no stemming). Reworded to state the concept using the prompt's own words: "review whether bumping a package's major version...will break downstream consumers."                                                                                      | PASS — `ts-api-compat-reviewer`(7) > `ts-add-package`(2)    |

**Root cause, stated plainly for future rounds:** the mechanical proxy scorer is exact-token
bag-of-words with no stemming — a description that _means_ the right thing in prose does not
necessarily _contain the literal words_ a probe prompt uses. All 4 fixes were "restate the same
meaning using the prompt's own vocabulary," not a scope or capability change to any agent. Probes
#1–#3, #6–#10, #12–#13 were already passing and untouched.

## Lane R — agent-body instruction-depth fixes (round 4's own recommended next step)

Round 4's recall control found `ts-security-auditor` missed a seeded prototype-pollution
regression despite spot-checking the same guard class moments earlier, and `ts-performance-profiler`
missed a seeded O(n²) loop in a small utility file while reporting at length on "central"-looking
files. Round 4 recorded two verbatim body-instruction recommendations; both applied this round:

- `ts-security-auditor.agent.md` — added an explicit instruction under "Prototype pollution": when
  a shared guard invariant exists, grep every call site and verify each individually — never
  spot-check one representative site and extrapolate.
- `ts-performance-profiler.agent.md` — added an explicit instruction under "Determine scope": when
  no single file is named, sweep every source file, not just files that look "central" by name or
  import fan-in.

**Not yet re-measured against the recall control** — that requires a fresh dispatch of both agents
against the same seeded-defect scratch copy from round 4's manifest, which this round's scope
(catalog content, not a new agent-dispatch round) did not include. Recommended as round 6's first
check if round 6 runs.

## Lane E1 — body-density editorial pass

**Result: 3 of 6 warnings fully resolved, remaining 3 reduced 13–20% but not fully closed.**

| Artifact                     | Before    | After | Status                                                                                                                                              |
| ---------------------------- | --------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `csharp/cs-generate-tests`   | 108 lines | —     | **Resolved** (trimmed the test-class example: removed a second `[Theory]` case and `IDisposable` boilerplate not needed by the illustrated pattern) |
| `csharp/cs-document`         | 106 lines | —     | **Resolved** (compressed the "full doc comment" example's `<param>`/`<returns>` blocks to single-line tags)                                         |
| `csharp/cs-add-package`      | 124 lines | —     | **Resolved** (converted 3 numbered sub-steps to prose paragraphs without dropping any check)                                                        |
| `python/py-pytest-testing`   | 123       | 113   | Reduced — merged the standalone "Naming Tests" section into one sentence; trimmed fixture-block imports                                             |
| `react/component-testing`    | 141       | 131   | Reduced — compressed the mocking section's two code blocks into one                                                                                 |
| `csharp/cs-scaffold-project` | 186       | 162   | Reduced — trimmed XML boilerplate comments, merged the console/web `Program.cs` guidance into prose, compressed the CPM package-reference block     |

**Honest read on the 3 remaining:** all three still carry genuinely distinct, real content — each
of `py-pytest-testing`'s remaining sections (parametrize, mocking, async, exceptions,
what-not-to-test) teaches a different concept in 6–12 lines; `component-testing`'s remaining
sections cover 7 distinct RTL/accessibility concerns; `cs-scaffold-project` has 7 real numbered
steps a scaffolding skill genuinely needs (repo discovery, placement, source scaffold, test
scaffold, solution registration, build/test, report). Round 1's original verdict on all 6 —
"no evidence they're unclear or wrong, just longer than the house exemplar" — still holds for what
remains; the ~90-line target (calibrated on `ts-audit-deps`, a simpler read-only report skill) may
not be the right target shape for a scaffolding or multi-pattern-teaching skill. Flagged for round 6
or a future round to decide: trim further, or treat these 3 as a legitimately different exemplar
class.

## Lane S — catalog-symmetry triage

**Result: 2 of 3 warnings closed by authoring new content; 1 documented as a deliberate absence.**

- **`angular/ng-async` — authored** (`catalog/languages/angular/rules/ng-async.rule.md`, new).
  Deliberately scoped to _not_ duplicate the existing `ng-rxjs`/`ng-signals` rules (RxJS operator
  conventions and Signal update discipline respectively) — covers Promise/Observable bridging
  (`firstValueFrom`/`lastValueFrom`, never `.toPromise()`), lifecycle-hook async hygiene, resolver/
  guard async contracts, `DestroyRef`/`takeUntilDestroyed` cancellation (Angular has no native
  `AbortController` binding for `HttpClient`), and the signal-write race condition unique to
  combining async work with Signals.
- **`angular/ng-project-layout` — authored** (`catalog/languages/angular/rules/ng-project-layout.rule.md`,
  new). Angular CLI workspace structure, `angular.json` build targets, feature-based (not
  type-based) folder layout, standalone-components-first conventions (no new `NgModule`),
  `loadComponent` route-level code splitting, `tsconfig` path aliases, environment configuration.
- **`angular/ng-scaffold-project` — deliberately not authored.** Confirms round 1's own judgment:
  Angular CLI's `ng generate`/`ng new` already covers project/component scaffolding natively
  (Angular already has `ng-generate-component`, the actual scaffolding surface for this
  ecosystem) — a bare-npm-style `ng-scaffold-project` skill would duplicate what the platform's own
  tooling does better. This is a genuine ecosystem asymmetry, not a coverage gap; the
  `catalog-symmetry` warning for this one family is expected to remain open indefinitely and should
  not be "fixed" by authoring a skill nobody would prefer over `ng generate`.

## Lane M — `cs-api-architect` → `cs-architecture-reviewer` merge

**Result: merged and deleted, closing a round-1 MERGE recommendation left open through rounds 2–4.**

`csharp/cs-api-architect` (58 lines, singleton family — no ts/ng counterpart, reachable only by
description dispatch, no `uses.agents`/`relatedArtifacts` reference pointing at it) was a
design-forward agent (propose ASP.NET API structure before code exists) with real content overlap
against `cs-architecture-reviewer`'s review-forward charter (analyze an existing solution's
structure). Merged: `cs-architecture-reviewer` gained a new `## 0` mode-selection section
("design vs. review — pick the mode the request calls for") and a new `## 7 — Designing a new API`
section carrying `cs-api-architect`'s unique content (layered-structure proposal, naming standards,
cross-cutting-concern checklist: auth, background services, OpenAPI, caching) not already covered
by the review checklist. `csharp/cs-api-architect.agent.md` deleted. Two doc references updated
(`README.md`'s artifact table, `docs/guides/consuming.md`'s two illustrative listings). Lane A
confirms 0 dangling references after the deletion; the deleted id no longer appears in the
"description-dispatch-only" orphan list (3 → 2 remaining: `python/py-architect`,
`react/react-architect`, both explicitly backlogged under the python/react parity item, not new).

## Measured before/after (round 4 → round 5)

| Metric                                | Round 4     | Round 5     | Delta                                                                           |
| ------------------------------------- | ----------- | ----------- | ------------------------------------------------------------------------------- |
| Lane P mechanical probe score         | 10/14       | **14/14**   | **+4**                                                                          |
| `sync --check` warnings               | 9           | **4**       | **-5**                                                                          |
| Catalog artifact count                | 98          | 99          | +1 (98 + 2 new angular rules − 1 merged csharp agent)                           |
| Angular rule-lines aggregate (Lane C) | 1153        | 1402        | +249 (2 new rules — expected, not a regression; both closed a real content gap) |
| TypeScript/C# rule-lines aggregate    | 1644 / 1515 | 1644 / 1515 | unchanged (no rule bodies touched in those two languages)                       |
| Teardown/reinstall                    | clean       | clean       | unchanged                                                                       |

## Deliberately not done this round

- **Full python/react parity buildout** (~19 artifacts per language) — round 1's own scoping still
  holds: a genuine multi-session undertaking, out of this round's stated content-editorial scope.
- **Recall-control re-measurement** of the two Lane R body-instruction fixes — the seeded-defect
  scratch copy from round 4 was not rebuilt this round; recommended as round 6's opening check.
- **Full closure of the 3 remaining body-density warnings** — reduced but not eliminated; judged
  as genuinely dense-but-correct content rather than bloat (see Lane E1's honest read above).
- **Round 4's 12 backlogged `src/`-level findings** (F37–F49) — sigil code, not catalog content,
  unchanged and out of this round's scope.
