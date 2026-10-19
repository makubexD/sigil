# Benchmark v2: four agent-guidance repos against sigil (2026-10-16 to 2026-10-19)

This is Part 2 of the repo benchmark. Part 1 ([`2026-10-14`](../2026-10-14/README.md)) covered only the code-quality
slice and produced thin recon notes. Part 2 answers the full brief: 14 deliverables plus a traceability matrix.

Each capability found in ECC, dotnet/skills, agent-skills and ponytail gets one verdict against sigil:

| Verdict        | Meaning                                                        |
| -------------- | -------------------------------------------------------------- |
| **have**       | sigil already covers it at the same quality or better          |
| **adopt**      | take it close to verbatim (MIT, with attribution)              |
| **adapt**      | take the idea and rewrite it into sigil's families and lexicon |
| **strengthen** | build something stronger than any source                       |
| **reject**     | not taken, with the reason                                     |

**Method**

1. Six read-only recon agents, one per scope: ECC skills, ECC core, dotnet/skills, agent-skills, ponytail, and sigil
   itself. All six used one schema ([`evidence/recon/BRIEF.md`](evidence/recon/BRIEF.md)).
2. The orchestrator merged the recon into a matrix and drafted the verdicts.
3. A four-role panel reviewed the draft: principal, senior engineer, AI-agent SME and CTO.
4. The panel ran a rebuttal round.
5. The orchestrator checked every claim a verdict depends on against the source.

The final verdict is the orchestrator's.

**Labels.** **F** is a fact, read at the cited `path:line`. **I** is an inference. Recon and panel output are
claims. [`evidence/verification.md`](evidence/verification.md) lists which claims were re-checked and the result.

**Sampling.** Each recon profile discloses what it read in full and what it only listed. Each recon file count below
is the scripted listing, which covers the whole scope.

| Repo (commit)                                    | License                                                                          | Files listed | Capabilities assessed in depth |
| ------------------------------------------------ | -------------------------------------------------------------------------------- | ------------ | ------------------------------ |
| ECC (`b92f181b`): skills                         | MIT; `skills/osint-investigation` is CC-BY-SA-4.0 and 8 skills are Apache-2.0    | 613          | 26                             |
| ECC (`b92f181b`): rules, agents, hooks, commands | MIT                                                                              | 2,540        | 34                             |
| dotnet/skills (`9de888b8`)                       | MIT (.NET Foundation); `CONTRIBUTING.md:263` forbids copying text into that repo | 598          | 27                             |
| agent-skills (`aeac41d`)                         | MIT; `LICENSE:12-13` requires the notice to be kept                              | 217          | 30                             |
| ponytail (`2961b52`)                             | MIT                                                                              | 202          | 13                             |
| sigil (`4f3806e`)                                | MIT                                                                              | 496          | 29                             |

## 1. Executive summary

1. **sigil's structure leads all four repos. Its content is where it falls short.**
   - Structure: families and skeletons, a provider-neutral lexicon, emit specs, and 20 conformance rules. None of the
     four repos has a validator that checks rendered output per provider.
   - Content: the senior review found **16 guidance defects beyond Part 1 (F5–F20)**. The orchestrator re-read 13
     of them at source: all 13 are real, F11 only in TypeScript, and F16 and F20 are debatable rather than wrong. The
     panel added F21, A4 and H0.
     - Two are exploitable security advice: a C# path check without a trailing separator (F5), and an SSRF block list
       without `169.254.x` and with no check of the resolved address (F6).
     - Four recommend APIs that do not exist or no longer behave as stated: `.WhenBoth()`, `yaml.safeLoad`,
       `@ts-expect-error` on `any`, and synchronous Next.js `params`.
     - The concurrency class recommends unbounded fan-out as the _fix_ for a "Critical" finding.
2. **Factual errors need no eval.** Each gets a source fix and a regression guard in `test/catalog-doctrine.test.ts`.
   This is the fastest, surest gain in the whole benchmark.
