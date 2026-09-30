---
id: csharp/cs-documentation
kind: rule
title: Documentation (.NET / C#)
description: C# documentation standards — XML doc comments, what to document, GenerateDocumentationFile
language: csharp
appliesTo:
  - "**/*.cs"
tags:
  - csharp
  - documentation
---

## XML Doc Comment Style
Use `///` XML documentation comments for all public members. The first line is a `<summary>` that
reads as a complete sentence. Add `<param>`, `<returns>`, and `<exception>` as needed.

```csharp
/// <summary>
/// Parses an ICS stream and returns a list of calendar events.
/// </summary>
/// <param name="stream">
/// UTF-8 ICS stream. The caller retains ownership; the method reads but does not close it.
/// </param>
/// <param name="cancellationToken">Propagated to async I/O operations.</param>
/// <returns>
/// A read-only list of parsed <see cref="CalendarEvent"/> objects in chronological order;
/// empty when no VEVENT components are present.
/// </returns>
/// <exception cref="IcsParseException">
/// Thrown when the stream does not contain a valid VCALENDAR component.
/// </exception>
public async Task<IReadOnlyList<CalendarEvent>> ParseAsync(
    Stream stream,
    CancellationToken cancellationToken = default)
```

Enable documentation generation in every library project:
```xml
<PropertyGroup>
    <GenerateDocumentationFile>true</GenerateDocumentationFile>
    <NoWarn>$(NoWarn);CS1591</NoWarn>  <!-- suppress "missing XML comment" on internals/privates -->
</PropertyGroup>
```

With `<GenerateDocumentationFile>true</GenerateDocumentationFile>`, the compiler warns on
undocumented *public* members (CS1591). Use this warning as a documentation coverage gate.

## What Requires a Doc Comment
- Every **public** type, method, property, indexer, event, and constructor.
- Every **public** field on a `record` or `struct` that is not self-evident from its name and type.
- Every `interface` — document the behavioral contract the implementor must satisfy.
- Every non-obvious parameter or return value (even when the type annotation is clear).

`private` and `internal` members warrant a brief one-liner if their purpose is non-obvious; skip
the full `<param>`/`<returns>` block for trivial helpers.

## Use `<inheritdoc/>` for Implementations
When a class implements an interface or overrides a base-class member, use `<inheritdoc/>` rather
than duplicating the documentation. Add supplementary remarks with `<remarks>` when the implementation
has important constraints the caller needs to know.

```csharp
/// <inheritdoc/>
/// <remarks>Results are sorted by <see cref="CalendarEvent.Start"/>.</remarks>
public async Task<IReadOnlyList<CalendarEvent>> ParseAsync(Stream stream, CancellationToken ct)
```

## What Must Not Go in Doc Comments
- Implementation detail that will drift from the code and become misleading.
- Commented-out code.
- A restatement of the member name (`ParseAsync` + `<summary>Parses async.</summary>` adds nothing).
- Internal `<exception>` entries for `ArgumentNullException` when the parameter is non-nullable and
  NRT is enabled — the compiler already enforces this.

## Comments in Code
Use `//` comments to explain **why**, not **what** — the code already shows what. A comment
restating the operation (`// increment counter`) is noise; a comment explaining intent
(`// offset by 1 because the API uses 1-based page indices`) is signal.

Never comment out code — delete it. Git history is the correct backup mechanism (see `cs-git`).

## Namespace and File-Level Documentation
Consider `<summary>` on the namespace in `namespace.xml` or a module-level comment block for
complex packages with multiple collaborating types. The summary is what DocFX displays in the
namespace listing.

## Nullable Annotations as Documentation
Fully annotated public signatures are documentation. A `string?` return type communicates
"may be absent" without a word of prose. Prioritize keeping NRT annotations accurate over
keeping summaries voluminous — a wrong annotation fails the compiler; a wrong summary misleads.

## README Expectations
Every project should have a top-level `README.md` containing:
- What the project does (one paragraph).
- Installation / quickstart.
- Required environment variables or secrets (list names only, never values).
- How to run tests and quality gates.

Do not create or update the `README.md` inside a normal coding task — maintain it deliberately.

## Keeping Docs Current
When a public member's signature, return contract, raised exception, or behavior changes:
1. Update the `<summary>` / `<param>` / `<returns>` / `<exception>` in the **same commit**.
2. Update the `README` if the change affects installation, CLI usage, or configuration.

A stale doc comment actively misleads — it describes the wrong contract.
