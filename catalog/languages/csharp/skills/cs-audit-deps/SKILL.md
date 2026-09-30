---
id: csharp/cs-audit-deps
kind: skill
title: "Audit NuGet Dependencies (.NET / C#)"
description: "Audit NuGet dependencies — known CVEs, outdated versions, deprecated packages, unused references, and license compliance"
name: cs-audit-deps
language: csharp
allowedTools:
  - Read
  - Bash
  - Glob
  - Grep
argumentHint: "(no arguments)"
uses:
  rules:
    - csharp/cs-dependencies
    - csharp/cs-security
  agents:
    - csharp/cs-security-auditor
tags:
  - csharp
  - audit
  - dependencies
  - security
---

## When to Use

Use before releases, when adding new dependencies, or periodically as a maintenance check. Produces a read-only report; no dependency changes are made. Complements cs-security-auditor (which handles code-level vulnerabilities).

---

# Audit NuGet Dependencies

This skill produces a **read-only NuGet health report** — it makes no changes.
To update or remove dependencies, act on the report's recommendations manually or via `/cs-add-package`.

## Step 1 — Discover dependency manifest

Identify all `<PackageReference>` sources:
- `Directory.Packages.props` — Central Package Management version pins (preferred for multi-project solutions).
- Each `.csproj` in `src/` and `tests/` for direct references.
- `packages.lock.json` — lock file with resolved transitive graph (if present).

Read and summarize:
- Total direct runtime dependencies (name + version).
- Total direct dev/test dependencies (`PrivateAssets="all"` or in test projects).
- Total transitive dependency count (from lock file if available).
- Python version → **TFM** (Target Framework Moniker) and .NET SDK version.

## Step 2 — Run available tooling

Run all available commands; skip gracefully if not installed:

```bash
# CVE / vulnerability scan (built into .NET SDK 8+)
dotnet list package --vulnerable --include-transitive 2>&1

# Deprecated packages
dotnet list package --deprecated 2>&1

# Outdated versions
dotnet list package --outdated 2>&1

# License compliance (if dotnet-project-licenses is installed)
dotnet-project-licenses --input . --json 2>&1 || echo "dotnet-project-licenses not installed"

# Unused references (if ReferenceTrimmer or similar is available)
dotnet build --no-incremental 2>&1 | grep -i "unused\|unreferenced" || echo "unused-reference analysis not available"
```

Include all output verbatim in the report's "Tooling" section.

## Step 3 — Manual review

For each direct runtime dependency not already flagged by the tooling:

1. **Version constraint health:** is it pinned exactly (no floating `*` or `1.2.*`)? Is CPM in use?
   Is the lock file present and committed?
2. **Maintenance status:** when was the last release? Are critical issues open and unaddressed?
   Is the project archived or deprecated?
3. **Transitive footprint:** does it pull in a large transitive graph for a narrow use case?
   Could the BCL (`System.Text.Json`, `System.Net.Http`, etc.) replace it?
4. **Security history:** has it had CVEs in the past 12 months (check NVD / GitHub Advisory DB)?
5. **NuGet source mapping:** is `nuget.config` using package source mapping to prevent dependency
   confusion? Flag absence as Medium finding.

## Step 4 — Output report

```
## NuGet Dependency Audit Report
Manifest: <Directory.Packages.props / .csproj list>
TFM: <target framework(s)>
Direct runtime deps: <N>
Direct dev/test deps: <N>
Transitive deps: <N> (from lock file) / "lock file not present"
Central Package Management: <enabled / not configured>
Lock file: <present and committed / missing>
Source mapping: <configured / not configured>

### CVEs / Security vulnerabilities
<dotnet list package --vulnerable output, or "no vulnerabilities detected">

### Deprecated packages
<dotnet list package --deprecated output, or "none detected">

### Outdated packages
<dotnet list package --outdated output, or "all up to date">

### License compliance
<dotnet-project-licenses output, or "tool not installed — manual review needed">

### Manual findings

#### High
- `<package>` — <issue>. **Recommendation:** <action>.

#### Medium
...

#### Low
...

### Summary
<N> critical/high issues requiring immediate action.
<N> medium issues recommended before next release.
<N> low/informational notes.
```

Omit tiers with no findings.