3. **The eval can only recommend deletions today.** Rules cost 2.4× (B0: $4.17 → $10.14) with no correctness gain,
   because all 6 tasks sit at ceiling. Run-level pairing also overstates the evidence:
   - D2 is p = 0.029 by runs, p = 0.188 by a sign test across tasks, and p = 0.0625 or 0.125 by a sign-flip test on absolute or relative task means.
   - The shared B1 baseline had an outlier T5 (10/3/11 declarations; every other arm's T5 runs fall between 2 and
     11, mostly 2–5) that handed every comparison a free win.
4. **The strategic question is cheap to answer.** Do sigil's rules change correctness at all? About 12 calibrated
   TypeScript trap tasks and one interleaved run of `none`, master and a deletion arm (about $100–125) settle it:
   - If the rules don't help, correctness prose stops growing and the catalog shrinks toward errata and minimal style.
   - If they do, sigil has its first harness that can justify adding prose.
5. **Most "ideas worth taking" from the four repos are prose additions.** Part 1 showed those have no measurable
   effect (PR4–PR7 dropped), so most of them are rejected or deferred behind the trap experiment.
   - What sigil takes is mostly **measurement and enforcement**: dotnet's task-level statistics, ponytail's
     bad-reference selftest, agent-skills' firing probe, and ponytail's pinned phrases (already present as CANONICAL).
   - It also takes two verified mechanisms: Claude Code Stop-hook blocking, and path-scoped rules reaching subagents.

## 2. Repository profiles

The full profiles are in [`evidence/recon/<repo>/profile.md`](evidence/recon/) (Deliverable A, each ≤ 2,500 words).

**ECC**

- **What it is:** a Claude Code plugin with 71 agents, 311 skills and 97 commands (`AGENTS.md:3`), plus rules per
  language and hook scripts.
- **Strongest ideas:**
  - The verified-RED gate in `tdd-workflow` (`SKILL.md:159-172`).
  - `config-protection.js`.
  - The code-reviewer's anti-noise protocol.
  - The gateguard study, which honestly reports p = 0.210, i.e. never shown to help (`question-effectiveness.md:453,481`).
- **Weaknesses:**
  - Always-on rules cost about 19.4 KB.
  - Severity scales disagree across reviewers.
  - The README documents hooks that aren't wired up.
  - `stop-format-typecheck.js` exits 0 with stderr (`:268-273`). By the Claude Code docs, that path never reaches the
    model.

**dotnet/skills**

- **What it is:** a .NET-only skills repo with behavioural evals (baseline vs skilled) and a static validator.
- **Validator:** descriptions of 10–1,024 characters, token sweet spots in `SkillProfiler.cs:25-28`, and a menu cap
  of ≤ 15,000.
- **Strongest ideas:**
  - The writing-for-baseline-delta doctrine.
  - Task-level statistics: count distinct tasks, with a p ≤ 0.05 floor and a 20% net-win floor
    (`CONTRIBUTING.md:406`).
  - Narrow-only overlays.
- **Weaknesses:**
  - No security coverage.
  - No committed result data.

**agent-skills**

- **What it is:** a lifecycle skill set (spec → plan → build → review → ship) with personas.
- **Strongest ideas:**
  - "Tightening the bar should be silent; loosening it should be loud" (`constraint-driven-development/SKILL.md:214`).
  - "Count the concepts" in review.
  - A firing eval: one description clause moved review firing from 7/27 to 21/27 (`evals/README.md:53`).
- **Weaknesses:**
  - Gates are prose only.
  - Personas have no tool restrictions.
  - No C#.

**ponytail**

- **What it is:** a small, language-agnostic minimalism skill (about 3 KB) with hooks for several agents.
- **Strongest ideas:**
  - "No case, no finding" (`ponytail-review/SKILL.md:59-60`).
  - Required phrases pinned in CI (`check-rule-copies.js:44-56`).
  - A bad-reference selftest in its agentic eval.
- **Weaknesses:**
  - Its own correctness claim is weak: 87/90 vs 86/90.
  - It has no language depth.

**sigil**

