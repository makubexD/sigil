---
name: cs-scaffold-project
description: "Scaffold a new .NET project with the solution's standards pre-wired — NRT, analyzers, CPM, file-scoped namespaces, correct src/tests layout — and add it to the .sln"
when_to_use: "Run via `/cs-scaffold-project <name>` when adding a new project to an existing .NET solution — e.g. \"scaffold a new library project\", \"add a Reporting project to the solution\". Pass the project name and optional `--type`. Never overwrites existing files; confirms before editing the .sln. For an empty directory with no solution, use cs-new-project instead."
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
argument-hint: "<name> [--type=lib|console|web|test]"
---

# Scaffold Project

**Project name + type:** $ARGUMENTS

Parse `$ARGUMENTS`:
- First token → `<name>` (e.g. `MyOrg.MyLib.Reporting`)
- `--type=<lib|console|web|test>` (default: `lib`)

## Step 1 — Discover repo standards

Read `Directory.Build.props` (TFM, `<Nullable>`, `<LangVersion>`, `<ImplicitUsings>`, analyzer
settings), `Directory.Packages.props` (CPM-managed package versions), `.editorconfig` (code style
and analyzer severities), `CLAUDE.md` (architecture layers, naming), and an existing
similar project's `.csproj` as a reference — this is what "standards pre-wired" means for this
solution. If none of these exist, prompt the user for the target TFM and whether CPM is in use.

## Step 2 — Determine placement

Based on `--type`:
- `lib` → `src/<name>/<name>.csproj` + matching `tests/<name>.Tests/<name>.Tests.csproj`
- `console` → `src/<name>/<name>.csproj` (output type EXE) + `tests/<name>.Tests/<name>.Tests.csproj`
- `web` → `src/<name>/<name>.csproj` (ASP.NET Core) + `tests/<name>.Tests/<name>.Tests.csproj`
- `test` → `tests/<name>/<name>.csproj` only (no paired source project)

Do not overwrite any existing file. If the target path already exists, **stop and report**.

## Step 3 — Scaffold the project

Create `src/<name>/<name>.csproj` inheriting shared properties from `Directory.Build.props`:

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <!-- TFM/Nullable/LangVersion/TreatWarningsAsErrors inherit from Directory.Build.props -->
    <OutputType>Library</OutputType>  <!-- Exe for console/web -->
    <RootNamespace><name></RootNamespace>
    <AssemblyName><name></AssemblyName>
  </PropertyGroup>
</Project>
```

Create `src/<name>/GlobalUsings.cs` (project-wide `global using` directives, kept minimal) and a
seed type file demonstrating the project's conventions — file-scoped namespace, NRT, XML docs:
```csharp
// src/<name>/<PrimaryType>.cs
namespace <name>;

/// <summary>
/// Entry point for the <name> concern.
/// </summary>
public sealed class <PrimaryType>
{
    // TODO: implement
}
```

For **console**, create `Program.cs` with `private static async Task<int> Main(string[] args)`
wiring `IHostBuilder` or a minimal DI root. For **web**, create a minimal ASP.NET Core `Program.cs`
with `IHostBuilder`. Both replace the seed type file above rather than sitting alongside it.

## Step 4 — Scaffold the tests

Skip this step when `--type=test`.

Create `tests/<name>.Tests/<name>.Tests.csproj`:
```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Library</OutputType>
    <IsTestProject>true</IsTestProject>
  </PropertyGroup>
  <ItemGroup>
    <ProjectReference Include="../../src/<name>/<name>.csproj" />
    <PackageReference Include="xunit" />           <!-- version from CPM -->
    <PackageReference Include="xunit.runner.visualstudio">
      <PrivateAssets>all</PrivateAssets>
      <IncludeAssets>runtime; build; native; contentfiles; analyzers</IncludeAssets>
    </PackageReference>
    <PackageReference Include="Moq" />             <!-- version from CPM -->
    <PackageReference Include="coverlet.collector">
      <PrivateAssets>all</PrivateAssets>
      <IncludeAssets>runtime; build; native; contentfiles; analyzers</IncludeAssets>
    </PackageReference>
  </ItemGroup>
