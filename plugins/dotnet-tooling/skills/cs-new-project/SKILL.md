---
name: cs-new-project
description: "Create a new .NET solution in an empty directory — sln, a console/webapi/classlib project, src/tests layout, xUnit tests, Directory.Build.props, .editorconfig, global.json; use cs-scaffold-project when a solution already exists (.NET / C#)"
when_to_use: "Use when starting a brand-new .NET solution in an empty directory. Fires for \"create a new .NET solution\", \"start a new C# project from scratch\", or \"set up a webapi called X\". Not for adding a project to an existing solution — when a .sln or .slnx is already present, use `cs-scaffold-project` instead."
allowed-tools: Read, Write, Bash, Glob
argument-hint: "<SolutionName> [--type=console|webapi|classlib]"
---

# New Project

**Solution name and type:** $ARGUMENTS

## Step 1 — Confirm the target directory is empty

If the target directory already contains a `*.sln`, `*.slnx`, `*.csproj`, or `.git/`, stop. A
solution that exists means `cs-scaffold-project` is the right skill; anything else, ask before
overwriting. Default `--type` to `console` when none is given.

## Step 2 — Create the project structure

```bash
dotnet new sln -n <SolutionName>
dotnet new <type> -n <SolutionName> -o src/<SolutionName>
dotnet new xunit -n <SolutionName>.Tests -o tests/<SolutionName>.Tests
dotnet add tests/<SolutionName>.Tests reference src/<SolutionName>
dotnet sln add src/<SolutionName> tests/<SolutionName>.Tests
dotnet new gitignore
```

Resulting layout, per `cs-project-layout`: `<SolutionName>.sln` (or `.slnx` on newer SDKs),
`src/<SolutionName>/`, `tests/<SolutionName>.Tests/`, with the shared files below at the root.

## Step 3 — Configure tooling

### `global.json` — pin the SDK

Run `dotnet new globaljson --sdk-version <ver> --roll-forward latestFeature` with the version
`dotnet --version` reports.

### `Directory.Build.props`

```xml
<Project>
  <PropertyGroup>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
    <LangVersion>latest</LangVersion>
    <TreatWarningsAsErrors>true</TreatWarningsAsErrors>
    <EnforceCodeStyleInBuild>true</EnforceCodeStyleInBuild>
    <AnalysisLevel>latest-recommended</AnalysisLevel>
  </PropertyGroup>
</Project>
```

Remove the now-duplicated `Nullable` / `ImplicitUsings` lines from each generated `.csproj`.

### `.editorconfig` and packages

Run `dotnet new editorconfig`, then set `csharp_style_namespace_declarations = file_scoped:warning`
per `cs-project-layout`. Enable Central Package Management per `cs-nuget`: add
`Directory.Packages.props` with `ManagePackageVersionsCentrally`, move each `PackageReference`
version into it.

## Step 4 — Write a starter test and README

Replace the generated `UnitTest1.cs` with a smoke test:

```csharp
// tests/<SolutionName>.Tests/SmokeTests.cs — confirms the test project builds and runs; replace once real behavior exists
namespace <SolutionName>.Tests;

public sealed class SmokeTests
{
    [Fact]
    public void Solution_Builds_And_Tests_Run() => Assert.True(true);
}
```

Write a minimal `README.md`: solution name, one-sentence description, the SDK from `global.json`,
how to build (`dotnet build`), and how to test (`dotnet test`).

## Step 5 — Verify

```bash
dotnet build && dotnet test
```

Both must pass with zero warnings — `TreatWarningsAsErrors` makes any generated-template warning
a failure to fix now.

## Step 6 — Report

```
## New Project Report

Solution: <SolutionName>
Type: <console|webapi|classlib>, SDK <version>

### Created
- <SolutionName>.sln, global.json, Directory.Build.props, Directory.Packages.props, .editorconfig, .gitignore
- src/<SolutionName>/, tests/<SolutionName>.Tests/ (xUnit)
- SmokeTests.cs, README.md

### Verification
✅ dotnet build (0 warnings) and dotnet test pass on the new solution
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
