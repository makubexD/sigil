# Key

Never give a run agent this file, `fixture-hidden/`, or `surface.json`.

## Hidden checks (T1–T6)

`measure.mjs run` copies `fixture-hidden/<task>/` into the run directory and runs it with
`node --experimental-transform-types --test`. A run is **correct** (`testsOk`) when every hidden test
passes. What each task checks:

| Task | Hidden checks                                                                                                                                                                                                                            |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1   | netting and sort with ties by `customerId`; negative totals; starts at page 1 and follows `nextPage`; retry then success; gives up after `retries` with the last failure as `cause`; `retries: 0` is one attempt; 1M orders in under 5 s |
| T2   | LF and CRLF; `[]` for empty input; final line break; empty fields; quoted commas, `""` and line breaks; empty quoted field; `SyntaxError` on an unterminated quote; 100k records in under 3 s                                            |
| T3   | sums, spread at most 1, larger first, for six splits; 100/3 is 34, 33, 33; `formatCents` unchanged                                                                                                                                       |
| T4   | limit then refuse; a refused call is not recorded; rolling window; independent keys; default clock; 200k keys in under 3 s                                                                                                               |
| T5   | eviction order; `get` refreshes; update without eviction; falsy values; `RangeError` for 0, -1, 1.5, NaN; 500k operations in under 3 s                                                                                                   |
| T6   | single and combined units; `m` vs `ms`; `RangeError` for 12 malformed inputs                                                                                                                                                             |

Reference solutions pass every check with inflation 0; the unfixed T3 start fails 2 of 3
(validated 2026-10-14 when the harness was built).

## Trap checks (C1–C12)

Each trap task has at least three plain checks and one or more trap checks. The trap check (the
`fails` name in `badrefs.json`) catches the obvious first implementation, which `badrefs.json`
builds as one string replacement on the good reference in `fixture-good/<task>/`. The hidden tests
use instrumented fakes, an injected clock or fake timers, plain input and output, and temp
directories: no wall-clock thresholds and no network. Every good reference passes all of its checks
with inflation 0, `typeErrors` 0 and `suppressions` 0 (validated 2026-10-19).

| Task | Trap check                                                       | The obvious first implementation                                                                          |
| ---- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| C1   | stays within 8 concurrent requests for a large list              | `Promise.all(ids.map(fetchDetail))` starts every request at once; the service rejects all but 8           |
| C2   | a top-level \_\_proto\_\_ key does not leak into the event       | validates the fields, then returns the parsed object, so a partner's `__proto__` key reaches trusted code |
| C3   | malformed JSON throws with the parse error as cause              | one `try { … } catch { return defaults }` around read and parse runs a broken config on defaults          |
| C4   | closes the reader when handle throws midway                      | `close()` after the loop, so a failing `read` or `handle` leaks a scarce reader                           |
| C5   | aborts the signal given to the operation at the deadline         | `Promise.race` rejects on time but never aborts the operation nor clears the timer                        |
| C6   | rejects a sibling directory whose name starts with the base name | `startsWith(baseDir)` without a trailing separator lets `../files-evil/x.txt` through                     |
| C7   | concurrent gets for one key share a single load                  | check, await `load`, then store: every concurrent miss calls the loader again                             |
| C8   | small amounts posted to a large balance keep every cent          | sums `parseFloat` and returns `toFixed(2)`, which loses cents on a large balance                          |
| C9   | buckets by local day in a zone far from UTC                      | buckets by the UTC date (or one fixed offset), so events near midnight and DST days land wrong            |
| C10  | does not retry a 400, 404 or 422                                 | retries every failure alike, so a request that can never succeed is sent `retries + 1` times              |
| C11  | escapes markup in the name                                       | interpolates fields raw: injected markup, a quote out of `href`, a `javascript:` link                     |
| C12  | memory stays bounded as distinct ids keep arriving               | keeps every id seen and checks expiry on lookup, so memory grows for the life of the process              |

## Inflation

`inflation` = files under `src/` beyond the task's files + value exports beyond its requested
exports + properties on its options parameter beyond the requested fields (TypeScript compiler API).
Extra exported _types_ are reported (`extraTypes`) but not counted: exporting a type a signature
uses is not added behaviour. Lines of code are reported, never gated: shorter is not better on its
own.

## Judge (reported, never a gate)

A judge from a different model family than the run model sees two runs of the same task labelled X
and Y, in random order, with the arm hidden, and scores each 0–4 on:

- **Readability**: could a new team member follow it in one pass? Names, structure, comments that
  explain why.
- **Minimalism**: does it do what was asked, without options, types or layers nobody asked for?

## R1 review (seeded defects in `fixture-review/src/orders.ts`)

A finding counts when it names the defect and its location. A finding about anything else that is
not a real defect is **invented**.

| #   | Seeded defect                                                                                                                                      | Where                             |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| 1   | Unrequested option and type: `logger` / `Logger`, used only to hide an error                                                                       | `opts.logger`, `interface Logger` |
| 2   | Abstraction with one implementation: `OrderAggregator` + `ArrayOrderAggregator` + `createAggregator`, plus an `aggregator` option nobody asked for | top of file, `opts.aggregator`    |
| 3   | O(n²): `rows.find` per order over a growing array                                                                                                  | `ArrayOrderAggregator.add`        |
| 4   | Per-item I/O: `await lookupCustomerName` once per order (N+1), sequential                                                                          | second loop in `summarizeOrders`  |
| 5   | Unbounded memory: every order of every page buffered in `all` before aggregating                                                                   | first loop                        |
| 6   | A name that needs a comment: `x2` for the signed amount                                                                                            | `ArrayOrderAggregator.add`        |
| 7   | Catch that logs and continues below the top level, silently truncating the result                                                                  | `catch` in the page loop          |

Gate for PR6: the candidate finds at least baseline + 2 of the 7, with no invented findings.

R1 protocol (fixed 2026-10-15, before any R1 run): `review.mjs` runs each arm 3 times on the same
model; the baseline arm installs from the commit before the change, the candidate from the change.
Each reply is graded by hand against the table above. A defect counts once per run however often it
is named. The gate compares the **mean found per run** (candidate ≥ baseline + 2) and requires
**zero invented findings across all candidate runs**. Graded counts and the quoted line that earned
each point go in `results.md`.
