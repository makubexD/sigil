---
id: angular/ng-rxjs
kind: rule
title: RxJS (Angular)
description: "RxJS conventions — subscription teardown, flattening operators, error handling, multicast (Angular)"
language: angular
appliesTo:
  - "**/*.ts"
tags:
  - angular
  - rxjs
appliesToRationale: Scoped to TypeScript source because RxJS streams are composed exclusively there; templates only consume them via the async pipe, which ng-templates covers.
---

## RxJS

Applies where the project uses RxJS. Don't rewrite signal-based local state into streams.

- No `.subscribe()` without a teardown: the `async` pipe, `toSignal(stream$)`, or `takeUntilDestroyed()`.
- Never subscribe inside a subscribe. Flatten with `switchMap` (only the latest matters), `concatMap` (order
  matters), `mergeMap` (independent; cap a large source with `mergeMap(fn, 4)`) or `exhaustMap` (ignore triggers
  while one is in flight).
- Handle errors with `catchError` inside the inner pipe, mapping to a recovery value and logging; never
  `catchError(() => EMPTY)`. Retries have a count and a delay.
- A cold source read by several consumers is shared with `shareReplay({ bufferSize: 1, refCount: true })`.
- No side effects in `map` or `filter`; use `tap`. Local synchronous state is a signal, not a `BehaviorSubject`.
- Type every stream (`Observable<User[]>`); don't let it widen to `any`.
