---
id: csharp/cs-document
kind: skill
title: "Document (.NET / C#)"
description: "Generate or update XML doc comments and module-level documentation following the project's documented docstring style"
name: cs-document
language: csharp
appliesTo:
  - "**/*"
allowedTools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
argumentHint: "[file-or-class] (optional)"
uses:
  rules:
    - csharp/cs-documentation
  agents:
    - csharp/cs-code-reviewer
tags:
  - csharp
  - document
  - documentation
---

## When to Use

Use when public members are missing XML doc comments, or after adding new public API surface. Pass a target file; omit to scan for undocumented public symbols across the source.

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
- Read `CLAUDE.md` and `.claude/` rules if present.
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
/// <summary>
/// Merges calendar rows and developer-activity rows into a unified daily timeline.
/// </summary>
/// <param name="calendarRows">
/// Calendar rows in chronological order; preserved verbatim in the output.
/// </param>
/// <param name="devRows">
/// Developer-activity rows used to fill remaining time up to the daily cap.
/// </param>
/// <param name="cancellationToken">Propagated to any async operations performed during merge.</param>
/// <returns>
/// A merged list of <see cref="TimesheetRow"/> objects sorted by start time, never <see langword="null"/>.
/// </returns>
/// <exception cref="ArgumentNullException">
/// Thrown when <paramref name="calendarRows"/> or <paramref name="devRows"/> is <see langword="null"/>.
/// </exception>
public async Task<IReadOnlyList<TimesheetRow>> MergeAsync(
    IReadOnlyList<TimesheetRow> calendarRows,
    IReadOnlyList<DevDayRow> devRows,
    CancellationToken cancellationToken = default)
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
Documentation Report
  Target: <file-or-class>
  Doc comments added: <N>
  Doc comments updated: <N>
  Public symbols still undocumented: <N> (list them)
  Build: ✅ 0 CS1591 warnings / ❌ <N> CS1591 warnings remain
```
