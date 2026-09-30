---
id: angular/ng-signals
kind: rule
title: Signals (Angular)
description: Angular signals conventions — signal/computed/effect, derivation, interop, zoneless-readiness
language: angular
appliesTo:
  - "**/*.ts"
tags:
  - angular
  - signals
---

> **Discovery rule:** this rule applies where the project uses signals — `signal(`, `computed(`,
> `effect(`, or signal `input()`/`model()`. For asynchronous streams (HTTP, events) the project may
> still use RxJS; see `ng-rxjs` and bridge with `toSignal()` / `toObservable()`. Do not rewrite a
> working RxJS data flow into signals without reason.

## The Model
- **`signal(value)`** — a writable reactive value. Read it by calling it: `count()`.
- **`computed(() => …)`** — a derived, memoised, read-only value. It recomputes lazily only when a
  signal it reads changes.
- **`effect(() => …)`** — runs a side effect when its tracked signals change. For side effects only.

## Derive with `computed`, Not `effect`
Any value that is a pure function of other signals must be a `computed` — never an `effect` that
writes into another signal. Using `effect` to sync derived state creates redundant change cycles,
ordering bugs, and is flagged by the framework.

```ts
// Wrong — effect mirroring derived state
readonly total = signal(0);
constructor() { effect(() => this.total.set(this.price() * this.qty())); }

// Right — computed derivation
readonly total = computed(() => this.price() * this.qty());
```

## `effect` Only for Genuine Side Effects
Reserve `effect` for synchronising with the world outside the reactive graph: logging, analytics,
imperative DOM/`localStorage`, or driving a non-signal API. Effects run in an injection context and
clean up automatically when their owner is destroyed; don't allocate one just to compute a value.

## Update Discipline and Immutability
Use `set(next)` to replace and `update(prev => next)` to derive from the current value. For objects
and arrays, produce a **new reference** rather than mutating in place, so dependents (and OnPush
components) actually see the change:

```ts
this.items.update(list => [...list, newItem]); // new array — change is observed
```

Use `untracked(() => signal())` to read a signal inside a `computed`/`effect` **without** subscribing
to it — for values that should be read but must not trigger recomputation.

## Signal Inputs and Model
Prefer signal `input()` / `input.required()` / `output()` and two-way `model()` on components (see
`ng-components`). Read them reactively in `computed`; they integrate with OnPush so a template that
reads a signal input updates without manual change detection.

## Signals vs RxJS — Choosing
- **Synchronous local/UI state** (counters, form view-state, derived view models) → **signals**.
- **Asynchronous streams over time** (HTTP, websockets, DOM events, debounced typeahead) → **RxJS**,
  then expose to the template with `toSignal()` or the `async` pipe.
- Bridge deliberately: `toSignal(stream$, { initialValue })` to consume a stream as a signal;
  `toObservable(sig)` to feed a signal into an RxJS pipeline.

## Zoneless-Readiness
Code that relies on signals, the `async` pipe, and OnPush updates correctly without
`zone.js`-driven change detection. Avoid patterns that assume Zone monkey-patching will re-render
(e.g. mutating component fields from a raw `setTimeout` and expecting the view to refresh) — drive
view updates through signals or explicit change detection instead, keeping the code zoneless-ready.

See `ng-components` for where signals live in a component and `ng-templates` for reading them in the view.
