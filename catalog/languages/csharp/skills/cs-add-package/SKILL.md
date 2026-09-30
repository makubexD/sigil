---
id: csharp/cs-add-package
kind: skill
title: "Add Package (.NET / C#)"
description: "Vet and wire a NuGet package through Central Package Management — checks CVEs, maintenance, transitive footprint, and license before adding"
name: cs-add-package
language: csharp
allowedTools:
  - Read
  - Bash
  - Glob
  - Grep
  - Edit
argumentHint: "<package-id> [version] [--dev]"
uses:
  rules:
    - csharp/cs-dependencies
    - csharp/cs-nuget
  agents: []
tags:
  - csharp
  - add
  - package
  - nuget
---

## When to Use

Use any time you need to add a new NuGet dependency. Pass the package ID; optionally pin a version and add --dev for analyzer/test-only packages (PrivateAssets="all"). Confirms before adding if vetting flags risk.

---

# Add Package

**Package:** $ARGUMENTS

Parse `$ARGUMENTS`:
- First token → `<package-id>`
- If a second token looks like a version (e.g. `4.2.0`, `^4.0`) → `<version>`; else auto-discover
- If `--dev` is present → treat as analyzer/build-only package (`PrivateAssets="all"`)

## Step 1 — Discover repo layout

- Locate the solution root: `.sln` or `Directory.Build.props`.
- Determine if **Central Package Management** is active:
  ```bash
  grep -l "ManagePackageVersionsCentrally" . --include="*.props" -r
  ```
- Identify the target project(s) to add the `<PackageReference>` to (from delegation context or ask
  the user if ambiguous).
- Check whether the package is already referenced:
  ```bash
  grep -r "<PackageReference Include=\"<package-id>\"" . --include="*.csproj" --include="*.props"
  ```
  If found, report the existing version and ask whether to update instead of add.

## Step 2 — Vet the package

**CVE check:**
```bash
# Add temporarily to check (or use nuget.org API)
dotnet list package --vulnerable --include-transitive 2>&1
```

Check https://www.nuget.org/packages/<package-id> for:
1. **Maintenance status** — last release date, download trend, GitHub issues. Flag if last release > 18 months ago.
2. **License** — MIT/Apache/BSD are typically acceptable; GPL/AGPL require review for commercial projects. Flag non-permissive licenses.
3. **Transitive footprint** — does it add many transitive dependencies? Run:
   ```bash
   dotnet add <project.csproj> package <package-id> --dry-run 2>&1 || true
   ```
4. **BCL alternative** — can `System.*` or `Microsoft.Extensions.*` already cover this need?
   If yes, recommend the BCL alternative and stop.
5. **Source** — is it published on `nuget.org` (or your org's trusted feed)? Is it author-signed?

**If vetting flags a risk:** present the finding and ask for explicit confirmation before proceeding.

## Step 3 — Determine version

**If `<version>` was provided:** use it exactly.

**If not provided:**
- Fetch the latest stable version from `dotnet list package --outdated` or nuget.org.
- Prefer the latest stable; avoid pre-release unless the user explicitly requests it.

## Step 4 — Add through Central Package Management

**If CPM is active** (preferred):

Add the version pin to `Directory.Packages.props`:
```xml
<!-- Directory.Packages.props -->
<ItemGroup>
    <PackageVersion Include="<package-id>" Version="<version>" />
</ItemGroup>
```

Add a **versionless** `<PackageReference>` to the target `.csproj`:
```xml
<PackageReference Include="<package-id>" />
```

For `--dev` (analyzer/build-only):
```xml
<PackageReference Include="<package-id>">
    <PrivateAssets>all</PrivateAssets>
    <IncludeAssets>runtime; build; native; contentfiles; analyzers</IncludeAssets>
</PackageReference>
```

**If CPM is not active:** add a pinned `<PackageReference Include="<package-id>" Version="<version>" />` directly to the target `.csproj` and recommend enabling CPM (see `cs-nuget`).

## Step 5 — Restore and refresh lock file

```bash
dotnet restore
```

If a `packages.lock.json` exists, verify it was updated:
```bash
git diff packages.lock.json
```

## Step 6 — Run the quality gate

```bash
dotnet build -warnaserror --no-restore
dotnet test --no-build --no-restore
```

If the gate fails, **undo the addition** (restore the original `Directory.Packages.props` and `.csproj`
content) and report the failure.

## Step 7 — Report

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
- BCL alternative: <none / ⚠ BCL can replace — recommendation>

### Gate
✅ build passed, tests passed  /  ❌ <failure detail>

### Next steps
<Any recommended follow-up: enable CPM, add source mapping, etc.>
```
