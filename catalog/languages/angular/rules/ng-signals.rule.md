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
appliesToRationale: Scoped to TypeScript source because signal/computed/effect are TypeScript APIs; templates only read a signal's value, which ng-templates covers.
---

## Signals

Applies where the project uses signals. Don't rewrite a working RxJS data flow into signals without a reason.

- A value derived from other signals is a `computed`, never an `effect` that writes to another signal.
- `effect` is only for side effects outside the reactive graph: logging, analytics, `localStorage`, a non-signal
  API.
- Replace with `set(next)` or `update(prev => next)`; produce a new object or array, never mutate in place.
- `untracked(() => sig())` to read a signal without depending on it.
- Synchronous UI state is a signal; a stream over time (HTTP, websocket, debounced input) is RxJS, bridged with
  `toSignal(stream$, { initialValue })` or `toObservable(sig)`.
- Don't rely on zone.js to refresh the view (a field set in a raw `setTimeout`): update a signal or trigger change
  detection.