</Project>
```

If CPM is **not** active, add version attributes to all `<PackageReference>` entries, mirroring an
existing test project. Create a seed test file demonstrating conventions:
```csharp
// tests/<name>.Tests/<PrimaryType>Tests.cs
namespace <name>.Tests;

public sealed class <PrimaryType>Tests
{
    [Fact]
    public void Placeholder_Should_Pass() => Assert.True(true); // TODO: replace with a real test
}
```

## Step 5 — Add to the solution or workspace

Present what will be added before modifying the `.sln`:
```
The following projects will be added to <solution>.sln:
  src/<name>/<name>.csproj
  tests/<name>.Tests/<name>.Tests.csproj

Proceed? [y/N]
```

Wait for confirmation, then:
```bash
dotnet sln add src/<name>/<name>.csproj
dotnet sln add tests/<name>.Tests/<name>.Tests.csproj
```

## Step 6 — Build and test

```bash
dotnet restore
dotnet build src/<name>/<name>.csproj -warnaserror
dotnet test tests/<name>.Tests/<name>.Tests.csproj
```

If either fails, report the error — do not silently leave a broken project in the solution.

## Step 7 — Report

```
## Scaffold Report

Project:     src/<name>/<name>.csproj
Tests:       tests/<name>.Tests/<name>.Tests.csproj
Added to:    <solution>.sln

Files created:
  src/<name>/<name>.csproj
  src/<name>/GlobalUsings.cs
  src/<name>/<PrimaryType>.cs
  tests/<name>.Tests/<name>.Tests.csproj
  tests/<name>.Tests/<PrimaryType>Tests.cs

Standards applied:
  ✅ NRT (inherited from Directory.Build.props)
  ✅ File-scoped namespace
  ✅ CPM — no version in <PackageReference> / ⚠ CPM not active — versions pinned explicitly
  ✅ Analyzers (PrivateAssets="all" on analyzer refs)
  ✅ Coverlet collector added

Build: ✅ passed  /  ❌ <error>
Tests: ✅ passed  /  ❌ <error>
```

---

## Applied Rules

### Project Layout (.NET / C#)

## Solution Structure
Separate source and test projects into top-level folders:

```
MySolution/
  src/
    MyOrg.MyLib/          MyOrg.MyLib.csproj
    MyOrg.MyLib.Core/     MyOrg.MyLib.Core.csproj
  tests/
    MyOrg.MyLib.Tests/    MyOrg.MyLib.Tests.csproj     ← mirrors src/ naming
  docs/
  Directory.Build.props   ← shared build properties
  Directory.Packages.props ← Central Package Management (see cs-nuget)
  .editorconfig            ← analyzer control plane
  MySolution.sln
```

Mirror test project names: `Foo` → `Foo.Tests`. If you have integration tests as well, use
`Foo.IntegrationTests` (separate project, separate output assembly). Never put unit and
integration tests in the same project — their lifecycle, dependencies, and CI split differ.

## One Type Per File, File-Scoped Namespace
Each `.cs` file declares exactly one primary public type. The filename matches the type name.
Use file-scoped namespace declarations to eliminate a level of indentation (C# 10+):

```csharp
// MyOrg.MyLib/Calendar/CalendarParser.cs
namespace MyOrg.MyLib.Calendar;   // file-scoped — no trailing brace

