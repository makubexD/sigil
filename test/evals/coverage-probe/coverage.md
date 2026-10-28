# Coverage: coverage-probe key points → catalog text

The coverage probe measures an unguided model, not a skill. Each row names a key point from `key.md`
and a phrase in delivered catalog doctrine that already teaches it; a point with no row is one the
catalog does not teach. Files are `rule:<id>` or `agent:<id>`, read resolved, and
`scripts/check-skill-evals.mjs` fails when a phrase disappears.

| key point                            | file                                 | phrase                                                                                   |
| ------------------------------------ | ------------------------------------ | ---------------------------------------------------------------------------------------- |
| K1.1 stream backpressure             | rule:typescript/ts-async             | they keep memory bounded and allow backpressure                                          |
| K1.3 per-call timeout                | rule:typescript/ts-security          | Always set a request timeout. Use `AbortSignal.timeout(ms)`                              |
| K1.4 failure not swallowed           | rule:typescript/ts-async             | Every `Promise` must be `await`ed, `return`ed, or explicitly handled                     |
| K2.1 no N+1 customer lookup          | agent:csharp/cs-performance-profiler | Navigation properties accessed inside a loop without `.Include(…)`                       |
| K2.2 no tracking on reads            | agent:csharp/cs-performance-profiler | Missing `AsNoTracking()` on read-only queries                                            |
| K2.3 async with CancellationToken    | rule:csharp/cs-async                 | must accept a `CancellationToken`                                                        |
| K2.4 bounded result                  | agent:csharp/cs-performance-profiler | add `.Take(n)` or pagination                                                             |
| K3.1 no blocking call in `async def` | rule:python/py-async                 | Calling a synchronous, blocking function from inside a coroutine stalls every other task |
| K3.4 outbound HTTP timeout           | rule:python/py-security              | Every outbound HTTP call must set an explicit timeout                                    |
| K4.1 sanitize before HTML sink       | rule:react/react-security            | Never pass unsanitized user or third-party content to it                                 |
| K4.2 stable list keys                | rule:react/react-conventions         | Always provide a stable, unique `key` on list items                                      |
| K4.3 deferred filter work            | rule:react/react-dependencies        | `useDeferredValue`/`useTransition`                                                       |
| K4.4 abort stale fetch               | rule:react/react-async               | out-of-order responses with a cleanup flag or `AbortController`                          |
| K5.3 no secrets in logs              | rule:typescript/ts-logging           | Credentials, tokens, passwords, and PII must never appear in log messages                |
