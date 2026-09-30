---
id: csharp/cs-generate-tests
kind: skill
title: Generate Tests (.NET / C#)
description: Generate an xUnit + Moq test suite for a C# file or class following the project's documented test conventions
name: cs-generate-tests
language: csharp
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
    - csharp/cs-testing
  agents:
    - csharp/cs-code-reviewer
tags:
  - csharp
  - generate
  - tests
whenToUse: "Run via `/cs-generate-tests [file]` when a source file lacks tests or a new public member has no coverage — e.g. \"generate tests for CalendarParser\", \"write xUnit tests for this class\". Omit the argument to scan for untested files and choose interactively. Complements cs-sync-tests, which syncs the whole test suite rather than one target."
---

# Generate Tests

**Target:** $ARGUMENTS

## Step 1 — Resolve target

**If `$ARGUMENTS` is provided:** treat it as the target file or class path.

**If `$ARGUMENTS` is empty:**
1. Discover source files that lack corresponding test files (using the mirroring logic in Step 2).
2. List the top candidates with a one-line description of each, and ask the user to choose before proceeding.

## Step 2 — Discover layout

Inspect the repo — do **not** assume a fixed directory structure:
- Locate the solution root: look for `.sln` or `Directory.Build.props`.
- Locate the source root (`src/`) and test root (`tests/`).
- Read 2–3 existing test files to learn the actual mirroring pattern in use
  (e.g. `src/Foo/Bar.cs` → `tests/Foo.Tests/BarTests.cs`).
- If no tests exist yet, default to: `src/<Ns>/<Type>.cs` → `tests/<Ns>.Tests/<Type>Tests.cs`.

## Step 3 — Read the target

Read the target file fully. Identify:
- Public classes, methods, and properties — these are the primary test subjects.
- Injected dependencies (`interface` parameters) — these are Moq boundaries.
- Complex branching, guard clauses, documented invariants, edge cases, and error paths.
- `CancellationToken` parameters — test both happy path and cancellation.

## Step 4 — Write tests

Follow the project's documented test conventions. Discover them from `CLAUDE.md`, any rules files present, `Directory.Build.props`, or by reading existing tests. Apply these principles:

- **One behaviour per test.** Each test has a single, named reason to fail.
- **AAA pattern.** Mark each section with `// Arrange` / `// Act` / `// Assert`.
- **Descriptive names.** `Method_Should_Behavior_When_Condition`.
- **`[Theory]`/`[InlineData]`.** Use for the same logic over multiple inputs; never single-case `[Theory]`.
  Give each case a readable label via `[InlineData(…)]` or named `[MemberData]`.
- **Moq for I/O boundaries.** `new Mock<IRepository>()`. Test pure logic directly without mocking.
- **Named constants.** Test data goes to class-level `const` or `static readonly` builder helpers — no unnamed inline literals.
- **Coverage target.** Happy path + edge cases (null, empty, zero, boundary) + error/exception paths + `OperationCanceledException` for cancellable methods.
- **`TimeProvider`/`IClock` injection.** Never assert against `DateTime.Now`.
- **Constructor setup.** Use constructor injection for per-test arrange; `IDisposable.Dispose` for cleanup.

```csharp
public sealed class CalendarParserTests : IDisposable
{
    private static readonly string ValidIcs = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR";
    private static readonly DateOnly TestDate = new(2026, 6, 10);

    private readonly Mock<ILogger<CalendarParser>> _logger = new();
    private readonly CalendarParser _sut;

    public CalendarParserTests()
    {
        _sut = new CalendarParser(_logger.Object);
    }

    [Fact]
    public async Task ParseAsync_Returns_Empty_When_No_Events()
    {
        // Arrange
        using var stream = new MemoryStream(Encoding.UTF8.GetBytes(ValidIcs));

        // Act
        var result = await _sut.ParseAsync(stream);

        // Assert
        Assert.Empty(result);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    public async Task ParseAsync_Throws_When_Input_IsNullOrEmpty(string? input)
    {
        // Arrange
        using var stream = input is null
            ? null
            : new MemoryStream(Encoding.UTF8.GetBytes(input));

        // Act
        var act = () => _sut.ParseAsync(stream!);

        // Assert
        await Assert.ThrowsAsync<ArgumentNullException>(act);
    }

    public void Dispose() { /* nothing to clean up here */ }
}
```

Do **not** create `__init__.cs` or `AssemblyInfo.cs` files unless the project already uses them.

## Step 5 — Run and report

Discover the project's test command:
- Check for a build orchestrator (`build.ps1`, `Nuke`, `Cake`, `justfile`, `Makefile`).
- Fallback: `dotnet test <TestProject.csproj> -v minimal`.

Run it. If it fails, diagnose and fix before finishing. Report:

```
Generated: <test-file-path>
Tests written: <N>
Result: ✅ <N> passed  /  ❌ <N> failed
Coverage: <output if available>
```
