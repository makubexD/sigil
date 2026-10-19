# Results

## Hypotheses (registered 2026-10-14, before any run)

From the benchmark pilot (docs/audits/2026-10-14, n=1): with sigil's TypeScript rules the code was
more rigorous but larger, with unrequested options and types.

- **H1 (B0)**: the current rules inflate. Over 18 paired runs, `current` has more inflation than
  `none` (one-sided sign test, p ≤ 0.05), with hidden-test correctness at least equal.
- **H2 (PR4, scope to request)**: a "write only what the task asks" ladder reduces inflation against
  `current` (p ≤ 0.05) without losing correctness, held-out tasks included.
- **H3 (PR5, guards)**: guards on patterns, size limits, injection, config and scale reduce
  inflation further against the PR4 baseline, under the same acceptance.
- **H4 (PR6, reviewer)**: with the "Design and simplicity" section, the reviewer finds at least
  baseline + 2 of R1's 7 seeded defects, with none invented.

If H1 is false (no measurable inflation in `current`), PR4 and PR5 have nothing to fix and are
dropped, unless correctness is the gap.

## Round 2 hypotheses (registered 2026-10-14, after B0 and before any round-2 run)

B0 refuted H1 and showed, exploratorily, that the rules fragment the code (more top-level
declarations and lines at the same correctness). Round 2 tests that effect on **fresh runs only**:
B0's data suggested the hypotheses and is not used to confirm them.

- **Baseline B1**: 18 fresh `current` runs at the commit under change, same model as B0.
- **Primary metric**: `declarations` (top-level functions, classes, interfaces, type aliases, enums
  and variables in `src/`, via the TypeScript AST); lower is better.
- **H2b (PR4, scope first)** and **H3b (PR5, guards)**: the candidate has fewer declarations than
  its baseline (B1 for PR4; the merged PR4 result, or B1 if PR4 is rejected, for PR5).

A candidate is accepted when all of these hold against its baseline:

1. **Fragmentation drops**: one-sided sign test on `declarations` over the decided pairs, p ≤ 0.05,
   with at least 10 decided pairs.
2. **Correctness holds**: hidden tests pass in at least as many runs, and no held-out task (T5, T6)
   loses a passing run.
3. **Readability holds**: the blind judge (`judge.mjs`, `claude-sonnet-5-5`, X/Y order randomised)
   does not prefer the baseline on readability at p ≤ 0.05 (one-sided sign test). Shorter code the
   judge finds harder to read is a rejection, not a win.
4. **Bytes do not grow**: `npm run rule-load` for TypeScript is not above the baseline's.

Lines of code, inflation and cost are reported, not gated.

## Round 3 hypotheses: ablation (registered 2026-10-15, after round 2 and before any round-3 run)

Round 2 showed that wording added to the same rule set does not undo the fragmentation B0 measured
(62 declarations without rules, about 156 with them). Round 3 asks which rule drives it, by
installing the full TypeScript rule set and removing one rule file (`run.mjs --drop`):

| Arm | Removed                                                    | Why it is a suspect                                                                |
| --- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| A1  | `typescript-ts-code-quality` (inlines `shared/clean-code`) | 20-line and 4-parameter limits, named constants                                    |
| A2  | `typescript-ts-conventions`                                | `as const` objects, readonly value objects, factory functions, exhaustive switches |
| A3  | `typescript-ts-documentation`                              | documentation on every export, which may favour more, smaller named units          |
| A4  | `typescript-ts-async`                                      | accept and propagate `AbortSignal`, timeouts, concurrency helpers                  |

Each arm: 18 fresh runs (T1–T6 × 3), same model, compared with B1 (`runs/b1-current.jsonl`).

- **H5k (k = 1..4)**: arm Ak has fewer top-level `declarations` than B1. One-sided sign test with a
  Bonferroni threshold for four tests: **p ≤ 0.0125**, with at least 10 decided pairs.
- A rule whose arm passes H5k is named a **driver**; the fix that follows edits that rule and goes
  through round-2 acceptance (all four criteria) as its own candidate.
- Correctness per arm is reported: an arm that loses hidden tests shows the rule matters for
  correctness, which weighs against removing it.
- If no arm passes, no single rule drives fragmentation and the round closes with no catalog change.

## Round 4 hypothesis: remove the split gate (registered 2026-10-16, after A1 and before any D1 run)

