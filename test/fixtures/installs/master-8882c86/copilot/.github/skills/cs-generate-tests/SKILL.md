---
name: cs-generate-tests
description: "Generate an xUnit + Moq test suite for a C# file or class following the project's documented test conventions"
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---

## When to Use

Run via `/cs-generate-tests [file]` when a source file lacks tests or a new public member has no coverage — e.g. "generate tests for CalendarParser", "write xUnit tests for this class". Omit the argument to scan for untested files and choose interactively. Complements cs-sync-tests, which syncs the whole test suite rather than one target.

**Arguments:** [file-or-class] (optional)

# Generate Tests

**Target:** the request you were given

## Step 1 — Resolve target

**If `the request you were given` is provided:** treat it as the target file or class path.

**If `the request you were given` is empty:**
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

Follow the project's documented test conventions. Discover them from `AGENTS.md`, any rules files present, `Directory.Build.props`, or by reading existing tests. Apply these principles:

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
public sealed class CalendarParserTests
{
    private static readonly string ValidIcs = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR";
    private readonly Mock<ILogger<CalendarParser>> _logger = new();
    private readonly CalendarParser _sut;

    public CalendarParserTests() => _sut = new CalendarParser(_logger.Object);

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    public async Task ParseAsync_Throws_When_Input_IsNullOrEmpty(string? input)
    {
        // Arrange
        using var stream = input is null ? null : new MemoryStream(Encoding.UTF8.GetBytes(input));

        // Act
        var act = () => _sut.ParseAsync(stream!);

        // Assert
        await Assert.ThrowsAsync<ArgumentNullException>(act);
    }
}
```

Add `: IDisposable` + a `Dispose()` only when the fixture actually holds a disposable resource. Do
**not** create `__init__.cs` or `AssemblyInfo.cs` files unless the project already uses them.

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

---

## Coding guidelines to apply

### Testing (.NET / C#)

## AAA Pattern
Every test has three sections separated by blank lines:
**Arrange** (build data and configure state), **Act** (call the unit under test),
**Assert** (verify results). Label each section with an inline comment
(`// Arrange`, `// Act`, `// Assert`) even when the section is one line.

```csharp
[Fact]
public void Format_Duration_Returns_Hours_And_Minutes_When_Both_Present()
{
    // Arrange
    const int TotalMinutes = 75;

    // Act
    var result = Duration.Format(TotalMinutes);

    // Assert
    Assert.Equal("1h 15m", result);
}
```

## Naming
Test methods: `Method_Should_Behavior_When_Condition` or `Method_Returns_Expected_When_Condition`.
Group related tests in one `public sealed class` per class under test
(e.g., `CalendarParserTests`, `NormalizerTests`). Each test covers exactly one behavior. Multiple
behaviors under the same condition → multiple test methods, not a single long test.

## No Magic Values
All test data is named: class-level `const` / `static readonly` fields or builder helper methods
(`MakeEvent(…)`, `Utc(…)`) declared at the top of the test class. Never use unnamed inline
literals (raw datetimes, unexplained integer constants, bare strings) directly in assertions or act calls.

```csharp
private static readonly DateOnly TestDate = new(2026, 6, 10);
private static readonly string TestSummary = "Standup";
```

## Mock Only I/O Boundaries
Mock filesystem access, network calls, clocks, database access, and external services.
Test pure functions, domain logic, and records through their real implementations — do not mock
internal collaborators. Use **Moq** (`new Mock<IRepo>()`) when a double is needed. Do not add
additional mocking libraries for new code; Moq is sufficient.

Use `tmp_path`-equivalent patterns for real file I/O (e.g., `Path.GetTempFileName()` + cleanup in
`Dispose()`).

```csharp
var repo = new Mock<ICalendarRepository>();
repo.Setup(r => r.LoadAsync(It.IsAny<string>(), default))
    .ReturnsAsync(SampleEvents);
```

## Fixtures and Lifecycle
Use **constructor injection** for per-test setup and `IDisposable.Dispose()` for cleanup — xUnit
constructs a fresh instance per test, guaranteeing isolation by default.

For **genuinely expensive, read-only shared resources** (e.g., a pre-parsed large ICS file, a
real database connection), use `IClassFixture<T>` or `ICollectionFixture<T>`. Never share mutable
state through fixtures.

```csharp
public sealed class CalendarParserTests : IDisposable
{
    private readonly string _tempFile;

    public CalendarParserTests()
    {
        _tempFile = Path.GetTempFileName();
        File.WriteAllText(_tempFile, SampleIcs);
    }

    public void Dispose() => File.Delete(_tempFile);
}
```

## Parametrize with `[Theory]`
Use `[Theory]` + `[InlineData]` / `[MemberData]` / `[ClassData]` for the same behavior over
multiple inputs. Never a single-case `[Theory]` — use a plain `[Fact]` instead. Give each case a
readable description via `[InlineData(…)]` labels or explicit `MemberData` names so failures are
self-describing.

```csharp
[Theory]
[InlineData(15,  "15m")]
[InlineData(60,  "1h")]
[InlineData(75,  "1h 15m")]
[InlineData(0,   "0m")]
public void Format_Duration_Returns_Correct_String(int minutes, string expected)
{
    // Arrange / Act
    var result = Duration.Format(minutes);

    // Assert
    Assert.Equal(expected, result);
}
```

## Time and Dates
Never assert against the real `DateTime.Now`, `DateTime.UtcNow`, or `DateTimeOffset.Now`. Inject
time via `TimeProvider` (.NET 8+) or a custom `IClock` interface, and use a deterministic fake in
tests. A test that passes today but fails tomorrow is a broken test.

```csharp
// Production code
public sealed class ReportService(TimeProvider clock)
{
    public DateOnly Today() => DateOnly.FromDateTime(clock.GetUtcNow().DateTime);
}

// Test
var fakeTime = new FakeTimeProvider(new DateTimeOffset(2026, 6, 10, 0, 0, 0, TimeSpan.Zero));
var sut = new ReportService(fakeTime);
Assert.Equal(new DateOnly(2026, 6, 10), sut.Today());
```

## Coverage
Discover and run the project's coverage command:
- Check the solution/project for a build orchestrator (`build.ps1`, `Nuke`, `Cake`, `justfile`).
- Fallback: `dotnet test --collect:"XPlat Code Coverage"` + ReportGenerator, or
  `dotnet test /p:CollectCoverage=true /p:CoverletOutputFormat=cobertura` (Coverlet MSBuild).

Hold a minimum of **70% line coverage** across the main source projects. Coverage gaps on
I/O-boundary code (CLI handlers, HTTP clients, database adapters) are acceptable; gaps on pure
domain logic are not.

## Anti-Patterns
- `Thread.Sleep(…)` in tests — use fake `TimeProvider` or `CancellationToken`-based delays.
- Test-specific flags or branches in production code.
- Asserting on private members when a public API exercises the same path — unless the private logic
  is complex enough to warrant an explicit contract.
- `Assert.True(result != null)` instead of `Assert.NotNull(result)` — use the semantic assert.
- A single-case `[Theory]` — use a plain `[Fact]`.
- Shared mutable state between tests without `IClassFixture<T>`.
