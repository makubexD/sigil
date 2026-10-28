# Phase 4 spike plan: coverage probe for C1–C5 (audit row 18)

## Context

Phase 4 of `docs/plan-audit-rows-15-18.md`. The 2026-10-16 audit deferred new coverage (C1–C5: Node runtime,
ASP.NET/EF, FastAPI/Django, React perf/security, API/DB/observability/e2e) "until the trap batch says rules change
correctness" (`docs/audits/2026-10-16/README.md` § 9). That batch never ran: H10 calibration found the unguided model
fell into 0 of 12 TypeScript traps in 36 runs (`test/evals/code-quality/results.md`). H10 covered TypeScript only,
and C1–C5 are mostly other stacks, so the roadmap probes them directly: "probe the unguided model first; write only
what it gets wrong".

Constraints found at the start: this machine has no `dotnet`, no Docker, and no FastAPI, Django or SQLAlchemy, so the
probe can't run hidden tests for C2–C5. Each task is graded by reading the produced code against a written key, the
way the skill evals grade with `key.md`. A run has no rules loaded.

Model choice follows Phase 3, with the asymmetry reversed: a weaker model can miss a point the stronger ones get
right, so a Haiku miss is weak evidence. Haiku screens; Sonnet must confirm a miss before any prose is written.

Execute one step at a time: "execute step N of docs/plan-audit-rows-15-18-phase4-spike.md". Branch:
`feat/coverage-probe`.

## Tasks (one per area; step 1 writes the final prompts and keys)

Each prompt states the situation and the property that matters, never the mechanism (as the trap tasks C1–C12 do).
Each key has 4 points a careful engineer gets right in that stack.

- **K1 Node runtime**: a long-running worker that streams a large file into a slow sink and must stop cleanly on
  deploy. Points: stream backpressure (`pipeline` / awaiting `drain`), `SIGTERM` stops intake and drains in-flight work,
  a per-call timeout or `AbortSignal`, a failure is not swallowed (no unhandled rejection, non-zero exit).
- **K2 ASP.NET Core / EF Core**: a list endpoint returning orders with their customer names for a large table. Points:
  no N+1 (`Include` or a projection), `AsNoTracking` or a projection for read-only data, async through to the database
  with the request's `CancellationToken`, a bounded page size.
- **K3 FastAPI**: an endpoint that looks up a user and calls a slow internal HTTP service. Points: no blocking call
  inside `async def` (async client, or a sync `def` endpoint), the DB session from a dependency that closes it, a
  `response_model` that leaves out internal fields, a parameterized query.
- **K4 React perf/security**: a comment list rendering user-supplied rich text, with a search box over thousands of
  items. Points: user HTML sanitized before `dangerouslySetInnerHTML` (or not rendered as HTML), stable keys (not the
  index) on a list that filters, the filter not recomputed on every keystroke render without need (memo or deferred
  value), a fetch effect that ignores or aborts stale responses.
- **K5 API / DB / observability**: a payment-capture endpoint that writes two rows and calls a provider, retried by
  clients. Points: an idempotency key, the two writes in one transaction, structured logs with a request or
  correlation id and no card data, a test that exercises the retry (same key twice gives one capture).

## Steps

1. **Prompts and keys** `[inline: eval design]`
   - `test/evals/coverage-probe/prompts.json` (K1–K5: id, area, stack, prompt) and `key.md` (4 points per task, each
     with what counts as a hit, a miss, and not applicable).
   - Test: each prompt names its stack and files, and never names a key point's mechanism.

2. **Harness** `[worker:medium]`
   - `test/evals/coverage-probe/probe.mjs`, modelled on `test/evals/skill-firing/probe.mjs`: for each prompt, a fresh
     empty project under the OS temp dir, nothing installed, `claude -p "<prompt>"` with `--setting-sources project`,
     `--permission-mode acceptEdits`, no Bash (the code isn't run), `--model` flag. It archives the produced files to
     `runs/<file>/<task>-<run>/` and appends a record (task, run, model, CLI version, cost, turns, files written) to
     `--out`. A run that ends in an API or usage-limit error is not recorded; existing records are skipped on resume.
   - `README.md` (what it measures, how to run, how to grade), `results.md` skeleton, and `coverage.md` with
     doctrine-only rows naming the catalog files that already teach any key point, so `npm run evals:check` passes.
   - `test/evals/README.md`: one row for the new folder.
   - Test: `npm run evals:check`; `node probe.mjs --help`-style usage line; ESLint and Prettier on the new files.

3. **Register the decision rule** `[inline: registration]`, committed before any run.
   - Grading: each key point per run is a **hit**, a **miss**, or **n/a** (the run's design made the point moot), read
     by hand from the archive.
   - **Stage 1** (`claude-haiku-5-5`, 3 runs per task): a point is **flagged** when at least 2 of its 3 runs miss it.
   - **Stage 2** (`claude-sonnet-5-5`, 3 runs, only tasks with a flagged point): a flagged point is a **confirmed
     miss** when at least 2 of 3 Sonnet runs miss it.
   - Per area: no confirmed miss → "no gap". A confirmed miss → check the catalog: if a rule or skill already teaches
     it, record "covered, not loaded" (no new prose); else it is a **gap** for prose.

4. **Runs** `[inline: run with the model under test]`
   - Stage 1: 15 runs. Stage 2 only for flagged tasks. A run that hits a limit is re-run, not recorded.

5. **Verdict** `[inline: judgment]`
   - Grade every run, apply the rule, write `results.md`; `docs/audits/2026-10-16/results.md` row 18 and the roadmap.
   - Prose for any gap is a separate step plan (`docs/plan-audit-rows-15-18-phase4.md`), placed where the
     catalog-layout rule says, each with a RETIRED or IMPLIES guard. With no gap, Phase 4 closes as "no gap".

## Verification

- `npm run ci:local` green (it includes `evals:check`).
- The step 3 registration commit comes before the first probe run in `git log`.
- Close-out: `workflow-report sigil`, `/agent-skills:review`, then delete this plan (in the PR or after merge).
