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

## Runs

| Date       | Comparison                                               | Commits                                                       | Model             | Result                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------- | -------------------------------------------------------- | ------------------------------------------------------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-14 | B0: `none` vs `current` (`runs/b0-*.jsonl`)              | `b6fbbe4`                                                     | `claude-opus-5-5` | **H1 false.** Hidden tests 18/18 in both arms. Inflation 0 in every run of both arms: 18 ties, 0 decided pairs. Cost $4.17 vs $10.14, turns 158 vs 237                                                                                                                                                                                                                                                                      |
| 2026-10-15 | B1: fresh `current` baseline (`runs/b1-current.jsonl`)   | `b6fbbe4` (catalog unchanged on master)                       | `claude-opus-5-5` | Hidden tests 18/18. Declarations 161, lines 996, cost $9.88. An earlier B1 attempt hit the usage limit; every run was rejected as invalid and none recorded                                                                                                                                                                                                                                                                 |
| 2026-10-15 | H2b: PR4 scope-first ladder vs B1 (`runs/c-pr4.jsonl`)   | `8a80bc2` (branch `feat/scope-to-request`, not merged)        | `claude-opus-5-5` | **Rejected: no measurable effect.** Declarations lower in 5 pairs, higher in 3, 10 ties: 8 decided pairs (< 10), p = 0.363. Hidden tests 18/18 vs 18/18, held out 6 → 6. Lines 996 → 965 (8 lower, 7 higher). Bytes 40,872 → 40,846. Judge not run: criterion 1 already fails. 7 runs hit the usage limit and were re-run                                                                                                   |
| 2026-10-15 | H3b: PR5 fragmentation guards vs B1 (`runs/c-pr5.jsonl`) | `4c70a59` (branch `feat/code-quality-guards`, not merged)     | `claude-opus-5-5` | **Rejected: not significant.** Declarations lower in 6 pairs, higher in 4, 8 ties: 10 decided pairs, p = 0.377. Total declarations 161 → 145, lines 996 → 944 (8 lower, 7 higher). Hidden tests 18/18 vs 18/18, held out 6 → 6. Bytes 40,872 → 40,863. Judge not run: criterion 1 fails                                                                                                                                     |
| 2026-10-15 | H51: A1, code-quality rule removed (`runs/a1.jsonl`)     | `b6fbbe4`, `--drop typescript-ts-code-quality`                | `claude-opus-5-5` | **Driver.** Declarations lower in 13 pairs, higher in 0, 5 ties: p = 0.000122 (≤ 0.0125). Total 161 → 100; top-level functions 84 → 38, interfaces 28 → 17, named literal constants 23 → 21. Lines 996 → 913. Hidden tests 17/18: T5#2 failed only its 500k-operation timing check, and passed on re-run (timing, not logic)                                                                                                |
| 2026-10-15 | H52: A2, conventions removed (`runs/a2.jsonl`)           | `b6fbbe4`, `--drop typescript-ts-conventions`                 | `claude-opus-5-5` | **Not a driver.** Declarations lower in 3 pairs, higher in 7, 8 ties: p = 0.945. Total 161 → 164. Hidden tests 17/18: T5#1 failed only its timing check and passed on re-run                                                                                                                                                                                                                                                |
| 2026-10-16 | H53: A3, documentation removed (`runs/a3.jsonl`)         | `b6fbbe4`, `--drop typescript-ts-documentation`               | `claude-opus-5-5` | **Not a driver.** Declarations lower in 5 pairs, higher in 4, 9 ties: 9 decided pairs, p = 0.500. Total 161 → 156, lines 996 → 944. Hidden tests 18/18                                                                                                                                                                                                                                                                      |
| 2026-10-16 | H54: A4, async removed (`runs/a4.jsonl`)                 | `b6fbbe4`, `--drop typescript-ts-async`                       | `claude-opus-5-5` | **Not a driver.** Declarations lower in 4 pairs, higher in 5, 9 ties: 9 decided pairs, p = 0.746. Total 161 → 163, lines 996 → 1,063. Hidden tests 18/18                                                                                                                                                                                                                                                                    |
| 2026-10-16 | H6: D1, split gate removed, vs B1 (`runs/d1.jsonl`)      | `625f794` (branch `feat/split-by-responsibility`, not merged) | `claude-opus-5-5` | **Rejected: not significant, and it inflates.** Declarations lower in 7 pairs, higher in 3, 8 ties: 10 decided pairs, p = 0.172. Total 161 → 149; functions 84 → 64. Lines 996 → 1,055, higher in 13 of 17 decided pairs. Inflation 0 → 14, all in T1: every T1 run moved retry into its own `src/retry.ts` with extra exports. Hidden tests 18/18, held out 6 → 6. Bytes 40,872 → 40,859. Judge not run: criterion 1 fails |

Rounds 3 and 4 runs hit the usage limit several times; each rejected run was re-run, none recorded.

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