A1 (the code-quality rule removed, with the `clean-code` base it inlines) passed H51. Its archived
source shows what goes: top-level functions 84 in B1 vs 38 in A1, interfaces 28 vs 17, named literal
constants 23 vs 21. So the function-size gate drives fragmentation, not the magic-number line.
Round 2 kept the gate and added softer wording next to it, which did not move the count. D1 removes
the gate instead of qualifying it:

- `clean-code`: "extract a part when it has its own name and reason to change, never to meet a line
  count" replaces "if you need to scroll to see the end of a function, it is too long".
- Every language's structure slot: "Max 20 lines … split into smaller units before proceeding"
  becomes signals (steps that need comments, more than 4 parameters), "not counts to split to". God
  Object thresholds stay. The refactor specialists' Extract Function trigger loses its line count.

**Candidate D1**: `625f794` (branch `feat/split-by-responsibility`), 18 fresh runs (T1–T6 × 3), same
model, against B1 (`runs/b1-current.jsonl`).

- **H6**: D1 has fewer top-level `declarations` than B1, accepted under all four round-2 criteria
  (p ≤ 0.05 with at least 10 decided pairs; correctness held, held-out tasks included; the blind
  judge does not prefer B1 on readability; TypeScript rule-load not above B1's, 40,872 bytes). One
  test, so no Bonferroni correction.
- The judge runs only if criteria 1 and 2 pass.
- Reported, not gated: top-level functions and interfaces per arm, lines, cost.
- The eval measures TypeScript only. The same wording change in the other four languages rides on
  this result; it is not measured separately.

## Round 5 hypothesis: no split prose (registered 2026-10-16, after D1 and before any D2 run)

D1 replaced the split gate with a softer split rule and the agent split into modules instead
(round 4 reading). D2 removes every sentence that tells the agent when to split a function: the
`clean-code` "small, single-purpose functions" bullet, and the line and parameter limits in every
language's structure slot (only the God Object threshold stays). The refactor specialists' Extract
Function loses its line count, as in D1.

**Candidate D2**: `7858063` (branch `feat/no-split-prose`), 18 fresh runs (T1–T6 × 3), same model,
against B1.

- **H7**: D2 has fewer top-level `declarations` than B1, accepted under all four round-2 criteria
  (p ≤ 0.05 with at least 10 decided pairs; correctness held, held-out tasks included; the blind
  judge does not prefer B1 on readability; TypeScript rule-load not above 40,872 bytes, D2 is
  40,536). One test.
- Added for this round, because D1 traded functions for modules: **inflation must not rise**
  (B1 has 0: D2's inflation is non-zero in at most one of the 18 runs). A D2 that passes
  criterion 1 by moving code into new files or exports is rejected.
- The judge runs only if criteria 1, 2 and the inflation check pass.
- Reported, not gated: functions and interfaces per arm, lines, cost.
- TypeScript only; the other four languages ride on this result.

## Baseline B2: PR8 check (registered 2026-10-16, after D2 merged and before any B2 run)

Since D2 (`7858063`) the only catalog change on master is PR8 (#69): two `clean-code` lines, one on
names (domain role, predicate booleans, units) and one asking for a `shortcut:` comment on a known
simplification. PR8 merged without an eval run. B2 measures it.

**Baseline B2**: master `fdea053`, 18 fresh `current` runs (T1–T6 × 3), same model, against D2
(`runs/d2.jsonl`).

- **H9**: PR8 does not bring back the fragmentation D2 removed. Kept when all hold:
  1. hidden tests pass in at least as many runs as D2 (18), and no held-out run (T5, T6) loses a pass;
  2. declarations do not rise: the one-sided sign test for B2 above D2 is not significant
     (p > 0.05), counted only when at least 10 pairs are decided;
  3. inflation is non-zero in at most one of the 18 runs.

  If 1 or 2 fails, PR8's lines are a candidate for removal (a separate registered round, not this
  one). If fewer than 10 pairs are decided, 2 holds: no measurable effect.

- Reported, not gated: `shortcut:` comments per run, lines, functions, cost, and T6 declarations
  next to D2 (26) and B1 (18), since T6 rose in all three D2 runs.
- No judge: H9 is about not regressing, and the judge only runs on a candidate that passes 1–3.

## Erratum 2026-10-19: the T1 prompt was missing a line

`run.mjs` sent only the prompt lines that start with `>`, and Prettier had dropped the `>` from the
line continuing T1's wrapped `Order` type. Every T1 run before `ca00aa4` was told
`` `{ id: string; customerId: `` and then `summarizeOrders(...)`, without `amountCents` and
`status`. Every arm got the same prompt, so the comparisons above stand. T1's absolute figures
before `ca00aa4` are not comparable with later ones. `scenarios.mjs` now throws on such a line, and
Prettier skips `scenarios.md`.

## Trap tasks: calibration and the decisive batch (registered 2026-10-19, before any trap run)

The 2026-10-16 benchmark (`docs/audits/2026-10-16/README.md` § 8, E2 and A1) asks whether sigil's
rules change correctness at all. T1–T6 cannot say, since every arm passes them. C1–C12
(`scenarios.md`, `key.md` § Trap checks) are tasks where the obvious first implementation is wrong.
Each one's trap check is the `fails` test in `badrefs.json`.

**Calibration** (roadmap item 9): `none` arm, 3 runs of each of C1–C12, one model, run with
`node run.mjs --arm none --install none --tasks C1,…,C12 --runs 3`. A run that hit an API or usage
limit is not recorded and is re-run.

- **H10**: at least 6 traps catch the unguided model. A trap is **kept** when `none` fails its trap
  check in at least 2 of its 3 runs (`node measure.mjs calibrate`). A run where no hidden test
  passes is broken, not trapped.
  - 6 or more kept: run the batch below on the kept traps only.
  - Fewer than 6 kept: **stop**. Record that the unguided model already avoids these traps, run no
    batch, and add no correctness prose to the rules until a new trap set says otherwise.

**Batch** (roadmap item 10, only if H10 holds): three arms, all on the same day, model and CLI
version.

- `none` installs nothing.
- `master` installs the TypeScript rules at master's SHA on the day.
- `delete` installs the same rules minus the lines A1 targets: F4 (unconditional pattern and DI
  advice), F18, F19 and F20 (`docs/audits/2026-10-16/evidence/panel/senior.md`). Its exact diff and
  SHA are recorded here before any batch run.

Tasks: the kept traps plus T1, T2, T4, T5 and T6, 3 runs each. T3 is left out because every arm
passes it identically. Runs alternate arms within each (task, run): `none`, `master`, `delete`,
with the order rotating by one each run.

- **H11 (rules change correctness)**: `master` falls into fewer traps than `none`. Statistic: an
  exact one-sided permutation test that shuffles arm labels within each kept trap (stratified by
  task), on the count of trapped runs. Holds when p ≤ 0.05.
  - If H11 fails, correctness prose stops growing, and the catalog moves toward errata and minimal
    style.
- **H12 (the deletion is non-inferior)**: all of these hold:
  1. `delete` is trapped in at most 2 more runs than `master` across the kept traps;
  2. on T1, T2, T4–T6, `delete`'s hidden tests pass in at least as many runs as `master`'s, less one;
  3. `delete`'s declarations are not significantly higher than `master`'s (sign-flip p > 0.05).

  If H12 holds, the A1 lines are deleted in one PR. If it fails, the failing trap names the lines
  to keep.

- Reported, not gated: `typeErrors`, `suppressions`, inflation, cost and turns per arm.

## Runs

| Date       | Comparison                                                          | Commits                                                                                    | Model             | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-14 | B0: `none` vs `current` (`runs/b0-*.jsonl`)                         | `b6fbbe4`                                                                                  | `claude-opus-5-5` | **H1 false.** Hidden tests 18/18 in both arms. Inflation 0 in every run of both arms: 18 ties, 0 decided pairs. Cost $4.17 vs $10.14, turns 158 vs 237                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 2026-10-15 | B1: fresh `current` baseline (`runs/b1-current.jsonl`)              | `b6fbbe4` (catalog unchanged on master)                                                    | `claude-opus-5-5` | Hidden tests 18/18. Declarations 161, lines 996, cost $9.88. An earlier B1 attempt hit the usage limit; every run was rejected as invalid and none recorded                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 2026-10-15 | H2b: PR4 scope-first ladder vs B1 (`runs/c-pr4.jsonl`)              | `8a80bc2` (branch `feat/scope-to-request`, not merged)                                     | `claude-opus-5-5` | **Rejected: no measurable effect.** Declarations lower in 5 pairs, higher in 3, 10 ties: 8 decided pairs (< 10), p = 0.363. Hidden tests 18/18 vs 18/18, held out 6 → 6. Lines 996 → 965 (8 lower, 7 higher). Bytes 40,872 → 40,846. Judge not run: criterion 1 already fails. 7 runs hit the usage limit and were re-run                                                                                                                                                                                                                                                                            |
| 2026-10-15 | H3b: PR5 fragmentation guards vs B1 (`runs/c-pr5.jsonl`)            | `4c70a59` (branch `feat/code-quality-guards`, not merged)                                  | `claude-opus-5-5` | **Rejected: not significant.** Declarations lower in 6 pairs, higher in 4, 8 ties: 10 decided pairs, p = 0.377. Total declarations 161 → 145, lines 996 → 944 (8 lower, 7 higher). Hidden tests 18/18 vs 18/18, held out 6 → 6. Bytes 40,872 → 40,863. Judge not run: criterion 1 fails                                                                                                                                                                                                                                                                                                              |
| 2026-10-15 | H51: A1, code-quality rule removed (`runs/a1.jsonl`)                | `b6fbbe4`, `--drop typescript-ts-code-quality`                                             | `claude-opus-5-5` | **Driver.** Declarations lower in 13 pairs, higher in 0, 5 ties: p = 0.000122 (≤ 0.0125). Total 161 → 100; top-level functions 84 → 38, interfaces 28 → 17, named literal constants 23 → 21. Lines 996 → 913. Hidden tests 17/18: T5#2 failed only its 500k-operation timing check, and passed on re-run (timing, not logic)                                                                                                                                                                                                                                                                         |
| 2026-10-15 | H52: A2, conventions removed (`runs/a2.jsonl`)                      | `b6fbbe4`, `--drop typescript-ts-conventions`                                              | `claude-opus-5-5` | **Not a driver.** Declarations lower in 3 pairs, higher in 7, 8 ties: p = 0.945. Total 161 → 164. Hidden tests 17/18: T5#1 failed only its timing check and passed on re-run                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 2026-10-16 | H53: A3, documentation removed (`runs/a3.jsonl`)                    | `b6fbbe4`, `--drop typescript-ts-documentation`                                            | `claude-opus-5-5` | **Not a driver.** Declarations lower in 5 pairs, higher in 4, 9 ties: 9 decided pairs, p = 0.500. Total 161 → 156, lines 996 → 944. Hidden tests 18/18                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 2026-10-16 | H54: A4, async removed (`runs/a4.jsonl`)                            | `b6fbbe4`, `--drop typescript-ts-async`                                                    | `claude-opus-5-5` | **Not a driver.** Declarations lower in 4 pairs, higher in 5, 9 ties: 9 decided pairs, p = 0.746. Total 161 → 163, lines 996 → 1,063. Hidden tests 18/18                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 2026-10-16 | H6: D1, split gate removed, vs B1 (`runs/d1.jsonl`)                 | `625f794` (branch `feat/split-by-responsibility`, not merged)                              | `claude-opus-5-5` | **Rejected: not significant, and it inflates.** Declarations lower in 7 pairs, higher in 3, 8 ties: 10 decided pairs, p = 0.172. Total 161 → 149; functions 84 → 64. Lines 996 → 1,055, higher in 13 of 17 decided pairs. Inflation 0 → 14, all in T1: every T1 run moved retry into its own `src/retry.ts` with extra exports. Hidden tests 18/18, held out 6 → 6. Bytes 40,872 → 40,859. Judge not run: criterion 1 fails                                                                                                                                                                          |
| 2026-10-16 | H4: PR6 reviewer "Design and simplicity" vs base, R1 (`runs/r1-*/`) | base `b6fbbe4`, candidate `9f07022` (branch `feat/reviewer-design-simplicity`, not merged) | `claude-opus-5-5` | **Rejected: +1, gate is +2.** Mean seeded defects found per run: base 5.0 (6, 4, 5), candidate 6.0 (6, 6, 6). No invented findings in the candidate. Grading below                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 2026-10-16 | H7: D2, no split prose, vs B1 (`runs/d2.jsonl`)                     | `7858063` (branch `feat/no-split-prose`)                                                   | `claude-opus-5-5` | **Accepted.** Declarations lower in 11 pairs, higher in 3, 4 ties: 14 decided pairs, p = 0.0287. Total 161 → 120; functions 84 → 44, types 15 → 6, interfaces 28 → 27, named literal constants 23 → 38. Hidden tests 18/18, held out 6 → 6. Inflation 0 in all 18 runs. Judge (`runs/judge-d2.jsonl`): readability B1 better 5, D2 better 4, 9 ties, p = 0.500 (no preference); minimalism D2 better 7, B1 better 5. Bytes 40,872 → 40,536. Lines 996 → 1,000 (5 lower, 10 higher). Cost $9.88 → $10.17. T6 (held out) went up in all 3 runs, 18 → 26. 15 runs hit the session limit and were re-run |
| 2026-10-16 | H9: B2, PR8 naming and `shortcut:` lines, vs D2 (`runs/b2.jsonl`)   | `fdea053` (master)                                                                         | `claude-opus-5-5` | **Kept.** Declarations lower in 6 pairs, higher in 6, 6 ties: 12 decided pairs, one-sided p (B2 > D2) = 0.613. Total 120 → 114. Hidden tests 18/18 vs 18/18, held out 6 → 6. Inflation 0 in all 18 runs. Lines 1,000 → 927 (10 lower, 5 higher, p = 0.151). Cost $10.17 → $9.58. `shortcut:` comments: 1 in 18 runs (T4#3, an assumption that `now` never goes backwards). T6 declarations 26 → 13 (B1: 18). 9 runs hit the session limit and were re-run                                                                                                                                            |

Rounds 3, 4 and 5 runs hit the usage limit several times; each rejected run was re-run, none recorded.

**Task-level re-reading of D2 (2026-10-19).** The p-values above pair runs by `task#run`, so they count 18 runs where
there are 6 distinct tasks. Counted by task, D2 vs B1 is weaker:

- Mean declarations per task fell in 4 tasks (T1, T2, T4, T5), rose in 1 (T6) and tied in T3.
- A sign test over the 5 decided tasks gives p = 0.188. An exact sign-flip over per-task means gives p = 0.0625
  (absolute differences) or 0.125 (relative).
- B1's T5 runs (10, 3, 11 declarations) are the highest of any arm; every other arm's T5 runs fall between 2 and 11,
  mostly 2 to 5. Every comparison against B1 therefore started with a T5 win.

D2 stays merged. It removed prose and held hidden tests at 18/18, so it meets a non-inferiority bar. Its "accepted"
label rests on run counting, though. From eval v2 on (`docs/audits/2026-10-16/README.md` § 8, E1), comparisons
register a task-level statistic and run a fresh interleaved baseline.

### R1 grading (key.md, R1)

A defect counts once per run when the reply names it and its location. ✓ = found.

| #   | Seeded defect                                            | base 1 | base 2 | base 3 | cand 1 | cand 2 | cand 3 |
| --- | -------------------------------------------------------- | ------ | ------ | ------ | ------ | ------ | ------ |
| 1   | Unrequested `logger` used only to hide the error         |        |        |        |        |        |        |
| 2   | Abstraction with one implementation, `aggregator` option | ✓      |        |        | ✓      | ✓      | ✓      |
| 3   | O(n²) `rows.find`                                        | ✓      | ✓      | ✓      | ✓      | ✓      | ✓      |
| 4   | Sequential per-order lookup (N+1)                        | ✓      | ✓      | ✓      | ✓      | ✓      | ✓      |
| 5   | Every order buffered before aggregating                  | ✓      |        | ✓      | ✓      | ✓      | ✓      |
| 6   | `x2`                                                     | ✓      | ✓      | ✓      | ✓      | ✓      | ✓      |
| 7   | Catch logs and continues, truncating                     | ✓      | ✓      | ✓      | ✓      | ✓      | ✓      |
|     | **Found**                                                | 6      | 4      | 5      | 6      | 6      | 6      |

The lines that decided the varying cells:

- #2: base 1 "Either take a factory or drop the option, since nothing uses it"; base 2 and 3 only note
  that a reused aggregator double-counts (a state bug, not the unneeded abstraction). Candidate 1
  "The interface, class and factory have only one implementation"; candidate 2 "`OrderAggregator`,
  `createAggregator` and the `opts.aggregator` option exist for one implementation"; candidate 3
  "a mutable strategy with only one implementation".
- #5: base 1 "Every order, including `pending` ones, is held in memory before aggregation"; base 3
  "Every order is held in memory before any totals are computed"; base 2 names memory only for the
  paging cycle. All three candidates name it ("All pages are held in memory", "Every order is held
  in memory", "Every page is held in memory").
- #1: no run in either arm calls the `logger` option unrequested; they flag its `info` level or
  `String(err)`, which is defect #7's logging, not the surface.

Exploratory (not registered): the section made the design finding reliable (#2 in 3 of 3 runs vs
1 of 3), but the gate was +2 on a base of 5, so only a perfect candidate could pass, and #1 was
missed everywhere. A rerun would need a new registration.

**Round 3 reading.** One rule drives the fragmentation: the code-quality rule with the
`clean-code` base it inlines. Without it the agent writes half the top-level functions at the same
correctness. Conventions, documentation and async do not move the count. The two T5 failures (A1,
A2) were the 3 s budget on 500k cache operations, close to the limit in every arm; neither is a
behaviour failure, so neither rule is shown to matter for correctness. Round 4 tests the fix.

**Round 4 reading.** Removing the line-count gate is not enough, and the replacement wording made
things worse in another way. "Extract a part when it has its own name and its own reason to change"
reads as an instruction to extract: functions fell (84 → 64), but T1's retry moved into its own
module in all three runs, the first surface inflation this eval has measured, and lines grew.
Exploratory (not registered): A1 removed the whole rule and halved the functions without adding
modules, so prose that says _when to split_, in any form, may be what drives it. Testing that needs
a hypothesis registered first.

**Round 5 reading.** Prose that says when to split was the driver inside the code-quality rule.
Removing it (with nothing in its place) cut top-level functions nearly in half at the same
correctness, with no new files or exports and no readability cost the judge could see. A1, which
dropped the whole rule, went to 100 declarations; D2 reaches 120 while keeping the rest of the rule.
D2 is the next baseline. Exploratory (not registered): named literal constants rose 23 → 38 while
functions fell, so the unconditional named-constant line may now carry the decomposition; and the
held-out T6 went up in every run (18 → 26), which a fresh baseline should watch.

**B2 reading.** PR8 did not bring back the fragmentation D2 removed: all three H9 criteria hold, and
B2 is the baseline from here. The `shortcut:` marker appeared once in 18 runs, on a real
assumption, so the line costs little and is rarely triggered on these tasks; its use is not gated.
Exploratory (not registered): D2's T6 rise (18 → 26) did not repeat (13 in B2), which reads as
run-to-run noise on a three-run task, not an effect of D2.

**Named-constant line: not a candidate (checked 2026-10-16 from existing counts, no new runs).**
The round 5 lead does not survive a look at the arms already run. The magic-number line reaches
TypeScript only through `ts-code-quality`, which inlines `clean-code`, so A1 ran without it. Named
literal constants per task, B1 / A1 / D2: T1 11 / 8 / 9, T2 12 / 12 / 13, T6 0 / 1 / 16, and none
in T3–T5. Without the line, A1 named as many constants in T1 and T2 as the arms with it. D2's whole
rise is T6 (16 of its 26 T6 declarations), and the line is identical in B1 and D2, so the line
cannot explain it. Round 6 was not registered. T6 sources stay unread; the next baseline run
re-measures T6.

**Round 2 reading.** Neither wording change moved fragmentation measurably. B0 put the gap between
no rules and the current rules at 62 vs 156 top-level declarations, and prose added on top of the
same rule set barely shifts it. Exploratory (not a registered result): the hard limits themselves
("max 20 lines per function, max 4 parameters") still stand in every slot, and other always-loaded
rules (conventions, documentation, the magic-number line in `clean-code`) may push the same way.
Finding the driver needs ablation arms (the rule set minus one rule at a time), registered first.

B0 setup: the user-level instruction file was loaded in both arms (README, known confound). Two
earlier attempts were discarded before any result was read: one ran in an 8.3 short temp path that
blocked every write, one hit the usage limit (API errors); both are fixed in `run.mjs`.

**Consequence under the registered rule:** H1 is false, so H2 and H3 as written (surface inflation)
have nothing to measure. PR4 and PR5 are not accepted on this hypothesis.

### Exploratory (not registered; may motivate a new hypothesis, never gate one)

The registered metric counts only the public surface. The rules' effect shows up inside the file:

- Source lines: `current` larger in 13 of 17 decided pairs (one-sided sign test p = 0.025).
  T1: 53–84 lines without rules, 113–115 with them; T3 (the bug fix): 8 vs 14 in every run.
- Top-level declarations (functions, constants, types) across the 18 runs: 62 without rules, 156
  with them; more in 13 pairs, fewer in none.
- T1 run 1 with rules: 9 helper functions, 2 internal types and 3 named constants around the same
  logic the no-rules run wrote with one helper. This matches the senior panel's reading of
  "split into smaller units before proceeding" (structure limits) and the unconditional
  named-constant rule: decomposition to satisfy a count, not a responsibility.

These numbers come from the data that suggested them, so they cannot confirm anything. Testing
them needs a hypothesis registered first and fresh runs.
