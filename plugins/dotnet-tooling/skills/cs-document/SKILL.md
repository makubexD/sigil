---
name: cs-document
description: "Generate or update XML doc comments and module-level documentation following the project's documented docstring style (.NET / C#)"
when_to_use: "Run via `/cs-document [file]` when public members are missing XML doc comments — e.g. \"document this class\", \"find undocumented public API\". Omit the argument to scan the whole source for undocumented symbols."
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
argument-hint: "[file-or-class] (optional)"
---

# Document

**Target:** $ARGUMENTS

## Step 1 — Resolve target

**If `$ARGUMENTS` is provided:** treat it as the target file or class.

**If `$ARGUMENTS` is empty:**
1. Discover the source root from `.sln`, `Directory.Build.props`, or common roots.
2. Scan for public members that lack `///` doc comments:
   ```bash
   grep -rn "public\s" src/ --include="*.cs" -l
   ```
3. List the top candidates (most undocumented symbols) and ask the user to choose.

## Step 2 — Discover documentation style

Do **not** assume a style. Discover it:
- Read `CLAUDE.md` and any rules files present.
- Check `Directory.Build.props` for `<GenerateDocumentationFile>true</GenerateDocumentationFile>`.
- Check `.editorconfig` for `dotnet_diagnostic.CS1591.severity` (missing XML comment).
- Read 2–3 existing doc comments in the project to identify the in-use style and level of detail.
- If no style is declared, default to **full XML doc comments** (`<summary>`, `<param>`, `<returns>`,
  `<exception>` where appropriate).

## Step 3 — Read the target

Read the target file fully. Identify:
- Public types, constructors, methods, properties, and indexers **missing** `///` doc comments.
- Public items with **incomplete** comments (missing `<param>`, `<returns>`, or `<exception>` sections).
- `interface` types: is the behavioral contract documented?
- `record` / `record struct` properties: are non-obvious properties documented?

Do not touch `private` or `internal` members unless their purpose is genuinely non-obvious.
Use `<inheritdoc/>` for explicit interface implementations — never duplicate the interface doc.

## Step 4 — Write documentation

**One-liner (trivial member):**
```csharp
/// <summary>Returns <see langword="true"/> if <paramref name="d"/> falls on Saturday or Sunday.</summary>
public static bool IsWeekend(DateOnly d) => d.DayOfWeek is DayOfWeek.Saturday or DayOfWeek.Sunday;
```

**Full doc comment (non-trivial method):**
```csharp
/// <summary>Merges calendar rows and developer-activity rows into a unified daily timeline.</summary>
/// <param name="calendarRows">Calendar rows in chronological order; preserved verbatim in the output.</param>
/// <param name="devRows">Developer-activity rows used to fill remaining time up to the daily cap.</param>
/// <returns>A merged list sorted by start time, never <see langword="null"/>.</returns>
/// <exception cref="ArgumentNullException">Thrown when either parameter is <see langword="null"/>.</exception>
public async Task<IReadOnlyList<TimesheetRow>> MergeAsync(
    IReadOnlyList<TimesheetRow> calendarRows, IReadOnlyList<DevDayRow> devRows)
```

**`interface` contract:**
```csharp
/// <summary>
/// Parses an ICS stream into a sequence of calendar events.
/// </summary>
/// <remarks>
/// Implementations must handle both rich export (ATTENDEE/PARTSTAT) and free/busy export
/// (METHOD:PUBLISH) formats. See <see cref="StatusSource"/> for the detection logic.
/// </remarks>
public interface ICalendarParser
```

**Rules:**
- Never restate the member name (`ParseAsync` + `<summary>Parses async.</summary>` adds nothing).
- Document *what contract*, not *how* (implementation details drift).
- Keep the `<summary>` line ≤ 72 characters.
- `<exception>` entries only for exceptions the caller must handle; not internal `ArgumentException`
  on non-nullable NRT parameters (the compiler already enforces those).
- Use `<see cref="…"/>` for cross-references to related types and members.
- For async members, document the `CancellationToken` parameter if it is meaningful to callers.

## Step 5 — Run and report

Run `dotnet build` to verify no CS1591 warnings remain on documented public members:

```bash
dotnet build --no-restore 2>&1 | grep "CS1591"
```

```
## Documentation Report

Target: <file-or-class>
Doc comments added: <N>
Doc comments updated: <N>
Still undocumented: <N> (list them)
Build: ✅ 0 CS1591 warnings / ❌ <N> CS1591 warnings remain
```

---

## Applied Rules

### Documentation (.NET / C#)

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
