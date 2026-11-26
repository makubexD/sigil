---
id: angular/ng-async
kind: rule
title: Async (Angular)
description: Angular-specific async control flow — Promise/Observable bridging, lifecycle-hook async hygiene, resolver/guard async contracts, cancellation with DestroyRef
language: angular
appliesTo:
  - "**/*.ts"
tags:
  - angular
  - async
appliesToRationale: Scoped to TypeScript source because Angular's async control-flow surfaces (lifecycle hooks, resolvers, guards, DI-injected services) are all authored there; templates only consume async values via the async pipe, which ng-templates covers.
---

## Async

- Lifecycle hooks are never awaited: a promise started in `ngOnInit` handles its rejection
  (`.catch(err => this.errorHandler.handle(err))`), or the work is an Observable read with the `async` pipe.
- Observable to Promise is `firstValueFrom`/`lastValueFrom`, never `.toPromise()`; Promise to Observable is
  `from(promise)`.
- A resolver or guard does not block navigation on work the component could do; when it fails it redirects or
  returns a typed error, never an unhandled rejection.
- Cancel in-flight work by ending the subscription with `takeUntilDestroyed()` (pass a `DestroyRef` outside an
  injection context); tie a raw `fetch`'s `AbortController` to `DestroyRef.onDestroy()`.
- An operation that can be triggered again before it resolves goes through `switchMap`, `exhaustMap` or
  `concatMap`, not a bare `await` that then sets a signal: the slower, older response would win.
- Re-throw with `{ cause: e }`, never `new Error(e.message)`; no empty `catch`.
