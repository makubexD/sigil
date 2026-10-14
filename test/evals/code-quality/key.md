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