- **What it is:** a catalog compiled to Claude Code (scaffold and plugin), Copilot (scaffold) and agents-standard.
- **Strongest parts:**
  - A 4-stage provider-neutral pipeline with families and skeletons.
  - Lexicon tokens.
  - 20 conformance rules.
  - A code-quality eval with pre-registered hypotheses and a populated ledger of rejected changes.
- **Weaknesses:**
  - All 20 conformance rules are structural, so nothing checks that the guidance is correct (Section 1).
  - A TypeScript `.ts` edit loads about 41 KB of rules; Angular loads about 49 KB.
  - Topics missing entirely: integration/e2e tests, API design, databases, observability, and Node runtime.
  - Only the cli and wizard skills have evals, and their baseline is the old skill, not `none`.
  - `feature` composes none of sigil's own reviewers (it has no `uses:`).

## 3. Cross-repository capability inventory

The recon agents logged 159 capabilities, one JSON object each, in [`evidence/recon/<repo>/inventory.jsonl`](evidence/recon/).
Each object has a category, responsibility, trigger, scope, quality score with evidence, quotes with line numbers,
token cost and portability.

[`evidence/matrix/merge.mjs`](evidence/matrix/merge.mjs) merges them and counts by category. The table below shows the
largest categories (the count is how many capabilities each recon assessed in depth, not how many files exist).

| Category                 | ECC | dotnet | agent-skills | ponytail | sigil |
| ------------------------ | --- | ------ | ------------ | -------- | ----- |
| evals-measurement        | 4   | 5      | 1            | 4        | 2     |
| code-review              | 7   | 1      | 1            | 2        | 1     |
| customization-overlays   | 4   | 1      | 2            | 2        | 3     |
| testing                  | 5   | 2      | 3            | –        | 1     |
| framework-engineering    | 4   | 3      | 2            | –        | 2     |
| language-engineering     | 6   | 2      | –            | –        | 3     |
| hooks-automation         | 6   | –      | 2            | 1        | 1     |
| orchestration-delegation | 4   | 1      | 5            | –        | –     |
| tooling-validation       | 2   | 2      | 2            | 1        | 4     |
| architecture-design      | 3   | 1      | 1            | –        | 3     |

## 4. Separation of concerns and overlap

- **Duplicate:**
  - Every repo has a TDD skill and a code reviewer.
  - sigil already has the stronger version of two:
    - one severity scale, enforced through `standard.yaml` `severities` (R4);
    - pinned phrases, through the CANONICAL table (O1, partial: see Section 8).
- **Complementary:** these strengthen sigil without overlapping it.
  - dotnet's eval statistics (E1).
  - ponytail's bad-reference selftest (E3).
  - agent-skills' firing probe (E8).
- **Conflicting:**
  - ECC and agent-skills grade severity differently.
  - Within sigil, the senior review found these conflicts:

    | Defect | What conflicts                                                                            |
    | ------ | ----------------------------------------------------------------------------------------- |
    | F9     | The refactor specialists' "two or more… 80%" vs clean-code "extract on the third"         |
    | F2     | `react-conventions:27`'s own `data-testid` example is flagged by `react-code-reviewer:75` |
    | F16    | A fixed 70% floor in ts/ng/cs vs "discover the floor" in py                               |
    | F3     | `ts-generate-tests:90` forbids `npx vitest run`; the React agents use it unconditionally  |

- **Missing everywhere:**
  - API design, database migrations, observability, integration/e2e tests.
  - Any repo checking that its guidance is _correct_. Only behavioural evals do that, and none of them cover traps.

## 5. Specification-driven development (assessment only; the owner decides)

`feature` already has the strongest gates of the five:

- a spec hard stop, with approval in a later turn (S2);
- process sized by blast radius (S3);
- a verified-RED step, where `feature/SKILL.md:103-104` requires showing the test fails "for the expected reason"
  (T1 → **have**).

