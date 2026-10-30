---
name: cs-release
description: "Prepare a .NET release — verify quality gates, generate a changelog from git log, and propose a version bump with SemVer classification"
when_to_use: "Run manually via `/cs-release <version>` before cutting a release tag — e.g. \"prepare a release\", \"cut version 2.1.0\". Pass the target version number as the argument; omit it to get a suggested bump from recent commits. Does not tag, push, or publish — produces a checklist and changelog draft for human review."
allowed-tools: Read, Bash, Glob, Grep
argument-hint: "<version> (e.g. 2.1.0)"
disable-model-invocation: true
---

# Release Preparation

**Target version:** $ARGUMENTS

> This skill is **user-invoked only** (`disable-model-invocation: true`). It prepares
> the release but does **not** create a tag, push to remote, or publish to a registry.
> All final actions require human confirmation.

## Step 1 — Verify quality gates

Discover and run the project's full quality gate:

```bash
# Check for a build orchestrator (build.ps1, Nuke, Cake, justfile, Makefile)
# Fallback: run the standard triple gate
dotnet format --verify-no-changes
dotnet build -warnaserror --no-restore
dotnet test --no-build
```

**If any gate fails: stop and report.** Do not proceed — a release with failing gates is blocked.

## Step 2 — Check the working tree

```bash
git status --porcelain
git stash list
```

If there are uncommitted changes or stashes, **report and stop** — a release must be cut from a
clean working tree.

Note the current branch and whether it is ahead of or behind the remote:
```bash
git log --oneline origin/main..HEAD
```

## Step 3 — Determine the version

**If `$ARGUMENTS` is provided:** use that as the target version.

**If `$ARGUMENTS` is empty:**
1. Read the current version from `Directory.Build.props`, `Directory.Packages.props`, or the library
   `.csproj` (`<Version>`, `<VersionPrefix>`, or `<AssemblyVersion>`).
2. Read recent commits (Step 4) and suggest a version bump:
   - Any `feat:` commit → **minor** bump (`X.Y+1.0`).
   - Only `fix:` / `refactor:` / `chore:` / `perf:` commits → **patch** bump (`X.Y.Z+1`).
   - A commit body containing `BREAKING CHANGE:` → **major** bump (`X+1.0.0`).
   - A `cs-api-compat-reviewer` report with Breaking-tier findings → **major** bump regardless.
Ask the user to confirm the version before proceeding.

## Step 4 — Generate changelog

```bash
git log $(git describe --tags --abbrev=0)..HEAD --oneline --no-merges
```

If no tag exists, use: `git log --oneline --no-merges`.

Group commits by type and produce a changelog section:

```markdown
## [<version>] — <today's date>

### ⚠️ Breaking Changes
- <summary of BREAKING CHANGE commits or cs-api-compat-reviewer Breaking findings>

### Features
- <summary of feat: commits>

### Bug Fixes
- <summary of fix: commits>

### Performance
- <summary of perf: commits>

### Refactoring / Other
- <refactor, chore, docs, ci, test commits>
```

Omit sections with no entries.

## Step 5 — Check API compatibility

If a `cs-api-compat-reviewer` report was produced for this branch, include its SemVer recommendation
and confirm it matches the proposed version bump. If not, suggest running it:
```
Note: cs-api-compat-reviewer was not run. For library packages, run it before releasing to confirm
no unintentional breaking changes.
```

## Output Release Checklist

