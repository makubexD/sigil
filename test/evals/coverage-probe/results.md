# Results

The decision rule is registered in this file before any run.

## Decision rule (registered 2026-10-28, before any run)

Audit row 18 (`docs/audits/2026-10-16/README.md` § 9, C1–C5): does the unguided model get these
areas right, so that new catalog prose is not needed? Tasks K1–K5 (`prompts.json`), graded by hand
against `key.md`; nothing is installed and nothing is executed. CLI 2.1.312 at registration.

**Grading.** Each key point in each run is a **hit**, a **miss**, or **n/a** (the run's design made
the point moot; the reason is written down), read from `runs/<file>/<task>-<run>/`.

1. **Stage 1 (screen)**: `claude-haiku-5-5`, 3 runs per task, 15 runs. A point is **flagged** when at
   least 2 of its 3 runs miss it.
2. **Stage 2 (confirm)**, only for tasks with a flagged point: `claude-sonnet-5-5`, 3 runs of each such
   task. A flagged point is a **confirmed miss** when at least 2 of its 3 Sonnet runs miss it. A
   weaker model can miss a point the stronger ones get right, so a stage-1 flag alone never leads to
   prose.

**Per area.** No confirmed miss: **no gap**. A confirmed miss whose point `coverage.md` maps to
catalog text: **covered, not loaded** (no new prose; the rule exists and a user who installs it
gets it). A confirmed miss with no catalog text: a **gap**, which gets prose through its own step
plan, placed where the catalog-layout rule says, with a RETIRED or IMPLIES guard.

A run that ends in an API or usage-limit error is not recorded and is re-run.

## Runs

| Date       | Stage      | Model            | Runs           | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------- | ---------- | ---------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-10-28 | 1 (screen) | claude-haiku-5-5 | 15 (K1–K5 × 3) | **No point flagged: 60 of 60 point-runs are hits, so stage 2 does not run and C1–C5 are all "no gap".** K1 12/12: line-by-line reads with each POST awaited, `AbortSignal.timeout` per POST, retries with backoff, a byte-offset checkpoint saved after the sink accepts, `SIGTERM`/`SIGINT` stop intake. K2 12/12: a projection with the customer name, `AsNoTracking`, `ToListAsync` with the request token, keyset paging clamped to 200. K3 12/12: `httpx.AsyncClient` and an async session, a public `response_model` (id, display name, plan), a billing timeout with a fallback; K3.2 graded a hit with a note: every run opens the session with `async with` in the handler, not `Depends`, which closes it and frees the connection before the billing call. K4 12/12: DOMPurify before `dangerouslySetInnerHTML`, `key={comment.id}`, `useDeferredValue` with `useMemo`, an `AbortController` that drops stale responses. K5 12/12: `SELECT … FOR UPDATE` with a status check, the status update and ledger entry in one transaction, an `x-request-id` in every log line and no card token selected, a test that resends the capture. Cost $0.19; CLI 2.1.312; records `runs/stage1-haiku.jsonl`. |