One gap: `feature` never names sigil's own reviewers or test skills (S1). A `uses:` would make `add` co-install all
five language reviewers (`co-install.ts:12`). So the only sound option is one line: "prefer an installed language
reviewer in Phase 5". That decision belongs to the owner.

## 6. Target architecture

sigil _is_ the target architecture. The brief's concerns map onto it like this:

| Brief concern                   | sigil owner                                                                                  |
| ------------------------------- | -------------------------------------------------------------------------------------------- |
| A. Universal standards          | `catalog/shared/rules/` (`clean-code`, `git`), templates, catalog-doctrine guards            |
| B. Lifecycle orchestration      | `shared/feature` plus lifecycle skills (spec, plan, TDD, review), through `uses:`            |
| C. Language knowledge           | `catalog/languages/<lang>/`, with one family skeleton per role (`catalog/standard.yaml`)     |
| D. Framework knowledge          | Stack parts (`languages/<home>/stack-parts/`) rendered as `references/stack-<id>.md`         |
| E. Skills, agents, rules, hooks | Kinds in `KIND_REGISTRY`; per-provider `KindEmitSpec`; support declared in `capabilities.ts` |

No new directory is proposed. Every change in Section 13 lands in existing families, tests or the eval harness.

## 7. Component taxonomy and interaction model

The taxonomy is unchanged:

- rules, path-scoped and always loaded for matching files;
- skills, which load on description match or by command;
- agents, which run with restricted tools;
- hooks, which are deterministic and Claude-only today;
- settings and MCP, merged into user-owned JSON.

The benchmark adds one interaction rule, from the SME:

| Mechanism           | Cost model                                                                  | How it is gated                      |
| ------------------- | --------------------------------------------------------------------------- | ------------------------------------ |
| Always-loaded rules | Paid on every matching session; executed as procedure (B0 turns 8.8 → 13.2) | Byte budget (A3)                     |
| Skills              | Paid only when they fire                                                    | Test firing first (E8), then content |
| Anything checkable  | Belongs in a hook or CI, not prose                                          | Tests                                |

The verified Claude Code facts behind it (docs, cited in [`evidence/verification.md`](evidence/verification.md)):

- Path-scoped `.claude/rules` and CLAUDE.md reach subagents. SessionStart `additionalContext` does not. So ponytail's
  subagent injection solves a problem sigil does not have (H3 → **have**).
- A Stop hook blocks through exit 2 or `decision: "block"`. `stop_hook_active` guards re-entry, and Claude Code caps
  blocks at 8 in a row.
- The skill listing truncates each description plus `when_to_use` at 1,536 characters. No total budget is documented
  (A2 → **reject**).

## 8. Candidate catalog: final verdicts

Gates:

| Gate | Meaning                              |
| ---- | ------------------------------------ |
| T    | Deterministic test                   |
| E    | Eval                                 |
| U    | Owner confirms (new product surface) |
| V    | Verified                             |

### Evals

| ID  | Capability (best source)                                         | Verdict                                                                                                                                                          | Gate      | Priority |
| --- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | -------- |
| E1  | Task-level statistics (dotnet)                                   | **strengthen**: see below                                                                                                                                        | T         | P0       |
| E2  | Trap tasks where rules should matter (none of the four has them) | **strengthen**: see below                                                                                                                                        | T, then E | P0       |
| E3  | Bad-reference selftest (ponytail, dotnet)                        | **adapt**: every task, including traps, ships a bad reference that passes the happy path and fails the hidden tests; a judge selftest too; runs in `evals:check` | T         | P0       |
| E4  | `none` arm for skill evals (dotnet)                              | **adapt**, cli S1 and wizard W3 only ($0.23 per run)                                                                                                             | E         | P2       |
| E5  | Classify an eval failure before editing (dotnet)                 | **adapt** into `test/evals/README.md`                                                                                                                            | D         | P2       |
| E6  | Rejected-change ledger                                           | **have**: `results.md` is populated, with p-values                                                                                                               | –         | –        |
| E7  | Pre-registration, ablation arms                                  | **have**                                                                                                                                                         | –         | –        |
| E8  | Skill-firing probe (agent-skills `evals/README.md:53`)           | **adapt**: one should-fire and one should-stay-quiet prompt per skill, run before any skill-prose edit                                                           | E         | P1       |

