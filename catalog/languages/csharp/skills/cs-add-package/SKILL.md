---
id: csharp/cs-add-package
kind: skill
title: "Add Package (.NET / C#)"
description: "Vet and wire a NuGet package through Central Package Management — checks CVEs, maintenance, transitive footprint, and license before adding (.NET / C#)"
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
whenToUse: "Use any time you need to add a new NuGet dependency. Pass the package ID; optionally pin a version and add --dev for analyzer/test-only packages (PrivateAssets=\"all\"). Confirms before adding if vetting flags risk."
---

# Add Package

**Package:** {sigil:arguments}

Parse `{sigil:arguments}`:
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
