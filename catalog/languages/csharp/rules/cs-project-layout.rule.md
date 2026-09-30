---
id: csharp/cs-project-layout
kind: rule
title: Project Layout (.NET / C#)
description: Solution/project structure, Directory.Build.props, .editorconfig as analyzer control plane
language: csharp
appliesTo:
  - "**/*.csproj"
  - "**/*.props"
  - "**/*.targets"
  - "**/.editorconfig"
  - "**/*.sln"
severity: recommended
extends: []
tags:
  - csharp
  - project
  - layout
---

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
