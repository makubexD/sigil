---
id: csharp/cs-logging
kind: rule
title: Logging (.NET / C#)
description: C# logging conventions — injected ILogger<T>, no per-item Information records in a loop, no PII
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
- No `Information` or above per item inside a loop; per-item detail is `Debug` or `Trace`.
- Guard expensive arguments with `logger.IsEnabled(level)`; a hot path uses a `[LoggerMessage]` source generator.
- No PII in messages or properties; never log a whole request or response object.
