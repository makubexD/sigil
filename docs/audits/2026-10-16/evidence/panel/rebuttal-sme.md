# SME: rebuttal

F = fact, I = inference. Simulation: `bench2/P/reb-power.js`.

## 1. Where others are wrong

- **CTO #4 makes the sign test primary.** At a 20% effect its power is .58; sign-flip's is .84.
- **The CTO's 10 × 3 design cannot decide the trap question.** Only 4 of its 10 tasks are traps, and the 6 ceiling tasks add no correctness signal. At K = 4 the smallest possible task-level p is 1/16, so p ≤ .05 is impossible.
- **The CTO's stop rule cannot fire.** A trap counts only if `none` fails it, so "`none` passes the traps" never happens. The real stop condition: on fresh runs, master fails no less often than `none`. Calibration runs must not be reused as the `none` arm, because regression to the mean would favour "rules help."
- **The CTO kills E8 on a power argument that does not apply.** E8 probes firing per prompt, and one clause moved firing from 7/27 to 21/27 (F). That effect is large.

## 2. Concessions

- **Run one decisive experiment first.** My 84-run standing gate waits until that experiment shows an effect.
- **Kill R2, R3 and O4; defer T2.** Their effects are too small to detect.
- **Adopt the CTO's ≥ 2/3 calibration filter.**
- **H2 comes after H1** and stays verify-first.

## 3. Minimal eval-v2

- **Tasks.** About 12 TypeScript trap candidates, each with a bad reference that E3 checks ($0). Calibrate each on 3 `none` runs and keep the 8 that `none` fails at least twice.
- **Runs.** 8 × 3 × 2 arms = 48 runs: fresh `none` against master, interleaved, on the same CLI version.
- **Statistic.** Primary: an exact stratified permutation on failures. In simulation (I) its type I error was ≤ .04, and its power was .63 at a 30-point effect and .97 at 50 points. Secondary: sign-flip on task means.
- **Budget.** About 84 runs, $46–59, 4 ed.
- **Reuse.** The deletion ablation reuses these traps as its non-inferiority set.

## 4. Top 5

1. Errata plus the F1/F8/F11 class (T).
2. E1 sign-flip and the E3 selftest in `evals:check`, with a fresh baseline for every comparison.
3. The trap experiment, then the F4/F19/F20 deletion ablation.
4. The E8 firing probe.
5. H1, if the owner approves. It asks only on unjustified markers, diffs old against new, and also matches MultiEdit and Bash writes.
