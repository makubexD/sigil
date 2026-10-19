# Phase M: capability verdicts (draft for the panel)

Sources: `bench2/<repo>/{profile.md,inventory.jsonl,coverage.tsv}` (159 capabilities, 6 recons), merged by
`bench2/merge.mjs` into `merged/`. Facts the orchestrator re-checked against source are marked ✔.

Verdicts: **have** (sigil already equal or better) · **adopt** (near verbatim, MIT + attribution) · **adapt** (idea,
rewritten to sigil's families/lexicon) · **strengthen** (stronger than any source; says why) · **reject**.
Gate: **T** = acceptance tests (deterministic), **E** = eval-gated (prose; Part 1 showed added prose mostly has no
effect), **U** = new product surface, user confirms first, **D** = docs only.

## Cross-cutting finding that shapes everything

Part 1 data says sigil's rules cost 2.4× (B0: $4.17 → $10.14, 158 → 237 turns) with no correctness gain on the
current tasks (18/18 both arms), and the only measured improvement came from *removing* prose (D2). dotnet's
authoring doctrine ("delete anything the unskilled model already writes", ✔ writing-for-baseline-delta.md) and
ponytail's contribution gate (3 arms, ≥6 runs) say the same thing independently. The eval is also underpowered at
task level ✔: D2 is p = 0.029 counting runs but **p = 0.188 counting distinct tasks** (4 lower, 1 higher of 6);
only a 5/5 or 6/6 task sweep can reach p ≤ 0.05. So: (1) the eval must grow before more prose decisions, and
(2) it needs tasks where rules *should* help (correctness under scale, trust boundaries), or it can only ever
recommend deletion.

## Verdict table

| # | Capability | Best source (✔ = checked) | sigil today | Verdict | Gate | Pri |
|---|---|---|---|---|---|---|
| **Evals and measurement** |
| E1 | Count distinct tasks, significance + practical floor | dotnet vally-adapter README:282-331, CONTRIBUTING:406 ✔ | run-level pairing only | **strengthen**: task-level sign test as the registered primary, run-level reported; ≥10 tasks; plus a ≥20% net-win floor | T | P0 |
| E2 | Tasks where rules should matter (not at ceiling) | none of the 4 repos has it | 6 tasks, all at ceiling | **strengthen**: add tasks seeded with traps the rules address (unbounded fan-out, trust-boundary input, swallowed error, resource cleanup), hidden tests that fail on the trap | T | P0 |
| E3 | Bad-reference selftest: hidden tests must be able to fail | ponytail agentic README:68,79 ✔(via recon); dotnet eval-quality selftest | none | **adapt**: a known-bad solution per task that passes the happy path and fails hidden tests, checked in CI | T | P1 |
| E4 | No-skill baseline for skill evals | dotnet (every eval is baseline vs skilled) | cli/wizard evals use old-skill baseline | **adapt**: add a `none` arm to skill scenarios | T | P2 |
| E5 | Classify an eval failure before editing skill text | dotnet improve-skill-quality SKILL.md:52-69 | none | **adapt** into `test/evals/README.md` protocol | D | P2 |
| E6 | Rejected-change ledger | agent-skills skill-impact.md (empty), ponytail robustness audit | results.md records every rejected row | **have** (stronger: populated, with p-values) | – | – |
| E7 | Pre-registration, placebo/ablation arms | ECC gateguard doc ✔ (p = 0.210, never shown to help) | registered hypotheses, ablation A1–A4 | **have** | – | – |
| E8 | Skill-routing / dormancy evals | agent-skills evals README:53 ✔ (7/27 → 21/27 from one clause); dotnet expect_activation:false | agent-dispatch probe (24/24) for agents only | **adapt**: a skill-firing probe for the 25 skills without a negative trigger, before writing any | E | P2 |
| **Authoring doctrine and token budget** |
| A1 | Delta-over-baseline: keep only what changes model output | dotnet writing-for-baseline-delta.md:9-39 ✔ | ablation done for 4 TS rules; other languages never measured | **strengthen**: an ablation sweep per language (rule minus one) on E2's harder tasks; delete what moves nothing; doctrine in authoring guide | E | P1 |
| A2 | Budget the rendered menu, not each description | dotnet SkillProfiler.cs:35-71 ✔ | per-artifact description-budget (1,536) | **adapt**: provider limit as data on KindEmitSpec.limits, total listing per install set checked by provider-limits — only if Claude Code has a documented total budget (verify) | T | P2 |
| A3 | Per-file rule-load budget gate | ECC lean profile (blocking token budget) | `rule-load` script, outside CI | **adapt**: CI fails when a language's per-source-file bytes grow without a recorded reason | T | P1 |
| **Misleading guidance in sigil (P0 class, like PR2)** |
| F1 | Unbounded `Promise.all` "for independent items" | sigil ts-async.rule.md:58-69 ✔, ts-performance-profiler:61-62 | defect | **fix the class**: bounded concurrency for large or unbounded lists, across ts/py/cs async rules; CANONICAL phrase in catalog-doctrine test | T | P0 |
| F2 | React `data-testid` preferred vs role queries preferred | react-conventions:27 vs react-testing:27-28 ✔ | contradiction | **fix**: conventions defers to the testing rule; RETIRED pattern | T | P0 |
| F3 | Debugger falls back to `npx vitest run` | ts-debugger.agent.md:35 ✔ | defect | **fix**: the project's own test script; no tool default | T | P1 |
| F4 | "Use Strategy, Factory, Adapter, Builder"; unconditional "Inject dependencies"; 80% overlap | ts-code-quality:28,51; code-quality.template:64 ✔ | present | **removal ablation** (D2 pattern), not a rewrite | E | P1 |
| **Review discipline** |
| R1 | Finding needs a concrete failing case; zero findings allowed; proof for high severity | ponytail review SKILL.md:59 ✔; ECC code-reviewer.md:39-111 ✔(recon); dotnet EF skill:37-44 | severities scale, no evidence bar | **strengthen**: one evidence bar for every reviewer family member, gated on a new false-positive scenario (R2: a clean diff; R1 measures recall only) | E | P1 |
| R2 | Run the toolchain before reviewing; stop when red | ECC typescript-reviewer.md:19-22 | not in reviewers | **adapt** | E | P2 |
| R3 | Concept count; hand-mutate a test | agent-skills code-review SKILL.md:60,164 ✔ | none | **adapt** into the reviewer section, bundled with R1 | E | P2 |
| R4 | One severity scale across reviewers | ECC and agent-skills are inconsistent (recon) | `severities` in standard.yaml, enforced | **have** (stronger) | – | – |
| R5 | Multi-reviewer verify-then-report pipeline | ECC workflows/README.md:14-18 | none | **reject** for now: cost unmeasured, no shipped workflow kind consumer | – | – |
| **Hooks (Claude only; Copilot has no hooks)** |
| H1 | Bar-lowering guard: `@ts-ignore`, `eslint-disable`, `.skip`/`.only`, lowered thresholds, edited lint/format/tsconfig | agent-skills constraint-driven SKILL.md:206-214 ✔ (prose); ECC config-protection.js ✔ (blocks configs) | protect-config hook covers secrets files only | **strengthen**: one hook that detects both config edits and suppression markers in a diff and asks (not denies), with a test per marker | T U | P1 |
| H2 | Format/typecheck at Stop | ECC stop-format-typecheck.js ✔ (exits 0: errors likely never reach the model) | none | **strengthen**: return a blocking decision with the errors, guard re-entry, time budget; measured on the harness (turns, tests) | T U | P2 |
| H3 | Inject rules into subagents | ponytail ponytail-subagent.js:4-10 | unknown whether path-scoped rules reach subagents | **verify first**; adapt only if subagents miss them | V | P2 |
| H4 | Session-start codebase map | ponytail ponytail-map.js | none | **reject**: always-on bytes, no effect measured | – | – |
| **Testing** |
| T1 | Verified RED (compiled, run, failed for the intended reason) | ECC tdd-workflow SKILL.md:159-172 ✔ | `feature` Phase 4 says it; language test skills? | **adapt** into `*-generate-tests` if absent | E | P2 |
| T2 | Mutation thinking: would emptying the body fail? | dotnet unit-test-generation.prompt.md:77-88 | none | **adapt** into `*-generate-tests`; needs a test-gen scenario to gate | E | P2 |
| **Coverage (language × topic; merged/coverage.tsv)** |
| C1 | Node runtime (shutdown, streams, workers, process errors) | ECC rules (2) | 0–1 | **strengthen** via delta-over-baseline: probe the model first, write only what it gets wrong | U E | P2 |
| C2 | C# ASP.NET Core / EF Core | dotnet (3) | 1 | **adapt** (rewrite, MIT notice if any text is close) via the same probe-first method | U E | P2 |
| C3 | Python FastAPI/Django; idioms | ECC (3) | 1–2 | as C2 | U E | P3 |
| C4 | React performance/security/errors | ECC react-performance (Vercel-derived, credited) | 2 | as C2 | U E | P3 |
| C5 | API design, DB migrations, observability, integration/e2e tests | ECC/agent-skills partial | 0 everywhere | **defer**: list for the user | U | P3 |
| **SDD (assessment only; the user decides)** |
| S1 | `feature` never composes sigil's own reviewers/test skills (no `uses:`) | sigil feature SKILL.md ✔(recon) | gap | **report**: option to prefer an installed language reviewer in Phase 5 | U | – |
| S2 | Spec hard stop, approval in a later turn | agent-skills spec SKILL.md:170-174 | feature GATE 2 | **have** | – | – |
| S3 | Size the process by blast radius | ECC orch-pipeline:41-54 | feature Phase 0 size check | **have** | – | – |
| **Other** |
| O1 | Pin required phrases in CI | ponytail check-rule-copies.js:44-56 ✔ | catalog-doctrine CANONICAL table | **have** | – | – |
| O2 | Overlays narrow-only, stated precedence | dotnet OVERLAYS.md:27-64 | overlays v1 (#72), narrow-only | **have**; revision pin noted | – | – |
| O3 | "What I skipped" closing line | ponytail AGENTS.md:3 | none | **reject**: no difference vs no-skill in ponytail's own data | – | – |
| O4 | Don't re-run unchanged verification | agent-skills incremental SKILL.md:211 | none | **adapt**, gated on turns/cost in the harness | E | P3 |
| O5 | Negative triggers on agents | dotnet USE FOR / DO NOT USE FOR | 0/39 agents | **reject**: PR7 probe found dispatch 24/24 already | – | – |
| O6 | Per-agent model/effort for language agents | ECC agents set model | only 3 shared agents | **open question for the panel** (correctness > cost) | U | – |

## Proposed order
1. P0 now: F1, F2 (fix the class, tests), E1 + E2 (eval strength), and a results.md note re-reading D2 at task level.
2. P1: E3, A3, F3, H1 (user confirms the hook), then the eval-gated items on the stronger harness: F4 removal, R1, A1.
3. P2/P3 after the user's call on new surface: H2, C1–C5, S1, O6.
