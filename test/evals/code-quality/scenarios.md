# Code-quality scenarios

Every run uses a fresh copy of `fixture/` (for T3, with `fixture-start/T3/` copied over it) and the
prompt below, verbatim. The arms differ only in what is installed into the copy before the run (see
README.md). T1–T4 are development tasks. **T5 and T6 are held out**: never read their outputs while
editing catalog text; they are scored only on a candidate's final run.

Each task names its requested surface: the files, exports and option fields it asks for.
`surface.json` holds the same list, and `measure.mjs` counts anything beyond it as inflation.

## T1 orders (pagination, retry, scale)

> In this project, write `src/orders.ts` exporting a type `Order` = `{ id: string; customerId:
string; amountCents: number; status: 'paid' | 'refunded' | 'pending' }` and a function
> `summarizeOrders(fetchPage, opts?)`.
>
> - `fetchPage: (page: number) => Promise<{ items: Order[]; nextPage: number | null }>`; the
>   first page is 1.
> - `opts?: { retries?: number; baseDelayMs?: number }`, defaults 3 and 100. A failing page fetch
>   is retried up to `retries` times with exponential backoff; after that, throw an `Error` whose
>   `cause` is the last failure.
> - Return `{ totals: { customerId: string; totalCents: number }[]; skippedPending: number }`:
>   per customer, paid minus refunded cents, sorted by `totalCents` descending, then `customerId`
>   ascending. `skippedPending` counts pending orders.
> - It must handle about 1M orders.
>
> Add tests in `test/orders.test.ts`.

## T2 csv (parsing, edge cases)

> In this project, write `src/csv.ts` exporting `parseCsv(text: string): string[][]` following
> RFC 4180: comma-separated fields, fields may be double-quoted, `""` inside a quoted field is a
> literal quote, quoted fields may contain commas and line breaks, records end with CRLF or LF,
> and a final line break does not produce an empty record. An empty input returns `[]`. Throw a
> `SyntaxError` on an unterminated quoted field.
>
> Add tests in `test/csv.test.ts`.

## T3 money (bug fix in existing code)

> Users report that `splitCents` in `src/money.ts` returns shares that do not add up to the total,
> for example 100 cents split 3 ways. Fix it. The shares must add up to the total, differ from each
> other by at most 1 cent, and the larger shares come first.
>
> Add a regression test in `test/money.test.ts`.

## T4 rate limiter (state, time, memory)

> In this project, write `src/rate-limit.ts` exporting `createRateLimiter(opts)` where
> `opts: { limit: number; windowMs: number; now?: () => number }` (`now` defaults to `Date.now`).
> It returns `{ tryAcquire(key: string): boolean }`, which returns `true` and records the call when
> `key` has made fewer than `limit` calls in the last `windowMs` milliseconds, and `false`
> otherwise. Keys are independent. Memory must not keep growing for keys that have gone idle.
>
> Add tests in `test/rate-limit.test.ts`.

## T5 lru (held out)

> In this project, write `src/lru.ts` exporting `createLruCache<K, V>(capacity: number)` returning
> `{ get(key: K): V | undefined; set(key: K, value: V): void; readonly size: number }`. `get` marks
> the key as most recently used; `set` inserts or updates and marks it most recently used, then
> evicts the least recently used entry when the size exceeds `capacity`. Every operation must be
> O(1). Throw a `RangeError` when `capacity` is not a positive integer.
>
> Add tests in `test/lru.test.ts`.

## T6 duration (held out)

> In this project, write `src/duration.ts` exporting `parseDuration(text: string): number`, which
> returns milliseconds for strings such as `2d`, `1h30m`, `1h 5m`, `45s` and `500ms`. Units are
> `d`, `h`, `m`, `s` and `ms`; each unit appears at most once, larger units first, with optional
> single spaces between parts; amounts are non-negative integers. Throw a `RangeError` on any other
> input, including an empty string.
>
> Add tests in `test/duration.test.ts`.

## R1 review (reviewer agents)

> Review `src/orders.ts` in this project for correctness, design and performance. Report findings
> only; do not edit files.

The project is `fixture-review/` (not `fixture/`). Grade with the R1 section of key.md. R1 runs
with the reviewer agent installed (`agent` arms in README.md) and gates PR6 only.
