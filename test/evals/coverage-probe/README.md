# Coverage probe

Does an unguided model get C1–C5 right — Node runtime, ASP.NET Core/EF Core, FastAPI, React
perf/security, API/DB/observability — when no catalog rule or skill is loaded? The 2026-10-16 audit
deferred new coverage until the trap batch showed rules change correctness (row 18); this probe tests
the unguided baseline directly, so prose is written only for what the model gets wrong. A Haiku miss
screens; Sonnet must confirm it before any prose is written.

| File           | Contents                                                                                |
| -------------- | --------------------------------------------------------------------------------------- |
| `prompts.json` | K1–K5: one task per area, each stating its stack and files                              |
| `key.md`       | Four points per task, each with a hit and a miss; never shown to a run                  |
| `probe.mjs`    | The runner (below)                                                                      |
| `results.md`   | The two-stage decision rule, registered before any run, then dated rows                 |
| `coverage.md`  | Catalog phrases the key points depend on (`npm run evals:check`)                        |
| `runs/*.jsonl` | One record per run: task, run, model, CLI version, cost, turns, duration, files written |

## A run

`node probe.mjs --out runs/<name>.jsonl [--runs 3] [--only K1,K2] [--parallel 3] [--model claude-haiku-5-5]`,
from this folder. For each prompt and run it:

1. makes an empty folder under the OS temp dir (nothing is installed);
2. runs `claude -p "<prompt>"` with project settings only, edits accepted, and only
   Write/Edit/Read/Glob/Grep available — no shell, because the code is never run;
3. copies every produced file to `<out dir>/<out name>/K<n>-<run>/` and appends one record.

A run that ends in an API or usage-limit error is not recorded; re-running the same command fills
only the missing runs. Up to `--parallel` (default 3) run at once.

## Grading

The code is never executed: this machine has no `dotnet`, Docker, FastAPI/Django or SQLAlchemy, so
each run is graded by reading the archived files against `key.md`. Never give a run the key. Mark
every point in every run as **hit**, **miss** or **n/a** (the run's design made the point moot, with
the reason written down), then apply the two-stage rule registered in `results.md`.
