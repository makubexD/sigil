---
id: csharp/cs-scaffold-project
kind: skill
title: "Scaffold Project (.NET / C#)"
description: "Scaffold a new .NET project with the solution's standards pre-wired — NRT, analyzers, CPM, file-scoped namespaces, correct src/tests layout — and add it to the .sln"
name: cs-scaffold-project
language: csharp
allowedTools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
argumentHint: "<name> [--type=lib|console|web|test]"
uses:
  rules:
    - csharp/cs-project-layout
    - csharp/cs-conventions
  agents:
    - csharp/cs-architecture-reviewer
tags:
  - csharp
  - scaffold
  - project
---

## When to Use

Use when adding a new project to an existing .NET solution. Pass the project name and optional type. Never overwrites existing files; confirms before editing the .sln.

---

# Scaffold Project

**Project name + type:** $ARGUMENTS

Parse `$ARGUMENTS`:
- First token → `<name>` (e.g. `MyOrg.MyLib.Reporting`)
- `--type=<lib|console|web|test>` (default: `lib`)

## Step 1 — Discover repo standards

Read the following to understand what "standards pre-wired" means for this solution:
- `Directory.Build.props` — TFM, `<Nullable>`, `<LangVersion>`, `<ImplicitUsings>`, analyzer settings.
- `Directory.Packages.props` — CPM-managed package versions in use.
- `.editorconfig` — code style and analyzer severities.
- `CLAUDE.md` — documented architecture layers and naming conventions.
- An existing similar project's `.csproj` as a reference.

If none of these exist, prompt the user for the target TFM and whether CPM is in use before proceeding.

## Step 2 — Determine placement

Based on `--type`:
- `lib` → `src/<name>/<name>.csproj` + matching `tests/<name>.Tests/<name>.Tests.csproj`
- `console` → `src/<name>/<name>.csproj` (output type EXE) + `tests/<name>.Tests/<name>.Tests.csproj`
- `web` → `src/<name>/<name>.csproj` (ASP.NET Core) + `tests/<name>.Tests/<name>.Tests.csproj`
- `test` → `tests/<name>/<name>.csproj` only (no paired source project)

Do not overwrite any existing file. If the target path already exists, **stop and report**.

## Step 3 — Scaffold the source project

Create `src/<name>/<name>.csproj` inheriting shared properties from `Directory.Build.props`:

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <!-- TFM, Nullable, LangVersion, TreatWarningsAsErrors — all inherited from Directory.Build.props -->
    <OutputType>Library</OutputType>  <!-- Exe for console/web -->
    <RootNamespace><name></RootNamespace>
    <AssemblyName><name></AssemblyName>
    <!-- Uncomment for library packages: -->
    <!-- <GenerateDocumentationFile>true</GenerateDocumentationFile> -->
  </PropertyGroup>
</Project>
```

Create a seed file `src/<name>/GlobalUsings.cs`:
```csharp
// Global using directives for <name>.
// Add project-wide usings here; keep this file minimal.
global using System;
global using System.Collections.Generic;
```

Create a seed type file demonstrating the project's conventions (file-scoped namespace, NRT, XML docs):
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

For **console** type, create `Program.cs` with `async Task Main`:
```csharp
namespace <name>;

internal static class Program
{
    private static async Task<int> Main(string[] args)
    {
        // TODO: wire IHostBuilder or a minimal DI root here
        await Task.CompletedTask;
        return 0;
    }
}
```

For **web** type, create a minimal ASP.NET Core `Program.cs` with `IHostBuilder`.

## Step 4 — Scaffold the test project (unless `--type=test`)

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

If CPM is **not** active, add version attributes to all `<PackageReference>` entries from the
existing test projects as a reference.

Create a seed test file demonstrating conventions:
```csharp
// tests/<name>.Tests/<PrimaryType>Tests.cs
namespace <name>.Tests;

public sealed class <PrimaryType>Tests
{
    [Fact]
    public void Placeholder_Should_Pass()
    {
        // Arrange — TODO: replace with real test data

        // Act

        // Assert
        Assert.True(true);
    }
}
```

## Step 5 — Add to solution

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
