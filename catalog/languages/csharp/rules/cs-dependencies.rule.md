---
id: csharp/cs-dependencies
kind: rule
title: Dependencies (.NET / C#)
description: C# dependency management — vetting, runtime vs dev separation, lock files, removing unused
language: csharp
appliesTo:
  - "**/*.csproj"
  - "**/Directory.Packages.props"
tags:
  - csharp
  - dependencies
---

## Prefer the BCL Before Adding a NuGet Package
Before adding a dependency, check whether the BCL (`System.*`, `Microsoft.Extensions.*`)
already covers the need: `System.Text.Json`, `System.IO`, `System.Net.Http.HttpClient`,
`Microsoft.Extensions.Logging`, `Microsoft.Extensions.Options`, `System.Security.Cryptography`,
`System.Text.RegularExpressions` with source-generated `[GeneratedRegex]`. A dependency adds
supply-chain risk; the BCL adds nothing.

## Pin All Versions
Every `<PackageReference>` must carry an **exact** pinned version — no floating specifiers (`1.2.*`,
`[1.2,)`, `*`). Pin in either the individual `.csproj` or (preferred) `Directory.Packages.props`
for Central Package Management.

Commit the **lock file** (`packages.lock.json`) to version control. Enable it:
```xml
<!-- Directory.Build.props or each .csproj -->
<PropertyGroup>
    <RestorePackagesWithLockFile>true</RestorePackagesWithLockFile>
</PropertyGroup>
```

Run CI restore with `--locked-mode` to fail fast on lock-file drift:
```bash
dotnet restore --locked-mode
```

See `cs-nuget` for the full mechanics of Central Package Management, source mapping, and lock files.

## Separate Runtime from Dev / Analyzer Dependencies
Runtime packages go in `<PackageReference>` without attribute qualifiers.
Development-only tools (analyzers, test frameworks, coverage collectors, code-gen) go with
`PrivateAssets="all"` and optionally `IncludeAssets="runtime;build;native;contentfiles;analyzers"`:

```xml
<!-- Analyzer / dev-only — never shipped to consumers -->
<PackageReference Include="StyleCop.Analyzers" Version="1.2.0-beta.556">
    <PrivateAssets>all</PrivateAssets>
    <IncludeAssets>runtime; build; native; contentfiles; analyzers</IncludeAssets>
</PackageReference>

<!-- Test projects get test-framework deps at the project level only -->
<PackageReference Include="xunit" Version="2.9.3" />
<PackageReference Include="Moq" Version="4.20.72" />
```

Never install dev tools (test runners, analyzers, profilers) into production images or ship them
in NuGet packages consumed by downstream projects (`<DevelopmentDependency>true</DevelopmentDependency>`
in a library's `nuspec`/`csproj` prevents transitive spread).

## Vet Before Adding
When adding a new dependency:
1. Confirm it is actively maintained (recent release, issues addressed, not archived).
2. Check for known CVEs: `dotnet list package --vulnerable --include-transitive`.
3. Review its transitive dependency footprint: `dotnet list package --include-transitive`.
4. Confirm it is distributed via `nuget.org` (or your org's trusted feed) and is signed.
5. Check the license is compatible with the project.

See `/cs-add-package` skill for an automated vet-and-wire workflow.

## Remove Unused Dependencies
Unused `<PackageReference>` entries are dead weight and a supply-chain risk. Periodically audit
with `dotnet list package` cross-referenced against `using` directives, or use
[ReferenceTrimmer](https://github.com/Dropbox/ReferenceTrimmer). If a package is referenced in
only one place and that code is deleted, remove the `<PackageReference>` from the `.csproj`
and re-run `dotnet restore` to refresh the lock file.

## Dependency Updates
Keep dependencies reasonably current — unmaintained versions accumulate CVEs. Prefer automated
update PRs (Dependabot or Renovate) that run the full test suite before merging. Never merge a
dependency update without running the quality gate (`dotnet build -warnaserror && dotnet test`) first.

Enable `<NuGetAudit>true</NuGetAudit>` in `Directory.Build.props` so `dotnet restore` warns on
packages with known vulnerabilities:
```xml
<PropertyGroup>
    <NuGetAudit>true</NuGetAudit>
    <NuGetAuditMode>all</NuGetAuditMode>       <!-- audit transitive deps too -->
    <NuGetAuditLevel>moderate</NuGetAuditLevel> <!-- fail on Moderate+  -->
</PropertyGroup>
```
