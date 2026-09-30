---
id: angular/ng-rxjs
kind: rule
title: RxJS (Angular)
description: RxJS conventions — subscription teardown, flattening operators, error handling, multicast
language: angular
appliesTo:
  - "**/*.ts"
tags:
  - angular
  - rxjs
---

> **Discovery rule:** this rule applies where the project uses RxJS — `Observable`, `pipe(`, the
> `async` pipe, or `Subject`. In code that has moved to signals for local state, prefer `ng-signals`
> and reach for RxJS only for genuinely asynchronous streams (HTTP, events, websockets). The two
> interoperate via `toSignal()` / `toObservable()`.

## Always Tear Down Subscriptions
A subscription that outlives its owner leaks memory and keeps doing work. In order of preference:
1. **`async` pipe** in the template — subscribes and unsubscribes automatically.
2. **`toSignal(stream$)`** — bridges a stream to a signal with automatic cleanup.
3. **`takeUntilDestroyed()`** on a manual subscription (pass a `DestroyRef` outside an injection context).

Never call `.subscribe()` without a teardown path. Avoid manual `Subscription` bookkeeping when an
operator or the `async` pipe can do it for you.

## No Nested Subscribes
Never call `.subscribe()` inside another `.subscribe()` — it leaks, loses cancellation, and breaks
error propagation. Compose with a flattening operator, chosen by the concurrency semantics you need:

| Operator | Use when |
|---|---|
| `switchMap` | Only the latest matters — cancel the previous (typeahead, route param → fetch). |
| `concatMap` | Order matters — queue and run sequentially (sequential writes). |
| `mergeMap` | Independent and concurrent — run all in parallel (fan-out). |
| `exhaustMap` | Ignore new triggers while one is in flight (submit button, login). |

```ts
// Wrong — nested subscribe
this.query$.subscribe(q => this.api.search(q).subscribe(r => this.show(r)));

// Right — switchMap cancels the stale request
this.results$ = this.query$.pipe(switchMap(q => this.api.search(q)));
```

## Error Handling
Handle errors with `catchError` inside the pipe so an error in one inner stream does not kill the
outer one. Map to a recovery value (and log the error per `ng-logging`) — never an empty
`catchError(() => EMPTY)` that silently swallows. For transient failures, add an explicit retry
policy (`retry({ count, delay })`); do not retry unconditionally.

```ts
this.data$ = this.api.load(id).pipe(
  retry({ count: 2, delay: 500 }),
  catchError(err => {
    this.logger.error('load failed', err, { id });
    return of(FALLBACK);          // explicit recovery, not silent swallow
  }),
);
```

## Hot vs Cold and Multicast
HTTP and most factory observables are **cold** — each subscriber triggers a new execution. If
multiple consumers (or multiple `async` pipes in a template) share one source, multicast it with
`shareReplay({ bufferSize: 1, refCount: true })` so the work runs once. Use `refCount: true` so the
upstream tears down when the last subscriber leaves.

## Keep Streams Pure
- No side effects in `map`/`filter` — use `tap` for explicit side effects, and keep those minimal.
- Prefer pure, composed pipelines over stateful `Subject`s that you imperatively `next()` into.
  Where you are modelling synchronous local state, a signal is usually the better tool than a
  `BehaviorSubject` (see `ng-signals`).
- Declare stream types explicitly (`Observable<User[]>`); don't let inference widen to `any`.

See `ng-performance-profiler` for stream-related hot-path analysis and `ng-components` for where
subscriptions live in the component lifecycle.
