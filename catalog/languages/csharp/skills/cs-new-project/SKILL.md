---
id: csharp/cs-new-project
kind: skill
title: "New Project (.NET / C#)"
description: "Create a new .NET solution in an empty directory — sln, a console/webapi/classlib project, src/tests layout, xUnit tests, Directory.Build.props, .editorconfig, global.json; use cs-scaffold-project when a solution already exists (.NET / C#)"
name: cs-new-project
language: csharp
allowedTools:
  - Read
  - Write
  - Bash
  - Glob
argumentHint: "<SolutionName> [--type=console|webapi|classlib]"
uses:
  rules:
    - csharp/cs-project-layout
  agents: []
tags:
  - csharp
  - scaffold
  - new-project
whenToUse: "Use when starting a brand-new .NET solution in an empty directory. Fires for \"create a new .NET solution\", \"start a new C# project from scratch\", or \"set up a webapi called X\". Not for adding a project to an existing solution — when a .sln or .slnx is already present, use `cs-scaffold-project` instead."
---

# New Project

**Solution name and type:** {sigil:arguments}

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