**E1 in detail.**

- Primary statistic for continuous metrics: an exact one-sided sign-flip on per-task means, with a ≥ 10% magnitude
  floor. dotnet's 20% net-win floor never binds at this size.
- Register absolute or relative task means before the first run: on D2 vs B1 they give p = 0.0625 and 0.125.
- Every comparison gets a **fresh interleaved baseline**.
- The run-level test is reported as secondary only.

**E2 in detail.**

- About 12 TypeScript trap candidates, each stating a property such as scale or untrusted input, never the mechanism.
- Detection uses instrumented fakes: maximum in-flight requests, open handles, retained size, an observed
  AbortSignal, the `cause` chain. Never greps or timing.
- A trap is kept only if `none` fails it in at least 2 of 3 calibration runs.
- Fewer than 6 survivors: **stop**, and treat the rules as not earning correctness.
- The primary statistic for traps (binary) is an exact stratified permutation within tasks. It tests the sharp null:
  no arm effect on any task.

### Authoring and cost

| ID  | Capability                                                  | Verdict                                                                                                                                                              | Gate | Priority |
| --- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | -------- |
| A1  | Delta over baseline: keep only what changes output (dotnet) | **strengthen** as a non-inferiority deletion ablation on the trap tasks; TypeScript only until the traps exist elsewhere                                             | E    | P1       |
| A2  | Total menu budget                                           | **reject**: Claude Code documents none                                                                                                                               | –    | –        |
| A3  | Rule-load budget (ECC lean profile)                         | **adapt**: `rule-load` becomes a CI ratchet against a checked-in baseline with a reason field; it measures resolved source, which is a proxy for what agents receive | T    | P1       |
| A4  | `description-budget.ts:20` hard-codes 1536                  | **fix**: move it onto the Claude skill spec's `limits` (CLAUDE.md provider-limits invariant)                                                                         | T    | P1       |

### Guidance defects

Each defect class gets a fix and a guard. Guard types:

- **RETIRED**: a pattern banned everywhere. It gains an `except` field.
- **IMPLIES**: a new table. If a text matches A, it must also match B.

| Class                                   | Items (verification.md)                                                        | Guard                                                                                                                       | Gate | Priority |
| --------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- | ---- | -------- |
| Security                                | F5, F6                                                                         | RETIRED `StartsWith(safeRoot,`; IMPLIES private-IP advice ⇒ `169.254` and a resolved-address check                          | T    | P0       |
| Wrong or removed API                    | F7, F12, F13, F14                                                              | RETIRED `safeLoad`, `WhenBoth`, "rethrow bare `throw`", `any` without `@ts-expect-error`                                    | T    | P0       |
| Concurrency                             | F1 (ts, py, ng `mergeMap`, ts/cs/react profilers), F8, F10, F11 (TS only), F15 | IMPLIES fan-out advice ⇒ a bound; RETIRED "rejection cancel all"                                                            | T    | P0       |
| Toolchain and test truth                | F3, F17, F21 (generate-tests "Fix any failures")                               | RETIRED `npx (vitest\|jest)` in agents (except scaffold and settings); CANONICAL generate-tests "never weaken an assertion" | T    | P0       |
| Family drift                            | F2, F9                                                                         | RETIRED `` `data-testid` over CSS``, `(>\|≥) ?80% (structural )?overlap`                                                    | T    | P1       |
| Unconditional patterns, DI, size splits | F4, F18, F19, F20                                                              | One deletion arm in the trap batch; non-inferior → delete                                                                   | E    | P1       |
| Safety text pinned before any deletion  | O1 partial                                                                     | CANONICAL rows for trust boundary, path and SSRF text                                                                       | T    | P0       |
| Coverage floor                          | F16                                                                            | **owner decides**: discovery everywhere (recommended), or 70% everywhere                                                    | U    | P2       |
| protect-config fails open on bad input  | H0                                                                             | Decide at implementation; an unparseable payload must not pass silently                                                     | T    | P1       |