```
## Release Checklist — v<version>

### Quality gates
✅ format passed  /  ✅ build passed  /  ✅ tests passed (<N> tests, <coverage>%)

### Working tree
✅ clean  /  ❌ uncommitted changes — resolve before releasing

### Version
Current: <current-version>
Proposed: <target-version>
Bump type: <major / minor / patch>
API compat: <cs-api-compat-reviewer SemVer recommendation, or "not run">

### Changelog draft
<markdown changelog section from Step 4>

### Next steps (human action required)
1. Review and edit the changelog above; paste into CHANGELOG.md.
2. Update `<Version>` in `Directory.Build.props` (or the library `.csproj`) to `<target-version>`.
3. Commit: `git commit -m "chore: release v<target-version>"`
4. Tag:    `git tag -a v<target-version> -m "Release v<target-version>"`
5. Push:   `git push origin main --tags`
6. Pack:   `dotnet pack -c Release -o ./artifacts`
7. Publish (if applicable):
           `dotnet nuget push ./artifacts/*.nupkg --api-key "$NUGET_API_KEY" --source https://api.nuget.org/v3/index.json`
           `dotnet nuget push ./artifacts/*.snupkg --api-key "$NUGET_API_KEY" --source https://api.nuget.org/v3/index.json`
```

---

## Applied Rules

### Conventions (.NET / C#)

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

### NuGet (.NET / C#)

## Central Package Management (CPM)
Manage all package versions in one place with Central Package Management. This eliminates version
drift across projects in a multi-project solution.

**`Directory.Packages.props`** (solution root):
```xml
<Project>
  <PropertyGroup>
    <ManagePackageVersionsCentrally>true</ManagePackageVersionsCentrally>
    <!-- Pin transitive deps you want to control -->
    <!-- <CentralPackageTransitivePinningEnabled>true</CentralPackageTransitivePinningEnabled> -->
  </PropertyGroup>
  <ItemGroup>
    <PackageVersion Include="xunit" Version="2.9.3" />
    <PackageVersion Include="Moq" Version="4.20.72" />
    <PackageVersion Include="Serilog" Version="4.2.0" />
  </ItemGroup>
</Project>
```

**Per-project `.csproj`** — version attribute is **omitted**; it is inherited from CPM:
```xml
<PackageReference Include="Serilog" />
```

If a project must override a version (rare, documented exception), use `VersionOverride` and add a
comment explaining why.

## Lock Files — Reproducible Restores
Enable `packages.lock.json` so every restore is reproducible:

```xml
<!-- Directory.Build.props -->
<PropertyGroup>
    <RestorePackagesWithLockFile>true</RestorePackagesWithLockFile>
</PropertyGroup>
```

Commit `packages.lock.json` to version control. Regenerate it with:
```bash
dotnet restore --force-evaluate   # recalculate all package versions
```

In CI, pass `--locked-mode` to fail fast on lock-file drift:
```bash
dotnet restore --locked-mode
```

## Package Source Mapping (Supply-Chain Defense)
Map each package to an allowed feed in `nuget.config` — this prevents **dependency confusion
attacks** where a malicious package with the same name as an internal package is published to
`nuget.org` and pulled in ahead of your private feed.

```xml
<!-- nuget.config -->
<configuration>
  <packageSources>
    <add key="nuget.org"   value="https://api.nuget.org/v3/index.json" />
    <add key="my-private"  value="https://pkgs.dev.azure.com/my-org/_packaging/my-feed/nuget/v3/index.json" />
  </packageSources>
  <packageSourceMapping>
    <!-- All packages from my-private feed come only from my-private -->
    <packageSource key="my-private">
      <package pattern="MyOrg.*" />
    </packageSource>
    <!-- Everything else must come from nuget.org -->
    <packageSource key="nuget.org">
      <package pattern="*" />
    </packageSource>
  </packageSourceMapping>
</configuration>
```

**Never commit feed credentials** in `nuget.config`. Use `nuget.config` for source URLs and mapping
only; inject credentials via environment variables (Azure Pipelines, GitHub Actions secrets) or
`dotnet nuget add source … --username … --password … --store-password-in-clear-text`.

## NuGet Audit
Enable `<NuGetAudit>` so `dotnet restore` warns on packages with known CVEs:

```xml
<!-- Directory.Build.props -->
<PropertyGroup>
    <NuGetAudit>true</NuGetAudit>
    <NuGetAuditMode>all</NuGetAuditMode>       <!-- include transitive deps -->
    <NuGetAuditLevel>moderate</NuGetAuditLevel> <!-- Moderate, High, Critical -->
</PropertyGroup>
```

Run an explicit audit in CI:
```bash
dotnet list package --vulnerable --include-transitive
```

## Package Signing and Trusted Signers
Prefer packages that are **author-signed** and have a repository signature from `nuget.org`. For
regulated environments, enforce signature verification in `nuget.config`:

```xml
<configuration>
  <trustedSigners>
    <repository name="nuget.org" serviceIndex="https://api.nuget.org/v3/index.json">
      <certificate fingerprint="…" hashAlgorithm="SHA256" allowUntrustedRoot="false" />
    </repository>
  </trustedSigners>
</configuration>
```

## `PrivateAssets` and `IncludeAssets`
Control what flows to downstream consumers of your package:

```xml
<!-- Analyzer / build-only — never shipped as a transitive dependency -->
<PackageReference Include="Roslynator.Analyzers" Version="4.12.9">
    <PrivateAssets>all</PrivateAssets>
    <IncludeAssets>runtime; build; native; contentfiles; analyzers</IncludeAssets>
</PackageReference>
```

This is essential for analyzer and source-generator packages; if `PrivateAssets` is omitted,
the analyzer becomes a transitive dependency of every consumer of your library.

## Deterministic Builds and SourceLink
For library packages, enable deterministic builds and SourceLink so consumers can debug into
your source:

```xml
<!-- Directory.Build.props -->
<PropertyGroup>
    <Deterministic>true</Deterministic>
    <ContinuousIntegrationBuild Condition="'$(CI)' == 'true'">true</ContinuousIntegrationBuild>
    <PublishRepositoryUrl>true</PublishRepositoryUrl>
    <EmbedUntrackedSources>true</EmbedUntrackedSources>
    <!-- SourceLink for GitHub, Azure DevOps, GitLab, etc. -->
</PropertyGroup>
```

Emit symbol packages (`.snupkg`) alongside `.nupkg` so the NuGet symbol server can serve PDBs:
```bash
dotnet pack -p:SymbolPackageFormat=snupkg --include-symbols
```

## Packing and Publishing
Use `dotnet pack` and `dotnet nuget push` — do not use the `NuGet.exe` CLI for new projects.
Never store the push API key in committed files; inject via environment variable:

```bash
dotnet nuget push ./bin/Release/*.nupkg \
    --api-key "$NUGET_API_KEY" \
    --source https://api.nuget.org/v3/index.json
```

See `cs-security` for the full secrets invariant and `cs-release` skill for the end-to-end
release checklist.
