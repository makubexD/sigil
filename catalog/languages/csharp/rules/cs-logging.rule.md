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

## Logging

- Diagnostics go through an injected `ILogger<T>`, never `Console.WriteLine`, even in a class that already writes
  to `Console`. `Console` only for output the CLI user is meant to read.
- Use a message template with named placeholders (`logger.LogDebug("Item {Index} of {Total}", index, total)`),
  never a `$"..."` string.
- Log an exception by passing it first (`logger.LogError(ex, "...")`), never `ex.Message` alone or
  `Console.WriteLine(ex)`.
- No `Information` or above per item inside a loop; per-item detail is `Debug` or `Trace`.
- Guard expensive arguments with `logger.IsEnabled(level)`; a hot path uses a `[LoggerMessage]` source generator.
- No credentials, tokens or PII in messages or properties; never log a whole request or response object.
