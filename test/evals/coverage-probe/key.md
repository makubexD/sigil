# Key

Never give a probe run this file. Each task has 4 points. Grade every point in every run as **hit**,
**miss**, or **n/a** (the run's design made the point moot, with the reason written down). Read the
files the run wrote, in `runs/<file>/<task>-<run>/`; the code is never executed.

## K1 Node runtime (C1)

| Point | Hit                                                                                                                          | Miss                                                                                          |
| ----- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| K1.1  | Reading waits for the sink: `stream.pipeline` / `for await` over lines with each POST awaited, or a bounded number in flight | Reads the whole file into memory, or starts a POST per line without waiting, so memory grows  |
| K1.2  | On `SIGTERM` (and `SIGINT`) it stops reading, finishes or hands back in-flight events, then exits                            | No signal handling, or exits at once, losing events already read                              |
| K1.3  | Each POST has a timeout (`AbortSignal.timeout`, an `AbortController`), so a silent endpoint can't hang the worker            | `fetch` with no timeout                                                                       |
| K1.4  | A failed POST is retried or surfaced, and a fatal error ends the process with a non-zero exit code                           | Errors swallowed (empty `catch`, unhandled rejection), or the process exits 0 after a failure |

## K2 ASP.NET Core / EF Core (C2)

| Point | Hit                                                                                                  | Miss                                                                |
| ----- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| K2.1  | Customer names come in the same query: a `Select` projection or `Include`                            | Lazy loading or a per-order customer lookup (N+1)                   |
| K2.2  | Read-only data is not tracked: a projection to a DTO or `AsNoTracking`                               | Tracked entities returned for a read-only list                      |
| K2.3  | Async to the database with the request's `CancellationToken` passed to `ToListAsync` (or equivalent) | Synchronous `ToList`, or async without the cancellation token       |
| K2.4  | The result is bounded: paging or keyset parameters with a maximum page size                          | Returns the whole table, or an unbounded `take` the caller controls |

## K3 FastAPI (C3)

| Point | Hit                                                                                                                      | Miss                                                                                |
| ----- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| K3.1  | No blocking call inside `async def`: an async HTTP client (`httpx.AsyncClient`) and async DB, or a sync `def` endpoint   | `requests` or a sync session called inside `async def`, which blocks the event loop |
| K3.2  | The DB session comes from a dependency (`Depends`) that closes it after the request (`yield` / context manager)          | A module-level session, or a session that is never closed                           |
| K3.3  | The response leaves out `password_hash`, `is_admin` and `email`: a `response_model` or an explicit dict of public fields | Returns the ORM object or a model that includes internal fields                     |
| K3.4  | The billing call has a timeout and a defined fallback or error when billing is slow or down                              | No timeout, so a hung billing service holds requests open                           |

## K4 React perf/security (C4)

| Point | Hit                                                                                                                                                   | Miss                                                                                          |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| K4.1  | User HTML is sanitized before `dangerouslySetInnerHTML` (DOMPurify or equivalent), or rendered through a safe rich-text renderer                      | Raw HTML into `dangerouslySetInnerHTML`                                                       |
| K4.2  | Stable keys from the comment id                                                                                                                       | Array index as key on a list that filters                                                     |
| K4.3  | Typing stays responsive: the filter result is memoized and the filter deferred (`useDeferredValue`, a transition, a debounce) or the list virtualized | Filters thousands of items and re-renders the full list on every keystroke with no mitigation |
| K4.4  | When `postId` changes, a stale response can't overwrite the new one: the effect aborts (`AbortController`) or ignores the old result                  | An effect that sets state from whichever response arrives last                                |

## K5 API / DB / observability (C5)

| Point | Hit                                                                                                             | Miss                                                             |
| ----- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| K5.1  | A resent request captures once: an idempotency key, or a status check and a conditional update under a row lock | A resent request can call the provider or write the ledger twice |
| K5.2  | Marking the payment and adding the ledger entry happen in one transaction                                       | Two separate statements without a transaction                    |
| K5.3  | Logs carry a request or correlation id (taken from a header or generated) and never the card token              | No correlation id, or the payment row or token logged            |
| K5.4  | A test sends the same capture twice and checks for one provider call and one ledger entry                       | No test of the resent request                                    |
