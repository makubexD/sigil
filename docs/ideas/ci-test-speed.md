# Faster CI: find where the minutes go

**Status: done (2026-10-03).** Both success criteria are met on the median of three runs; see
[Results](#results). The sections below are the original plan, kept for the evidence.

## Objective

CI takes about 2m20s on Windows and 1m15s on Ubuntu. After PR #8 sped up two slow test files by 25 s
and 5 s locally, the CI jobs barely moved. Find what actually dominates the wall-clock time, then cut
it without weakening any check.

## Evidence

Measured from the CI run of PR #8 (run 37096647571; `master` at `b2db1bc`) with
`gh api repos/makubexD/sigil/actions/jobs/<id>` for step times and the job logs for suite `duration_ms`.

**Step times**

| Step                  | Windows / Node 20 | Ubuntu / Node 22 |
| --------------------- | ----------------- | ---------------- |
| Checkout + setup-node | 22 s              | 2 s              |
| Lint                  | 9 s               | 7 s              |
| `format:check`        | 10 s              | 7 s              |
| Build                 | 7 s               | 5 s              |
| Run tests             | 77 s              | 45 s             |
| Everything else       | about 8 s         | about 4 s        |

**Inside "Run tests" on Windows**

- `pretest` (`package.json`) takes about 11 s. It runs `npm run build` again, which the Build step ran
  just before, and then `build:test`.
- The runner (`scripts/run-tests.cjs`) takes about 66 s. The 96 test files' own durations add up to
  155 s, so they already overlap, at about 2.3 at a time. The runners have 4 vCPUs.
- Printing the coverage report costs nothing (0.016 s). What `--experimental-test-coverage` costs in
  every test process is not measured.

**Slowest suites on Windows**

| Suite                                                                                 | Time      | Why                                                             |
| ------------------------------------------------------------------------------------- | --------- | --------------------------------------------------------------- |
| `config fragments are replaced, not stacked` (`test/commands/config-replace.test.ts`) | 13.7 s    | `execFileSync` of the CLI, one at a time, across 8 tests        |
| `sigil root command (no terminal)` (`test/cli-root.test.ts`)                          | 9.6 s     | `spawnSync` of the CLI across 11 tests                          |
| `sigil --help accuracy` (`test/cli-help-accuracy.test.ts`)                            | 9.5 s     | Parallel since PR #8, but competes for CPU with the other files |
| `home menu random walk` (4 shards, `test/wizard/home-walk-<n>.test.ts`)               | 6.8-9.2 s | CPU-bound walk                                                  |
| `shared/protect-config hook` (`test/catalog/protect-config-hook.test.ts`)             | 8.2 s     | `spawnSync` runs the real hook                                  |
| `cli-flags.md matches sigil --help` (`test/cli-flags.test.ts`)                        | 6.3 s     | Same competition for CPU                                        |
| `copilot MCP reaches both …`                                                          | 5.7 s     |                                                                 |
| characterization `sigil add`                                                          | 5.4 s     |                                                                 |
| `sigil prune --apply`                                                                 | 5.0 s     |                                                                 |

The same suites take about half as long on Ubuntu (the slowest is 7.5 s). Locally, PR #8 took
`cli-help-accuracy` from 28.7 s to 3.3 s and `cli-flags` from 7.0 s to 2.2 s, yet the CI job stayed at
2m21s (was 2m24s). Run-to-run noise on the runners is about 10 s.

## Results

Median of three runs of the same `master` commit (`0a4314a`, all four changes merged), runs 37145045055
attempts 1-3. Job totals, seconds.

| Job               | Baseline | Target | Result (runs)          |
| ----------------- | -------- | ------ | ---------------------- |
| Windows / Node 20 | 140      | < 105  | **102** (86, 102, 103) |
| Ubuntu / Node 22  | 75       | < 60   | **58** (58, 59, 38)    |

Run tests step: Windows 77 s to 52 s, Ubuntu 45 s to 29 s. Every check still runs. The test count is
1109 (was 1106) because `test/cli-startup.test.ts` added 3; it differs per OS by design (`process.platform`-gated
tests, 1105 on Ubuntu before and after).

**The margins are thin.** The same Windows pipeline took 73 s, 79 s and 108 s in different runs of the
same code before the last change, and one Ubuntu attempt took 38 s against 58-59 s. Runner speed moves every
CPU-bound step together (even the untouched build went 4 s to 7 s), so re-measure before relying on the target.

| Change                                                                             | PR  | Measured effect                                                                                 |
| ---------------------------------------------------------------------------------- | --- | ----------------------------------------------------------------------------------------------- |
| `test:built`: skip the duplicate build in CI and `ci:local`                        | #9  | about 10 s Windows, 5 s Ubuntu                                                                  |
| `SIGIL_TEST_COVERAGE=0` in CI, one test file per CPU (`os.availableParallelism()`) | #10 | coverage cost 13-16 s per job; 4 files at once beat 3 and 5-8 on Windows (37 s against 50-56 s) |
| Run `lint` and `format:check` side by side (`scripts/run-parallel.cjs`)            | #11 | about 7 s on Windows (16 s to 8 s in the PR run)                                                |
| Load command modules lazily in `src/cli.ts`, with a guard test                     | #12 | CLI start 320 ms to 225 ms; the suite starts the CLI 117 times                                  |

### What the plan got wrong or dropped

- **Item 3 (reuse the PR #8 helper everywhere) was not done.** Suite durations from an Ubuntu log add up to
  87.6 s of work, about 22 s on 4 CPUs against a 27 s step, so the step was already CPU-bound and concurrency
  inside spawn-heavy files would have saved an estimated 1-3 s. Cutting the cost of each spawn (#12) removed
  work instead of overlapping it.
- **Item 5 (lint and format caches) was not done.** A cache restore costs about what the 14 s would save.
- **Building in parallel with lint and format was rejected.** The build deletes `dist-cli/` and rewrites
  `docs/reference/capabilities.md`, which `prettier --check .` also reads, so it could fail intermittently.
- The riskiest assumption held in part: coverage instrumentation and process start-up were the two largest
  removable costs. CPU contention between files mattered less than expected once concurrency matched the vCPU count.

### Open questions, answered

- _Does anyone use the coverage output? Is a threshold planned?_ No threshold exists. CI now skips coverage;
  local `npm test` still prints it.
- _Should coverage run on Ubuntu only?_ No. It cost more on Ubuntu (about 16 s) than on Windows, so CI skips it on both.
- _Is a 4-vCPU Windows runner guaranteed?_ No. The runner default is now `os.availableParallelism()`, so it follows
  whatever GitHub provides, and `SIGIL_TEST_CONCURRENCY` overrides it.

## Out of scope

- Dropping a check (audit, lint, format, validate, `sync --check`) or a test.
- The first-step floor: about 22 s of checkout and `setup-node` on Windows.
- Changing the OS / Node matrix.

## Preliminary plan

Ordered by likely gain per effort. Measure before and after each one; the noise is about 10 s, so use
at least three runs or compare step times, not the job total.

1. **Skip the duplicate build.** About 10 s on Windows. Either the CI step runs `build:test` and then
   `node scripts/run-tests.cjs`, or `pretest` skips `npm run build` when `dist-cli/` is fresh.
   `npm test` must still work alone on a clean checkout.
2. **Measure the cost of coverage.** Time the runner with and without `--experimental-test-coverage`
   on both OSes. If it is large and nothing enforces a threshold, drop it from CI and keep it for the
   local `npm test`, or run it on Ubuntu only. `CONTRIBUTING.md` (line 182) documents it, so update
   that too.
3. **Reuse the PR #8 helper.** `test/helpers/cli-help.ts` (`cliHelp`, `mapParallel`) runs the real CLI
   a few at a time and remembers repeats. Apply the same idea to `config-replace`, `cli-root`,
   `protect-config-hook` and the `prune` suites. Where a command can run in-process, do that and keep
   one real-spawn check per command.
4. **Test concurrency.** Try `--test-concurrency=<cpus>` (`os.availableParallelism()`). Observed
   overlap is 2.3 on 4 vCPUs.
5. **Lint and format caches.** `eslint --cache` and `prettier --check --cache` with the cache in
   `actions/cache`. Only worth it if the saving beats the cache restore.

## Success criteria

- Windows job under 1m45s and Ubuntu job under 1m, on the median of three runs.
- Test count unchanged (1106 at the time of writing) and every check still runs.
- `npm test` still works alone on a clean checkout, and `npm run ci:local` stays green.

## Riskiest assumption

That process start-up and coverage instrumentation dominate. If the cost is CPU contention between
test files instead, items 1 and 3 save little and item 4 matters most. Items 2 and 4 test this first,
and they are cheap.

## Open questions

- Does anyone use the coverage output? Is a threshold planned?
- Should coverage run on Ubuntu only?
- Is a 4-vCPU Windows runner guaranteed for this repository, or can GitHub change it?
