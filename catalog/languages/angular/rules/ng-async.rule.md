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

> **Scope note:** this rule covers Promise/Observable *bridging* and Angular-specific async
> control flow — lifecycle hooks, resolvers, guards, and cancellation. RxJS operator conventions
> (subscription teardown, flattening operators, multicast) live in `ng-rxjs`; Signal update
> discipline and `effect()` side-effect rules live in `ng-signals`. Read this rule alongside both.

## No Floating Promises in Lifecycle Hooks

`ngOnInit`/`ngOnDestroy` and other lifecycle hooks are synchronous by contract — Angular never
awaits them. Calling an `async` method without handling its rejection loses the error silently:

```typescript
// Avoid — rejection from loadUser() is unobservable; Angular has nothing to await
ngOnInit(): void {
  this.loadUser();
}

// Correct — errors surfaced explicitly
ngOnInit(): void {
  this.loadUser().catch((err) => this.errorHandler.handle(err));
}
```

Prefer modeling the async work as an Observable assigned to a component field and consumed via the
`async` pipe in the template — it gets subscription teardown and error surfacing for free and
avoids this whole class of bug.

## Bridging Observables and Promises

Use `firstValueFrom`/`lastValueFrom` to convert an Observable to a Promise — never the deprecated
`.toPromise()`, which resolves `undefined` on an empty stream with no error:

```typescript
// Correct — firstValueFrom rejects on an empty stream instead of silently resolving undefined
const user = await firstValueFrom(this.http.get<User>('/api/user'));

// Avoid — deprecated, silently resolves `undefined` if the source completes with no emission
const user = await this.http.get<User>('/api/user').toPromise();
```

Going the other direction (Promise → Observable), use `from(promise)` — never wrap a Promise in
`new Observable()` manually unless genuine per-subscriber re-execution is required.

## Resolvers and Guards: Any of Observable, Promise, or a Plain Value

`ResolveFn`/`CanActivateFn`/`CanDeactivateFn` all accept `Observable<T> | Promise<T> | T` — pick
the shape that matches the actual work, and never block navigation on work that could be deferred
into the component itself:

```typescript
export const userResolver: ResolveFn<User> = (route) =>
  inject(UserService).getUser(route.paramMap.get('id')!);
```

A resolver that fails must produce a redirect or a typed error the routed component can render —
never let an unhandled rejection surface as a blank navigation.

## Cancellation with `DestroyRef` / `takeUntilDestroyed`

Angular has no native `AbortController` binding for `HttpClient` — cancel in-flight work by tearing
down the subscription instead, via `takeUntilDestroyed()` (injection-context or explicit
`DestroyRef`):

```typescript
export class SearchComponent {
  private readonly destroyRef = inject(DestroyRef);

  search(query: string): void {
    this.http
      .get<Result[]>('/api/search', { params: { q: query } })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((results) => this.results.set(results));
  }
}
```

For a component-scoped `fetch()` call that genuinely needs `AbortController` (not `HttpClient`),
tie the controller's `abort()` to `DestroyRef.onDestroy()` rather than a manual `ngOnDestroy`
override, for consistency with the rest of the framework's cleanup model.

## Race Conditions Writing to Signals

Two concurrent async operations racing to set the same signal is a common Angular-specific bug —
the *later-starting* request can still resolve *first* and get silently overwritten by a
slower, earlier request's stale result:

```typescript
// Avoid — a fast response to an old query can arrive after a slow response to a newer one
async search(query: string): Promise<void> {
  const results = await this.api.search(query);
  this.results.set(results); // may overwrite a newer, still-in-flight query's result
}

// Correct — switchMap cancels the previous in-flight request when a new one starts
searchTerm$.pipe(switchMap((q) => this.api.search(q))).subscribe((r) => this.results.set(r));
```

Prefer RxJS's `switchMap`/`exhaustMap`/`concatMap` (see `ng-rxjs`) over a bare `async`/`await` call
whenever the same async operation can be triggered again before the first call resolves.

## Preserve Error Context

When re-throwing inside an async service method or a resolver, attach the original error as
`cause` so the full async stack is preserved: `throw new AppError('User fetch failed', { cause:
e })`, never `throw new Error(e.message)` — that drops the original stack trace. Never swallow a
rejection with an empty `catch`; either surface it to `ErrorHandler`/`HttpInterceptor` or forward
it to the caller.
