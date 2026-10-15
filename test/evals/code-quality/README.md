# Code-quality eval

Does the catalog's TypeScript guidance make an agent write correct code without inflating it? This
eval measures rules, not a skill: the arms differ only in which sigil rules are installed into the
project before the agent starts. Background and the plan it gates: `docs/audits/2026-10-14/`.

| File              | Contents                                                                                              |
| ----------------- | ----------------------------------------------------------------------------------------------------- |
| `scenarios.md`    | Prompts T1–T6 (T5, T6 held out) and the reviewer scenario R1                                          |
| `surface.json`    | The files, exports and option fields each task asks for                                               |
| `key.md`          | Hidden checks, the inflation definition, the judge rubric, R1's seeded defects                        |
| `fixture/`        | The starting project (Node 22, TypeScript, no dependencies); `fixture-start/T3/` adds T3's buggy file |
| `fixture-hidden/` | Hidden tests per task, copied in only after the agent finishes                                        |
| `fixture-review/` | The project R1 reviews                                                                                |
| `run.mjs`         | Runs one arm headless and appends records                                                             |
| `measure.mjs`     | Measures one run (`run`) and compares two arms (`compare`, `--metric`)                                |
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
