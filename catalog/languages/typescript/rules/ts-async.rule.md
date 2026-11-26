---
id: typescript/ts-async
kind: rule
title: Async (TypeScript)
description: "Promise and async/await correctness — floating promises, concurrent work, AbortController cancellation, rejection handling, event-loop blocking (TypeScript)"
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

- Every `Promise` must be `await`ed, `return`ed, or explicitly handled. Fire-and-forget is written
  `void task().catch(...)` with a handler that logs; enable `@typescript-eslint/no-floating-promises`.
- Independent operations run under `Promise.all`, not sequential `await`s or an `await` inside a `for` loop; cap
  the concurrency when the list can be large. `Promise.all` cancels nothing when one fails: share an `AbortSignal`.
- `Promise.allSettled` only when partial failure is a result you inspect; check `.status` before `.value`.
- Never pass an `async` function to `new Promise(...)`: a rejection inside it is lost.
- A long-running or I/O function accepts an `AbortSignal` and passes it down. Deadlines use
  `AbortSignal.timeout(ms)` (`AbortSignal.any([...])` to combine); call `signal.throwIfAborted()` in long loops.
- Re-throw with `new SomeError("context", { cause: e })`, never `new Error(e.message)`.
- No synchronous I/O (`readFileSync`) where an async form exists on a server or async path; CPU-heavy work goes to
  a `Worker`.
- For large or unbounded data, use `for await...of` and async generators over building an array: they keep memory
  bounded and allow backpressure.