public sealed class CalendarParser { … }
```

Folder hierarchy = namespace hierarchy:
```
src/MyOrg.MyLib/Calendar/CalendarParser.cs  →  namespace MyOrg.MyLib.Calendar
src/MyOrg.MyLib/Core/Models/TimesheetRow.cs →  namespace MyOrg.MyLib.Core.Models
```

## `Directory.Build.props` — Shared Build Properties
A root `Directory.Build.props` is automatically imported by all `.csproj` files below it. Use it
to set standards that must be uniform across the entire solution:

```xml
<Project>
  <PropertyGroup>
    <!-- Language version — use "latest" only for app projects, explicit for libraries -->
    <LangVersion>13.0</LangVersion>

    <!-- Nullable Reference Types — required for all projects -->
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>

    <!-- Treat all warnings as errors in CI; leave flexible locally -->
    <TreatWarningsAsErrors Condition="'$(CI)' == 'true'">true</TreatWarningsAsErrors>

    <!-- Enable .NET Roslyn analyzer suite -->
    <AnalysisLevel>latest-recommended</AnalysisLevel>
    <AnalysisMode>All</AnalysisMode>
    <EnforceCodeStyleInBuild>true</EnforceCodeStyleInBuild>

    <!-- Lock file for reproducible restores -->
    <RestorePackagesWithLockFile>true</RestorePackagesWithLockFile>

    <!-- NuGet audit -->
    <NuGetAudit>true</NuGetAudit>
    <NuGetAuditMode>all</NuGetAuditMode>
    <NuGetAuditLevel>moderate</NuGetAuditLevel>
  </PropertyGroup>
</Project>
```

Add conditional overrides in a `Directory.Build.targets` for properties that depend on computed values
or `$(IsTestProject)` conventions:

```xml
<!-- Directory.Build.targets -->
<Project>
  <PropertyGroup Condition="$(MSBuildProjectName.EndsWith('.Tests'))">
    <!-- Relax TreatWarningsAsErrors in test projects for rapid iteration -->
    <TreatWarningsAsErrors>false</TreatWarningsAsErrors>
  </PropertyGroup>
</Project>
```

## `.editorconfig` — Analyzer Control Plane
`.editorconfig` is the single control plane for Roslyn analyzer rule severities, code style, and
naming conventions. Place it at the solution root so it applies to all projects.

```ini
root = true

[*.cs]
# Code style
indent_style = space
indent_size = 4
end_of_line = crlf  # or lf on Linux/macOS
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true

# C# specific
csharp_style_namespace_declarations = file_scoped:warning
csharp_prefer_braces = true:warning
csharp_style_prefer_pattern_matching = true:suggestion

# Analyzer severities — promote informational to warnings, warnings to errors
dotnet_diagnostic.CA1848.severity = warning   # LoggerMessage for hot paths
dotnet_diagnostic.CA2007.severity = warning   # ConfigureAwait(false)
dotnet_diagnostic.CA1062.severity = suggestion # Validate arguments of public methods

# Naming rules
dotnet_naming_rule.private_fields_should_be_camel_case.style = camel_case_underscore_prefix
dotnet_naming_rule.private_fields_should_be_camel_case.severity = warning
```

`EnforceCodeStyleInBuild = true` in `Directory.Build.props` ensures `.editorconfig` style rules are
enforced as build warnings/errors — not just IDE hints.

## `global using` — One File, Explicit
When using `<ImplicitUsings>enable</ImplicitUsings>`, add project-specific global `using` statements
in a single file (conventionally `GlobalUsings.cs`), not scattered across files:

```csharp
// GlobalUsings.cs
global using System.Text.Json;
global using MyOrg.MyLib.Core.Models;
```

Avoid adding global `using` for namespaces used in only one or two files — that hides dependencies.

## Multi-Targeting
When a library must target multiple frameworks, use `<TargetFrameworks>` (plural) and `$(TargetFramework)`
conditionals:

```xml
<PropertyGroup>
    <TargetFrameworks>net8.0;net9.0</TargetFrameworks>
</PropertyGroup>

<ItemGroup Condition="'$(TargetFramework)' == 'net8.0'">
    <PackageReference Include="Polly" Version="8.5.2" />
</ItemGroup>
```

Minimize conditional code — prefer `#if` only when the API truly differs by TFM.

See `cs-nuget` for Central Package Management details and `cs-conventions` for file-scoped namespace
and naming conventions.
