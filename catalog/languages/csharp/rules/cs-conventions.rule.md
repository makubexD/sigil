---
id: csharp/cs-conventions
kind: rule
title: Conventions (.NET / C#)
description: "C# conventions — NRT, naming, var, async suffix, records, interfaces, disposable, switch expressions"
language: csharp
appliesTo:
  - "**/*.cs"
  - "**/*.csproj"
tags:
  - csharp
  - conventions
  - dotnet
  - style
appliesToRationale: Scoped to C# source and project files because these conventions span both language-level style (naming, nullability, records) and project-level settings (file-scoped namespaces are declared per-project).
---

- `<Nullable>enable</Nullable>` in every project, and every public member annotated. No `dynamic` or bare
  `object`: use a generic or an interface, and narrow with a pattern match.
- Absence is `T?`, never a sentinel (`""`, `-1`). No `#nullable disable`; a `#pragma warning disable CSnnnn` names
  the code and gives the reason.
- A value object or DTO is a `record` (`readonly record struct` on a hot path), with invariants checked in the
  constructor or a factory.
- `interface` for a contract; an abstract base class only to share implementation.
- No mutable `static` field, service locator or `static class` used as a singleton repository.
- File-scoped namespaces; one public type per file, named after it.
- Return `IReadOnlyList<T>` or `IReadOnlyDictionary<K, V>`, not the mutable collection.
- `var` only when the right-hand side shows the type.
- A `switch` expression over a long `if` or `is` chain.
- Every `IDisposable` is in a `using` declaration or statement.
- No empty `catch`; rethrow with `throw;`, never `throw ex;`. An expected outcome is a return value, not an
  exception. No `Thread.Sleep`: `Task.Delay` with a `CancellationToken`.
- Names: `PascalCase` types and public members, `IPascalCase` interfaces, `_camelCase` private fields, `camelCase`
  locals and parameters; an async method ends in `Async`.
