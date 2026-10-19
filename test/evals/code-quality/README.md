# Code-quality eval

Does the catalog's TypeScript guidance make an agent write correct code without inflating it? This
eval measures rules, not a skill: the arms differ only in which sigil rules are installed into the
project before the agent starts. Background and the plan it gates: `docs/audits/2026-10-14/`.

| File              | Contents                                                                                              |
| ----------------- | ----------------------------------------------------------------------------------------------------- |
| `scenarios.md`    | Prompts T1–T6 (T5, T6 held out), trap tasks C1–C12, and the reviewer scenario R1                      |
| `scenarios.mjs`   | Reads the prompts; throws on a prompt line that lost its `>`                                          |
| `surface.json`    | The files, exports and option fields each task asks for                                               |
| `key.md`          | Hidden checks, the inflation definition, the judge rubric, R1's seeded defects                        |
| `fixture/`        | The starting project (Node 22, TypeScript, no dependencies); `fixture-start/T3/` adds T3's buggy file |
| `fixture-hidden/` | Hidden tests per task, copied in only after the agent finishes                                        |
| `fixture-good/`   | A correct reference solution per trap task                                                            |
| `fixture-review/` | The project R1 reviews                                                                                |
| `run.mjs`         | Runs one arm headless and appends records                                                             |
| `measure.mjs`     | Measures one run (`run`), compares two arms (`compare`), and scores trap calibration (`calibrate`)    |
| `stats.cjs`       | Exact tests: sign-flip over per-task means, sign test                                                 |
| `badrefs.json`    | One bad reference per task: a correct solution with one hidden-checked behaviour broken               |
| `selftest.mjs`    | Checks the statistics, every task's files, and every good and bad reference (`npm run evals:check`)   |
| `judge.mjs`       | Blind readability and minimalism judge over two arms' archived source                                 |
| `results.md`      | Hypotheses written before any run, then one dated row per comparison                                  |
| `runs/*.jsonl`    | Raw records, one line per run; `runs/<file>/<task>-<run>/` holds that run's `src/`                    |
| `coverage.md`     | The doctrine phrases the hypotheses depend on (`npm run evals:check`)                                 |

## Arms

- **none**: nothing installed.
- **current**: `sigil add kind:rule --language typescript --target claude --yes` from a checkout of
  the commit under test (every TypeScript rule, as a user installs them).
- **candidate**: the same command from a checkout of the candidate branch.

## Running

1. Check out the commit under test (`git worktree add ../sigil-<arm> <ref>`), then `npm ci` and
   `npm run build` there.
2. From this folder:
   `node run.mjs --arm <name> --sigil ../sigil-<arm> --out runs/<file>.jsonl --runs 3`
   (`--install none` for the no-rules arm; `--tasks T1,T2` to limit).
   Each run copies the fixture into the OS temp dir, installs the arm, and runs
   `claude -p "<prompt>"` with `--setting-sources project`, `--permission-mode acceptEdits`, Bash
   limited to `node` and `npm test`, and the same `--model` for every arm. Then it measures the run.
3. Compare: `node measure.mjs compare runs/<baseline>.jsonl runs/<candidate>.jsonl --metric <m>`
   (`inflation`, `declarations` or `loc`; `--arm-a` and `--arm-b` pick arms out of a shared file).
4. Judge: `node judge.mjs runs/<baseline>.jsonl runs/<candidate>.jsonl --out runs/judge-<name>.jsonl`.
   Never read T5/T6 sources while editing catalog text; the judge reads them, you read its scores.
5. Add a dated row to `results.md` with the arms, commits, model, and the compare and judge output.

**Known confound:** `--setting-sources project` drops user settings, hooks and plugins, but the
user-level instruction file still loads. It is the same file in every arm, so it is constant noise,
not a bias. Record its presence in `results.md`. Runs cost real money (`costUsd` in each record).

## Statistics and selftest (eval v2, registered 2026-10-19)

From the next comparison on (`docs/audits/2026-10-16/README.md` § 8, E1 and E3):

- **Each task counts once.** The primary statistic is an exact one-sided sign-flip test over the
  per-task mean difference (baseline minus candidate, absolute units), plus a magnitude floor: the
  candidate's total over tasks moves at least 10%. `compare` prints it first, with a sign test
  across tasks; the run-level sign test, which pairs runs by index, follows as a secondary figure.
  Six tasks cannot reach p ≤ 0.05 unless every decided task moves the same way.
- **Fresh baseline.** Run the baseline arm again alongside each candidate, the same day, alternating
  arms, on the same CLI version. A stored baseline can carry an outlier (B1's T5 was 10, 3, 11
  declarations where every other arm ran 2–5 on most runs).
- **Selftest.** `node selftest.mjs` (part of `npm run evals:check`) checks the statistics against
  hand-computed p-values and runs each bad reference in `badrefs.json`: it must fail the hidden check
  named in `fails` and pass others. A bad reference that only fails a timing check proves nothing,
  and T5's "500k operations quickly" check can fail a correct solution on a busy machine. Each trap
  task's good reference in `fixture-good/` must pass every check, and every task in `surface.json`
  must have a prompt naming its files, hidden tests and a bad reference.
- **New metrics.** Each run also records `typeErrors` (strict compile errors in `src/`, Node-type
  gaps excluded) and `suppressions` (`@ts-ignore`, `@ts-expect-error`, `eslint-disable`,
  `.skip`/`.only`/`.todo`). Both read 0 on every task's good reference.

## Trap tasks (E2, registered 2026-10-19)

C1–C12 ask for ordinary code under a stated property (a service limit, untrusted input, a time
zone, a long-running process) where the obvious first implementation is wrong; `key.md` § Trap
checks names each trap. They answer whether the rules change correctness, which T1–T6 cannot,
since every arm passes those.

1. Calibrate: `node run.mjs --arm none --install none --tasks C1,C2,…,C12 --runs 3 --out runs/cal-none.jsonl`,
   then `node measure.mjs calibrate runs/cal-none.jsonl`. It keeps a trap that `none` fails in at
   least 2 of 3 runs, and says stop when fewer than 6 are kept (`results.md`, H10).
2. Only the kept traps go into the registered batch (`results.md`, H11 and H12).

## Acceptance (written before the first run; do not change after seeing results)

Round 2 (fragmentation, after B0) has its own registered rules in `results.md`, which replace
criterion 2 below with `declarations` and add a readability guard. Round 1's rules, kept as written:

A candidate catalog change is accepted when, against the current baseline on the same model:

1. **Correctness does not drop**: hidden tests pass in at least as many runs as the baseline, and
   no held-out task (T5, T6) loses a passing run.
2. **Inflation drops**: one-sided sign test over the decided (task, run) pairs, p ≤ 0.05.
3. **Bytes do not grow**: `npm run rule-load` for TypeScript is not above the baseline's.

If fewer than 10 of the 18 pairs differ, the change has no measurable effect: drop it. T5 and T6 are
held out: never read their outputs while editing catalog text. A merged candidate becomes the next
baseline.
