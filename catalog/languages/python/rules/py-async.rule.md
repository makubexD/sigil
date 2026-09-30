---
id: python/py-async
kind: rule
title: Async (Python)
description: Python asyncio correctness — no blocking calls in coroutines, task lifetime, cancellation, and gather vs. TaskGroup
language: python
appliesTo:
  - "**/*.py"
tags:
  - python
  - async
appliesToRationale: Scoped to Python source because asyncio correctness only applies to coroutine code — there is no equivalent concern in config or data files.
---

## Never Block the Event Loop

Calling a synchronous, blocking function from inside a coroutine stalls every other task on that
event loop. Common offenders: `requests.get`, `time.sleep`, `open()`/`.read()` on large files,
`subprocess.run` without an async wrapper, and CPU-bound computation.

```python
# Wrong — blocks the entire event loop while the request is in flight
async def fetch_user(user_id: str) -> dict:
    response = requests.get(f"/users/{user_id}")
    return response.json()

# Correct — async HTTP client
async def fetch_user(user_id: str) -> dict:
    async with httpx.AsyncClient() as client:
        response = await client.get(f"/users/{user_id}")
        return response.json()
```

For unavoidable blocking calls (a sync-only SDK, CPU-bound parsing), offload to a thread or process
pool rather than calling it inline:

```python
result = await asyncio.to_thread(blocking_function, arg)
```

## `TaskGroup` over Bare `create_task`

Python 3.11+'s `asyncio.TaskGroup` supersedes manual `create_task` bookkeeping — it structurally
guarantees every child task is awaited, cancels siblings on first failure, and propagates exceptions
via `ExceptionGroup` instead of losing them:

```python
# Correct — structured concurrency, exceptions surfaced, siblings cancelled on failure
async def fetch_all(ids: list[str]) -> list[dict]:
    async with asyncio.TaskGroup() as tg:
        tasks = [tg.create_task(fetch_user(uid)) for uid in ids]
    return [t.result() for t in tasks]

# Avoid — a bare create_task with no reference is eligible for GC mid-flight, and an
# unhandled exception inside it is silently logged, not raised to the caller
asyncio.create_task(fetch_user(uid))
```

On Python < 3.11, use `asyncio.gather(*tasks)` for the same "run concurrently, propagate first
error" shape; pass `return_exceptions=True` only when partial failure is a valid outcome you intend
to inspect per-result.

## Honor Cancellation

Every long-running coroutine must let `asyncio.CancelledError` propagate — do not swallow it. If
cleanup is needed on cancellation, use `try`/`finally`, not `try`/`except CancelledError: pass`:

```python
# Correct — cleanup runs, cancellation still propagates
async def stream_results(query: str):
    conn = await pool.acquire()
    try:
        async for row in conn.cursor(query):
            yield row
    finally:
        await pool.release(conn)

# Wrong — swallows cancellation, task appears to hang or "complete" incorrectly
async def stream_results(query: str):
    try:
        ...
    except asyncio.CancelledError:
        pass
```

## No Unreferenced Fire-and-Forget Tasks

A `Task` object with no strong reference is eligible for garbage collection before it completes,
and its exception is only logged, never raised. Keep a reference (a set, a `TaskGroup`, or an
instance attribute) for the task's lifetime:

```python
# Correct — reference kept until done, then discarded via the done-callback
background_tasks: set[asyncio.Task] = set()

def fire_and_forget(coro) -> None:
    task = asyncio.create_task(coro)
    background_tasks.add(task)
    task.add_done_callback(background_tasks.discard)
```

## `async with` / `async for` for Async Resources

Use `async with` for anything implementing `__aenter__`/`__aexit__` (database connections, HTTP
clients, locks acquired via `asyncio.Lock`), and `async for` for async generators and async
iterators. Never manually call `__aenter__`/`__aexit__` — it drops exception-safe cleanup.

## Timeouts

Wrap any I/O-bound await with an explicit timeout — an unbounded `await` is a hang waiting to
happen. Prefer `asyncio.timeout()` (3.11+, a context manager, composes cleanly with `TaskGroup`)
over the older `asyncio.wait_for()`:

```python
async def fetch_with_deadline(url: str) -> dict:
    async with asyncio.timeout(5.0):
        async with httpx.AsyncClient() as client:
            response = await client.get(url)
            return response.json()
```

## `asyncio.Lock`, Not `threading.Lock`, in Coroutines

A `threading.Lock` acquired inside a coroutine blocks the entire event loop while held — use
`asyncio.Lock`/`asyncio.Semaphore` for coroutine-to-coroutine coordination; reserve `threading.Lock`
for guarding state shared with a real OS thread (e.g. a thread-pool worker).

See `py-performance-profiler` (detects blocking calls inside coroutines at runtime) and
`py-code-quality` (error-handling rules that also apply to async exception surfaces).
