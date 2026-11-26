---
id: typescript/ts-async
kind: rule
title: Async (TypeScript)
description: "Promise and async/await correctness — concurrent work, AbortSignal cancellation, allSettled, CPU-heavy work (TypeScript)"
language: typescript
appliesTo:
  - "**/*.ts"
  - "**/*.tsx"
tags:
  - typescript
  - async
appliesToRationale: Promise/async-await correctness only applies to TypeScript/TSX source — excluded from config, markdown, and other non-TS files where the concern does not exist.
---

## Async

- Independent operations run under `Promise.all`, not sequential `await`s or an `await` inside a `for` loop.
  `Promise.all` cancels nothing when one fails: share an `AbortSignal`.
- `Promise.allSettled` only when partial failure is a result you inspect; check `.status` before `.value`.
- Never pass an `async` function to `new Promise(...)`: a rejection inside it is lost.
- A long-running or I/O function accepts an `AbortSignal` and passes it down. Deadlines use
  `AbortSignal.timeout(ms)` (`AbortSignal.any([...])` to combine); call `signal.throwIfAborted()` in long loops.
- CPU-heavy work goes to a `Worker`.
