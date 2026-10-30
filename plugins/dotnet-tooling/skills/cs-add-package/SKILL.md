---
name: cs-add-package
description: "Vet and wire a NuGet package through Central Package Management — checks CVEs, maintenance, transitive footprint, and license before adding (.NET / C#)"
when_to_use: "Use any time you need to add a new NuGet dependency. Pass the package ID; optionally pin a version and add --dev for analyzer/test-only packages (PrivateAssets=\"all\"). Confirms before adding if vetting flags risk."
allowed-tools: Read, Bash, Glob, Grep, Edit
argument-hint: "<package-id> [version] [--dev]"
---

# Add Package

**Package:** $ARGUMENTS

Parse `$ARGUMENTS`:
- First token → `<package-id>`
- If a second token looks like a version (e.g. `4.2.0`, `^4.0`) → `<version>`; else auto-discover
- If `--dev` is present → treat as analyzer/build-only package (`PrivateAssets="all"`)

## Step 1 — Discover repo layout

Locate the solution root (`.sln`/`Directory.Build.props`), determine if **Central Package
Management** is active (`grep -l "ManagePackageVersionsCentrally" . --include="*.props" -r`),
identify the target project(s) (from delegation context or ask if ambiguous), and check whether the
package is already referenced (`grep -r "<PackageReference Include=\"<package-id>\"" . --include="*.csproj" --include="*.props"`) —
if found, report the existing version and ask whether to update instead of add.

## Step 2 — Vet the package

**CVE check:**
```bash
# Add temporarily to check (or use nuget.org API)
dotnet list package --vulnerable --include-transitive 2>&1
```

Check https://www.nuget.org/packages/<package-id> for: **maintenance status** (last release date,
download trend, open issues — flag if last release > 18 months ago); **license** (MIT/Apache/BSD
typically fine, GPL/AGPL needs review for commercial projects); **transitive footprint** (`dotnet
add <project.csproj> package <package-id> --dry-run 2>&1 || true` previews what else gets added);
**BCL alternative** (can `System.*`/`Microsoft.Extensions.*` already cover this? If yes, recommend
it and stop); **source** (published on `nuget.org`/the org's trusted feed, author-signed?).

**If vetting flags a risk:** present the finding and ask for explicit confirmation before proceeding.

## Step 3 — Determine version

**If `<version>` was provided:** use it exactly.

**If not provided:**
- Fetch the latest stable version from `dotnet list package --outdated` or nuget.org.
- Prefer the latest stable; avoid pre-release unless the user explicitly requests it.

## Step 4 — Add the package

### Central Package Management

**If CPM is active** (preferred): add the version pin to `Directory.Packages.props`
(`<PackageVersion Include="<package-id>" Version="<version>" />` inside `<ItemGroup>`), then add a
**versionless** `<PackageReference Include="<package-id>" />` to the target `.csproj`. For `--dev`
(analyzer/build-only), add `<PrivateAssets>all</PrivateAssets>` and `<IncludeAssets>runtime; build;
native; contentfiles; analyzers</IncludeAssets>` as children of that `<PackageReference>`.

**If CPM is not active:** add a pinned `<PackageReference Include="<package-id>" Version="<version>" />` directly to the target `.csproj` and recommend enabling CPM (see `cs-nuget`).

## Step 5 — Verify the install

### Lock file

`dotnet restore`, then if `packages.lock.json` exists, verify it was updated (`git diff
packages.lock.json`).

### Quality gate

```bash
dotnet build -warnaserror --no-restore
dotnet test --no-build --no-restore
```

If the gate fails, **undo the addition** (restore the original `Directory.Packages.props` and `.csproj`
content) and report the failure.

## Step 6 — Report

```
## Add Package Report

Package: <package-id> v<version>
Target project(s): <list>
CPM: <added to Directory.Packages.props / added directly to .csproj>
Dev-only (PrivateAssets): <yes / no>

### Vetting
- CVEs: <none detected / ⚠ flagged — detail>
- License: <MIT / Apache-2.0 / ⚠ flagged — detail>
- Maintenance: <active / ⚠ last release: <date>>
- Transitive additions: <N new packages>
- Built-in alternative: <none / ⚠ BCL can replace — recommendation>

### Gate
✅ build passed, tests passed  /  ❌ <failure detail>

### Next steps
<Any recommended follow-up: enable CPM, add source mapping, etc.>
```

---

## Applied Rules

### Dependencies (.NET / C#)

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