A fix that adds more than about 3 net lines counts as new prose. It moves to the eval-gated batch.

### Review

| ID      | Capability                                        | Verdict                                                                                                                                      | Gate | Priority |
| ------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---- | -------- |
| R1      | Evidence bar: no case, no finding (ponytail, ECC) | **strengthen**, deferred until the trap batch shows the rules matter; then a clean decoy fixture measures precision and recall must not drop | E    | P2       |
| R2 / R3 | Run the toolchain first; count the concepts       | **reject**: the effects are too small to detect                                                                                              | –    | –        |
| R4      | One severity scale                                | **have**                                                                                                                                     | –    | –        |
| R5      | Multi-reviewer pipeline                           | **reject**: cost unmeasured                                                                                                                  | –    | –        |

### Hooks

| ID  | Capability                                                          | Verdict                                                                                                                                                                      | Gate | Priority |
| --- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | -------- |
| H1  | Bar-lowering guard (agent-skills prose; ECC `config-protection.js`) | **strengthen**, deferred. 0 suppressions in 183 archived files means no effect is visible today. Build only if a pressure task shows suppressions **and** the owner approves | T U  | P2       |
| H2  | Stop typecheck that blocks                                          | **defer**: 0 type errors in 180 runs                                                                                                                                         | U    | P3       |
| H3  | Inject rules into subagents                                         | **have** (verified)                                                                                                                                                          | –    | –        |
| H4  | Session-start codebase map                                          | **reject**: always-on bytes, no effect measured                                                                                                                              | –    | –        |

H1 terms, if it is built:

- Ask only on unjustified forms.
- Diff the old content against the new.
- Match MultiEdit and Bash writes too.

### Testing, coverage, SDD and other

