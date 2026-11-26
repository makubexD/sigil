---
id: csharp/cs-async
kind: rule
title: Async (.NET / C#)
description: C# async/await correctness — no sync-over-async, no async void, CancellationToken, ConfigureAwait
language: csharp
appliesTo:
  - "**/*.cs"
tags:
  - csharp
  - async
appliesToRationale: Scoped to C# source because async/await correctness only applies to compiled C# code — there is no equivalent concern in config or project files.
---

## Async

- Never block on a task: no `.Result`, `.Wait()` or `.GetAwaiter().GetResult()`. Async goes all the way up, to
  `async Task Main`.
- `async void` only for an event handler; every other async method returns `Task` or `Task<T>`.
- Library code appends `.ConfigureAwait(false)` to every `await`; an application host (ASP.NET Core, a console
  `Program.cs`) may omit it.
- Every I/O-bound or long-running public async method must accept a `CancellationToken` as its last parameter
  (`cancellationToken = default`) and forward it to every call that takes one; call
  `ThrowIfCancellationRequested()` in CPU-bound loops.
- Independent operations run under `Task.WhenAll`, not one `await` after another.
- `Task` by default. `ValueTask<T>` only on a measured hot path, awaited exactly once and never stored.
- Async cleanup is `IAsyncDisposable`, used with `await using`.
- No unobserved fire-and-forget (`_ = RunAsync();`): use a `BackgroundService`, or attach a continuation that
  logs the fault.
- Create a `TaskCompletionSource` with `TaskCreationOptions.RunContinuationsAsynchronously`.
