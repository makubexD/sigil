---
id: csharp/cs-logging
kind: rule
title: Logging (.NET / C#)
description: C# logging conventions — ILogger<T>, structured templates, no secrets, no Console diagnostics
language: csharp
appliesTo:
  - "**/*.cs"
tags:
  - csharp
  - logging
appliesToRationale: Scoped to C# source because ILogger calls only occur in application code; project and config files never log.
---

## Use `ILogger<T>`, Not `Console.WriteLine`
Never use `Console.WriteLine()` for diagnostics, warnings, or errors in production library/service
code — use the `Microsoft.Extensions.Logging.ILogger<T>` abstraction. Declare one logger per class
through constructor injection:

```csharp
public sealed class CalendarParser(ILogger<CalendarParser> logger)
{
    public IReadOnlyList<CalendarEvent> Parse(Stream stream)
    {
        logger.LogInformation("Parsing ICS stream");
        // …
    }
}
```

`Console.WriteLine()` is acceptable only for **intentional user-facing CLI output** (not diagnostics).
Switch to `ILogger<T>` as soon as the code is consumed by anything other than a single-entry-point CLI.

`ILogger<T>` is provider-agnostic — the concrete sink (Console, Serilog, Application Insights, NLog)
is a hosting configuration concern, not a library concern.

## Level Discipline
Use each level for its intended meaning — do not downgrade severity for comfort:

- `Trace` — fine-grained internal state; typically disabled in production.
- `Debug` — information useful only when diagnosing a specific failure.
- `Information` — high-level lifecycle events (startup, config loaded, job completed). Not every loop iteration.
- `Warning` — something unexpected that the application handled; may indicate a future problem.
- `Error` — a real failure; the operation could not complete.
- `Critical` — a failure that will cause the process to terminate or enter an undefined state.

**Never log at Information or higher inside a tight loop.** Per-item trace output belongs at `Debug`
or `Trace` — `Information`-level loop spam floods aggregators and serializes hot paths.

## Structured Message Templates, Not Interpolated Strings
Prefer **structured message templates** over `$"…"` interpolation. Structured logging retains the
property names for log aggregators (Seq, Application Insights, ELK); interpolated strings collapse
them to a plain string and always allocate — even when the log level is disabled.

```csharp
// Prefer — structured, zero-cost when Debug is disabled
logger.LogDebug("Processing item {Index} of {Total}", index, total);

// Avoid — always allocates the interpolated string
logger.LogDebug($"Processing item {index} of {total}");
```

Add an `IsEnabled` guard before expensive argument construction:

```csharp
if (logger.IsEnabled(LogLevel.Debug))
{
    var expensiveDetail = BuildDetail(entries);
    logger.LogDebug("Correlation result: {Detail}", expensiveDetail);
}
```

For high-frequency hot paths, use **`LoggerMessage` source generators** (zero-allocation, zero-boxing):

```csharp
public static partial class Log
{
    [LoggerMessage(Level = LogLevel.Debug, Message = "Processing item {Index} of {Total}")]
    public static partial void ProcessingItem(ILogger logger, int index, int total);
}
```

## Log Exceptions Correctly
Use the overload that accepts an `Exception` as the first argument — it captures the full stack trace:

```csharp
try
{
    await FetchDataAsync(url, ct);
}
catch (HttpRequestException ex)
{
    logger.LogError(ex, "Failed to fetch data from {Url}", url);   // stack trace attached
    throw new DataUnavailableException(url, ex);
}
```

Never `Console.WriteLine(ex)` or swallow silently. Never log and re-throw without chaining the original
exception — the caller gets a truncated trace.

## No Secrets or PII in Logs
Credentials, tokens, passwords, and personally identifiable information must never appear in log
messages, exception messages, or `ToString()`/`GetDebuggerDisplay()` output. See `cs-security` for
the full secrets invariant — this rule owns the *where*: the `ILogger` call site is a common leak point.

Redact sensitive values explicitly when they must appear in debugging output:

```csharp
logger.LogDebug("Request headers: {Headers}", request.Headers.Except(SensitiveHeaders));
```

Mark sensitive `record` properties with `[SensitiveData]` (or `[JsonIgnore]`) so they are excluded
from automatic serialization into logs. Never log an entire request/response object without reviewing
what it contains.