| ID     | Capability                                                                              | Verdict                                                                                                                 | Gate | Priority |
| ------ | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---- | -------- |
| T1     | Verified RED                                                                            | **have** (`feature`)                                                                                                    | –    | –        |
| T2     | Mutation thinking in generate-tests                                                     | **defer** (too small to detect)                                                                                         | E    | P3       |
| C1–C5  | Node runtime, ASP.NET/EF, FastAPI/Django, React perf/security, API/DB/observability/e2e | **defer** until the trap batch says rules change correctness; then probe first and write only what the model gets wrong | U E  | P3       |
| S1     | `feature` names an installed reviewer                                                   | **owner decides**: one line at most, never `uses:`                                                                      | U    | –        |
| S2, S3 | Spec hard stop; process sized by blast radius                                           | **have**                                                                                                                | –    | –        |
| O2     | Narrow-only overlays                                                                    | **have** (#72)                                                                                                          | –    | –        |
| O3, O5 | "What I skipped" line; negative triggers on agents                                      | **reject**: no effect in ponytail's data; dispatch already 24/24                                                        | –    | –        |
| O4     | Don't re-run unchanged verification                                                     | **reject** (too small to detect)                                                                                        | –    | –        |
| O6     | Per-agent model and effort                                                              | **reject**: no evidence, and it changes every agent family's exact `keys`                                               | –    | –        |

## 9. Language × topic coverage

Depth runs 0–3 and is each recon agent's own rating, so it is an inference. Source:
[`evidence/matrix/coverage.tsv`](evidence/matrix/coverage.tsv).

These are the cells where sigil is below the best of the other four:

| Language   | Topic (sigil vs best)                                                                                  |
| ---------- | ------------------------------------------------------------------------------------------------------ |
| Node       | architecture 0 vs 2, framework 0 vs 2, types 0 vs 1, errors 1 vs 2, testing 1 vs 2, tooling 2 vs 3     |
| C#         | framework 1 vs 3, performance 2 vs 3. Interop, refactoring and upgrade (0 vs 3) are dotnet-only topics |
| Python     | framework 1 vs 3, idioms 2 vs 3, types 1 vs 2                                                          |
| React      | async, framework, idioms, performance, security 2 vs 3; errors 1 vs 2                                  |
| TypeScript | framework 0 vs 2 (frameworks live in stack parts)                                                      |

sigil is equal or ahead everywhere else, Angular included. Coverage is not the bottleneck. The defects in Section 8
are, and new coverage stays deferred (C1–C5).

## 10. Precedence and conflict resolution

**Conceptual order:**

1. Explicit user requirement
2. Repository decisions
3. Project conventions
4. Consumer overlay (narrow-only, #72)
5. Language and framework rules
6. Universal rules
7. Workflow defaults

**Runtime enforcement is a separate question.** Claude Code and Copilot merge every loaded instruction, and nothing
ranks one file over another. So sigil enforces precedence **at build time**:

- `extends` order;
- one family, one skeleton;
- overlays that narrow, never widen;
- catalog-doctrine guards against contradictions inside the catalog.

Contradictions between artifacts get a guard. RETIRED, CANONICAL and the new IMPLIES table are the detector, and
Section 8 lists the ones found. Generic advice never overrides a verified project constraint. Every
tool-default defect (F3, F16, F17) is a case of that rule being broken.

## 11. Token and execution cost

1. Every always-on byte must earn its place.
   - A3 makes growth a deliberate act.
   - A1 and F4 remove what changes nothing.
   - Part 1 measured the cost: 2.4×, and D2's removal was the only win.
2. Skills cost only when they fire, so test firing before content (E8).
3. Deterministic checks replace prose wherever they can: the catalog-doctrine guards, plus H1 if the owner approves.
4. Evals run as one decisive experiment, then as non-inferiority checks on deletions. They are never a standing gate
   on every wording change: at about 12 tasks only large effects are detectable.

**Budget:** calibration ≈ $22, then one interleaved batch ≈ $80–100.

## 12. Validation strategy

| Layer                                  | Mechanism                                                                 | Status                 |
| -------------------------------------- | ------------------------------------------------------------------------- | ---------------------- |
| Structure, schema, references          | `validate`, `sync --check` (20 rules)                                     | have                   |
| Duplicate or contradictory guidance    | `catalog-doctrine.test.ts`: RETIRED, CANONICAL, plus `except` and IMPLIES | strengthen (Section 8) |
| Activation                             | Agent dispatch probe (24/24); skill-firing probe                          | have; E8               |
| Representative tasks, overengineering  | `test/evals/code-quality` (6 tasks, fragmentation metrics)                | have                   |
| Common mistakes                        | Trap tasks with bad references                                            | E2, E3                 |
| Comparison with an unmodified baseline | A fresh `none` arm in every batch                                         | E1, E2                 |
| Token cost                             | `rule-load` ratchet                                                       | A3                     |

**Representative acceptance tests:**

- Each RETIRED or IMPLIES row fails on the unfixed text first (RED), then passes after the fix.
- Each trap's bad reference fails only that trap's hidden test.
- Each statistic is unit-tested against hand-computed exact p-values.

## 13. Roadmap

Each item is one PR, run under the standing procedure (RED first, `ci:local` green, merge on green CI).

| #   | Item                                                                                                                               | Acceptance                                                       | Depends on |
| --- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ---------- |
| 1   | This audit, plus a task-level note on D2 in `results.md` and a fix to the stale PR9 row                                            | Docs merged                                                      | –          |
| 2   | Doctrine-test infrastructure (`except`, IMPLIES) and the **security** class (F5, F6)                                               | Guards fail on the old text and pass on the new                  | 1          |
| 3   | **Wrong-API** class (F7, F12, F13, F14)                                                                                            | Same                                                             | 2          |
| 4   | **Concurrency** class (F1, F8, F10, F11-ts, F15; the profilers' "Critical" grading)                                                | IMPLIES fan-out ⇒ bound passes across all delivered text         | 2          |
| 5   | **Toolchain and test-truth** class (F3, F17, F21)                                                                                  | Same                                                             | 2          |
| 6   | **Family drift** (F2, F9) and safety pins                                                                                          | Same                                                             | 2          |
| 7   | A4 `limits`, A3 ratchet, H0                                                                                                        | No hard-coded provider limit; ratchet test                       | –          |
| 8   | Eval v2 infrastructure: sign-flip test, fresh baseline, E3 bad references, judge selftest, `typeErrors` and `suppressions` metrics | Unit-tested in `evals:check`                                     | –          |
| 9   | Trap calibration (about 12 candidates, about $22)                                                                                  | ≥ 6 survive, or stop and record it                               | 8          |
| 10  | Interleaved batch: `none`, master, deletion arm (F4, F18–F20)                                                                      | Pre-registered; master vs `none` on traps; deletion non-inferior | 9          |
| 11  | E8 firing probe                                                                                                                    | Recorded before any skill-prose edit                             | 8          |

The owner decides these before any work starts on them:

- H1, the bar-lowering hook;
- H2, Stop typecheck;
- a Copilot hook target;
- a reviewer Bash guard;
- C1–C5, new coverage;
- S1, the one `feature` line;
- F16, the coverage floor.

## 14. Risks, assumptions, open questions

- **The API facts behind F7 and F12–F14 came from the senior's memory.** Each fix PR cites the vendor docs before
  merging.
- **Trap tasks may all sit at ceiling, as ECC's (72/72) and ponytail's (100% safe) did.** The ≥ 6 rule turns that
  into a decision, not a stall.
- **Session limits.** Part 1 lost 9–15 of 18 runs per batch to limits and re-ran them. Invalid runs are never
  recorded.
- **Unchecked claims.** F17–F19 (senior) and Copilot hook support (`docs/ideas/copilot-hooks.md`) were not re-checked.
  They are re-checked when their PR starts.
- **Coverage depths are self-rated by the recon agents.**

## Traceability

Each significant recommendation and the evidence behind it. Paths outside sigil are in the benchmarked repos at the
commits above.

| Recommendation                             | Evidence                                                                                                                                      |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Errata guard classes                       | `evidence/verification.md` (each defect re-read at `path:line`); `evidence/panel/senior.md`, `rebuttal-senior.md`                             |
| E1 sign-flip, fresh baseline               | dotnet `CONTRIBUTING.md:406`; `evidence/panel/sme.md` and `sme-power.js`; `test/evals/code-quality/runs/b1-current.jsonl` (T5)                |
| E2 traps, ≥ 2/3 calibration, ≥ 6 survivors | ECC `question-effectiveness.md:161-205`; ponytail `agentic-safety.md:51`; `evidence/panel/rebuttal-cto.md`, `rebuttal-sme.md`, `reb-power.js` |
| E3 bad reference                           | ponytail `agentic/README.md:68-92`; dotnet `eng/eval-quality` selftest                                                                        |
| E8 firing probe                            | agent-skills `evals/README.md:53`                                                                                                             |
| A1 deletion ablation                       | dotnet `writing-for-baseline-delta.md:9-39`; `test/evals/code-quality/results.md` (D2, PR4–PR7)                                               |
| A2 reject, H3 have, H2 mechanism           | Claude Code docs, cited in `evidence/verification.md`                                                                                         |
| A3 ratchet                                 | ECC lean profile; `scripts/rule-load.cjs`                                                                                                     |
| A4 limits                                  | `src/commands/sync/conformance/rules/description-budget.ts:20`; CLAUDE.md provider-limits invariant                                           |
| O1 safety pins                             | ponytail `check-rule-copies.js:44-56`; `test/catalog-doctrine.test.ts:48-55`                                                                  |
| H1 defer                                   | agent-skills `constraint-driven-development/SKILL.md:206-214`; ECC `config-protection.js`; `evidence/panel/sme.md` (0 of 183 files)           |
| S1 one line only                           | `src/commands/add/co-install.ts:12`                                                                                                           |
| T1 have                                    | `catalog/shared/skills/feature/SKILL.md:103-104`                                                                                              |
