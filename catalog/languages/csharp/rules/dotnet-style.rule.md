---
id: csharp/dotnet-style
kind: rule
title: .NET / C# Style
description: >-
  C#-specific style rules. Extends the shared clean-code baseline with .NET idioms,
  naming conventions, and modern C# language feature guidance.
language: csharp
appliesTo:
  - "**/*.cs"
  - "**/*.csproj"
severity: recommended
extends:
  - shared/clean-code
tags:
  - csharp
  - dotnet
  - style
---

- **File-scoped namespaces.** Use `namespace Foo.Bar;` (C# 10+), not the block-scoped `namespace Foo.Bar { }`.
- **`var` where the type is obvious.** Prefer `var` when the right-hand side makes the type clear (`var items = new List<Item>()`). Always spell out the type when it isn't (`IReadOnlyList<Item> items = GetItems()`).
- **Async suffix.** Every `async` method name must end with `Async` (e.g. `GetUserAsync`, `SaveOrderAsync`). No exceptions.
- **Records for immutable data.** Use `record` (or `record class`) for data-carrying types with no mutable state. Use `class` for mutable objects with behaviour.
- **Primary constructors (C# 12+).** Prefer primary constructors for simple DI injection in classes and records when it reduces boilerplate.
- **Return-type narrowing.** Return `IReadOnlyList<T>` instead of `List<T>`, `IReadOnlyDictionary<K,V>` instead of `Dictionary<K,V>`. Callers should not depend on mutability of returned collections.
- **Nullable reference types on.** Enable NRTs in every project (`<Nullable>enable</Nullable>`). Never suppress `#nullable` warnings without a comment explaining why. Never use `!` (null-forgiving) without an assertion or guard above it.
- **Pattern matching over casting.** Use `is Type x` or `switch` expressions instead of `(Type)obj` casts.
- **LINQ readability.** Prefer method syntax for simple chains, query syntax for complex multi-source queries. Break long chains across lines — one method call per line.
- **Disposable resources.** Always wrap `IDisposable` in a `using` declaration or `using` statement. Never rely on the finaliser.
