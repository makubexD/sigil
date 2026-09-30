---
id: csharp/cs-conventions
kind: rule
title: Conventions (.NET / C#)
description: "C# conventions — NRT, naming, var, async suffix, records, interfaces, LINQ, disposable, switch expressions, guard clauses"
language: csharp
appliesTo:
  - "**/*.cs"
  - "**/*.csproj"
severity: recommended
extends:
  - shared/clean-code
tags:
  - csharp
  - conventions
  - dotnet
  - style
---

## Nullable Reference Types (NRT), Not `object` or `dynamic`
Enable `<Nullable>enable</Nullable>` in every project. Annotate every public member's parameter
and return type. Avoid `dynamic` and bare `object` — they bypass the compiler the same way
`Any` bypasses the type checker. Use generics (`T`, `IReadOnlyList<T>`) or interfaces for polymorphism.
When a type truly cannot be known at annotation time, narrow it with a pattern match or explicit cast
as soon as possible rather than propagating `object`.

## Explicit Nullability
Model absence with `T?` (both reference and value types) — never a sentinel string (`""`, `"N/A"`),
magic integer (`-1`), or undocumented `null` return.

- **Reference types**: `string?`, `IReadOnlyList<Entry>?`.
- **Value types**: `int?`, `DateTimeOffset?`, `Guid?`.

`#pragma warning disable CSnnnn` is banned without an inline reason:
```csharp
#pragma warning disable CS8618  // _name set in Init() called from every constructor path
```
Prefer `[SuppressMessage("...", Justification = "...")]` on methods where the pragma scope would
be too wide. Never use a blanket `#nullable disable` to silence the compiler.

## Naming
| Symbol | Style | Example |
|---|---|---|
| Classes, records, structs, enums, delegates | `PascalCase` | `CalendarEvent`, `RowKind` |
| Interfaces | `IPascalCase` | `ICalendarParser`, `IReporter` |
| Public methods, properties, events, constants | `PascalCase` | `ParseIcs()`, `DailyCapHours` |
| Private / protected fields | `_camelCase` | `_logger`, `_config` |
| Local variables, parameters | `camelCase` | `calendarRows`, `dateFrom` |
| Type parameters | `T` or `TPurpose` | `T`, `TResult`, `TEntity` |

One cohesive concern per file; filename matches the primary type it declares. Avoid multi-type files
except for small, tightly coupled private helpers (`private sealed class …` nested inside the owner).

## Records for Value Objects and DTOs
Use `record` for immutable value objects and DTOs — `record` gives you structural equality,
`ToString()`, deconstruction, and `with`-expressions for free.

```csharp
// Immutable value object
public sealed record TimesheetRow(DateOnly Date, TimeOnly Start, TimeOnly End, string Summary);

// Struct version for hot-path allocation-free use
public readonly record struct DateRange(DateOnly From, DateOnly To);
```

Validate structural invariants in a constructor or factory method: `ArgumentException` / `ArgumentOutOfRangeException`
with a descriptive message. Keep business-rule validation in the service layer where dependencies can be injected.

For mutable state that needs notifications, use `class`. For closed sets of named constants, use `enum`.

## Interfaces, Not Abstract Base Classes
Prefer `interface` for polymorphic contracts — it is the C# equivalent of a Protocol (with the
important difference that C# uses **nominal** subtyping, not structural). Abstract base classes are
appropriate only when sharing implementation, not when defining a contract.

- Keep interfaces narrow (Interface Segregation). A caller should not depend on members it doesn't use.
- Avoid `I`-prefixed marker interfaces with no members — use attributes or generic constraints instead.
- `default interface methods` are for non-breaking extension of published contracts only.

## Composition over Inheritance
Prefer composing objects over inheriting from base classes. Inheritance couples a subclass to its
parent's implementation and creates fragile hierarchies. Use it only when a genuine IS-A relationship
exists and LSP holds.

- **Inheritance depth:** ≤ 2 levels; anything deeper is a design smell — extract a collaborator.
- **Static utility classes**: pure `static` extension-method classes are the C# norm for utility logic;
  they are acceptable. Ban: static *mutable* fields (hidden shared state), Service Locator, and
  `static class` acting as a singleton repository.

## Control Flow and Pattern Matching
Prefer `switch` expressions over long `if`/`else if` or `is`-chains when branching on shape or value:

```csharp
var label = status switch
{
    RowKind.Holiday  => "🏖",
    RowKind.Pto      => "🌴",
    RowKind.Normal   => "✅",
    _                => "❓",
};
```

**Guard clauses over nesting.** Return or throw early at the top of a method for invalid or trivial
cases. Deep nesting (> 2–3 levels) is a readability smell — flatten with early returns or extracted
helpers.

## File-Scoped Namespaces and One Type Per File
Use file-scoped namespace declarations (C# 10+) to eliminate one level of indentation:

```csharp
namespace OutlookReader.Calendar;   // file-scoped

public sealed class CalendarParser { … }
```

One primary public type per file. The filename must match the type name.

## Imports (`using`)
Order: BCL → third-party → project (enforced by `dotnet format` with `.editorconfig`). All `using`
directives at the top of the file (or as `global using` in a single `GlobalUsings.cs`). Avoid
`using static` except for well-known math/string helpers (`using static System.Math`).

## Constants and Strings
Declare compile-time constants with `const` or `static readonly` at class scope in `PascalCase`.
Use `$"…"` interpolation for string formatting — no `string.Format(…)` for new code. Use `string.Empty`
rather than `""` only when the distinction aids clarity; never use both interchangeably.

## Type Inference (`var`)
Use `var` when the right-hand side makes the type obvious (`var items = new List<Item>()`). Always spell
out the type when it isn't (`IReadOnlyList<Item> items = GetItems()`). Never use `var` for primitive
types or when the type adds essential context for readers.

## Async Naming
Every `async` method name must end with `Async` (e.g. `GetUserAsync`, `SaveOrderAsync`). No exceptions.
The suffix signals to callers that the method returns an awaitable and that they are responsible for
awaiting it.

## Primary Constructors (C# 12+)
Prefer primary constructors for simple DI injection in classes and records when it reduces boilerplate.
Fall back to explicit constructors only when you need constructor-body logic.

## Return-Type Narrowing
Return `IReadOnlyList<T>` instead of `List<T>`, `IReadOnlyDictionary<K,V>` instead of
`Dictionary<K,V>`. Callers should not depend on the mutability of returned collections; narrowing the
return type prevents callers from adding or removing items.

## LINQ Readability
Prefer method syntax for simple chains, query syntax for complex multi-source queries. Break long chains
across lines — one method call per line. Extract complex selectors or predicates into named helper methods.

## Disposable Resources
Always wrap `IDisposable` in a `using` declaration (`using var conn = …`) or `using` statement. Never
rely on the finaliser for cleanup. For async disposables, use `await using`.

## Never
- `catch (Exception) { }` or a bare `catch { }` — these are silent lies.
- `catch (Exception ex) { throw ex; }` — this resets the stack trace; use `throw;` instead.
- Mutable `static` fields (hidden shared state, obstructs testing and concurrency).
- `dynamic` or unbounded `object` casts without a documented justification.
- Unpinned `#pragma warning disable` — always specify the code and add a reason.
- Using exceptions for expected control flow (return a typed value instead).
- `Thread.Sleep(…)` in production code — use `CancellationToken` + `Task.Delay`.
