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

## Runs

| Date       | Comparison                                  | Commits   | Model             | Result                                                                                                                                                 |
| ---------- | ------------------------------------------- | --------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-10-14 | B0: `none` vs `current` (`runs/b0-*.jsonl`) | `b6fbbe4` | `claude-opus-5-5` | **H1 false.** Hidden tests 18/18 in both arms. Inflation 0 in every run of both arms: 18 ties, 0 decided pairs. Cost $4.17 vs $10.14, turns 158 vs 237 |

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
