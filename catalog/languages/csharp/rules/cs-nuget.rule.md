---
id: csharp/cs-nuget
kind: rule
title: Nuget (.NET / C#)
description: "NuGet hygiene — Central Package Management, lock files, source mapping, signing, SourceLink (.NET / C#)"
language: csharp
appliesTo:
  - "**/*.csproj"
  - "**/*.props"
  - "**/nuget.config"
tags:
  - csharp
  - nuget
appliesToRationale: Scoped to project, MSBuild props, and nuget.config files because NuGet hygiene — CPM, lock files, source mapping, signing — is entirely a package-management concern with no equivalent in .cs source.
---

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
