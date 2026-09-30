---
id: csharp/cs-async
kind: rule
title: Async (.NET / C#)
description: C# async/await correctness — no sync-over-async, no async void, CancellationToken, ConfigureAwait
language: csharp
appliesTo:
  - "**/*.cs"
severity: recommended
extends: []
tags:
  - csharp
  - async
---

## Never Block on Async Code (Sync-over-Async)
Calling `.Result`, `.Wait()`, or `.GetAwaiter().GetResult()` on a `Task` inside synchronous code
is the **most common .NET deadlock pattern**. It blocks the calling thread while the task awaits
its continuation on that same thread — deadlock under ASP.NET Classic, WPF, WinForms, and any
`SynchronizationContext`-aware host.

```csharp
// Wrong — deadlock risk on any SynchronizationContext host
var result = SomeService.GetDataAsync().Result;
var result = SomeService.GetDataAsync().GetAwaiter().GetResult();

// Correct — propagate async all the way up
var result = await SomeService.GetDataAsync();
```

**"Async all the way":** once you call `await`, the entire call chain must be `async`. Sync entry
points (e.g., `Main`) use `async Task Main(…)` in .NET 5+.

## Never Use `async void` (Except Event Handlers)
`async void` methods cannot be awaited, cannot be composed, and silently swallow exceptions —
the exception propagates to the `SynchronizationContext` and typically crashes the process.
Reserve `async void` **exclusively** for `EventHandler`-signature event handlers where the API
forces `void`:

```csharp
// Wrong — exception is unobservable; callers cannot await
public async void DoWorkAsync() { … }

// Correct — callers can await and handle exceptions
public async Task DoWorkAsync() { … }

// Acceptable — event handler (forced signature)
private async void OnButton_Click(object sender, EventArgs e) { … }
```

## `ConfigureAwait(false)` in Library Code
In library projects (not application host projects like ASP.NET Minimal API programs, console entry
points, or WPF code-behind), append `.ConfigureAwait(false)` to every `await` to avoid
unnecessarily capturing the `SynchronizationContext`. This improves throughput and prevents
deadlocks in callers that do block.

```csharp
// Library method — no need to resume on the original context
var data = await repository.LoadAsync(id).ConfigureAwait(false);
```

Application hosts (ASP.NET Core, Worker, Console `Program.cs`) can omit `.ConfigureAwait(false)`
because ASP.NET Core has no `SynchronizationContext`; but setting it is never wrong.

## Accept and Honor `CancellationToken`
Every I/O-bound and long-running public `async` method must accept a `CancellationToken` as the
last parameter (named `cancellationToken`, default `= default`):

```csharp
public async Task<IReadOnlyList<Entry>> FetchAsync(
    string query,
    CancellationToken cancellationToken = default)
{
    var response = await _http.GetAsync(url, cancellationToken).ConfigureAwait(false);
    // …
}
```

**Forward** the token to every downstream call that accepts one. **Never ignore** a token — a
caller that cancels expects prompt cancellation, not a fire-and-forget continuation. Check
`cancellationToken.ThrowIfCancellationRequested()` inside CPU-bound loops.

## `ValueTask` Rules
Prefer `Task` / `Task<T>` for general-purpose async methods. Use `ValueTask<T>` **only** for
hot-path code where the result is frequently available synchronously (e.g., cached reads, pool-based
I/O) and allocation measurement confirms the benefit.

`ValueTask` rules:
- **Await it exactly once** — `ValueTask` is a single-use struct; calling `.Result` or awaiting
  twice is undefined behavior.
- Do not convert to `Task` via `.AsTask()` unless you must share it across multiple awaiters.
- Never store a `ValueTask` in a field for later use.

## Compose Independent Operations with `Task.WhenAll`
When multiple operations are independent of each other, run them concurrently:

```csharp
// Wrong — sequential; second waits for first unnecessarily
var prs = await github.FetchPrsAsync(ct);
var workItems = await ado.FetchWorkItemsAsync(ct);

// Correct — concurrent
var (prs, workItems) = await (
    github.FetchPrsAsync(ct),
    ado.FetchWorkItemsAsync(ct)
).WhenBoth();  // or Task.WhenAll + deconstruct
```

## `IAsyncDisposable` and `await using`
When a type holds async-only cleanup resources (e.g., a streaming HTTP response, a SignalR
connection), implement `IAsyncDisposable` and use `await using` at the call site:

```csharp
await using var connection = new SqlConnection(connectionString);
await connection.OpenAsync(ct).ConfigureAwait(false);
```

Avoid mixing `IDisposable` and `IAsyncDisposable` on the same type without implementing both.

## No Unobserved Fire-and-Forget
Every `Task` that is not awaited must be explicitly handled:

```csharp
// Wrong — exception is silently lost
_ = SomeService.RunBackgroundJobAsync();

// Correct — use a proper background service host
// (IHostedService / BackgroundService) for long-running background work
```

If fire-and-forget is genuinely necessary (e.g., warming a cache), attach a continuation to log failures:

```csharp
_ = WarmCacheAsync().ContinueWith(
    t => logger.LogError(t.Exception, "Cache warm failed"),
    TaskContinuationOptions.OnlyOnFaulted);
```

## `TaskCompletionSource` Default Options
When wrapping a callback-based API with `TaskCompletionSource`, always pass
`TaskCreationOptions.RunContinuationsAsynchronously` to prevent continuations from running
synchronously on the completing thread — which can cause deadlocks or unexpected reentrancy.

```csharp
var tcs = new TaskCompletionSource<int>(TaskCreationOptions.RunContinuationsAsynchronously);
```

See `cs-performance-profiler` (detects async anti-patterns at runtime) and `cs-code-quality`
(error-handling rules that apply to async exception surfaces).
