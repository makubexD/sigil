---
id: typescript/ts-audit-deps
kind: skill
title: "Audit Dependencies (TypeScript)"
description: "Audit npm dependencies — known CVEs, outdated versions, deprecated packages, unused references, and license compliance"
name: ts-audit-deps
language: typescript
appliesTo:
  - "**/*"
allowedTools:
  - Read
  - Bash
  - Glob
  - Grep
argumentHint: "(no arguments)"
uses:
  rules:
    - typescript/ts-dependencies
    - typescript/ts-security
  agents:
    - typescript/ts-security-auditor
tags:
  - typescript
  - audit
  - dependencies
  - security
---

## When to Use

Use before releases, when adding new dependencies, or periodically as a maintenance check. Produces a read-only report; no dependency changes are made. Complements ts-security-auditor (which handles code-level vulnerabilities).

---

# Audit Dependencies

This skill produces a **read-only npm dependency health report** — it makes no changes. To act on
findings, use `/ts-add-package` to add or update a package, or remove unused deps from `package.json`
manually and run `npm install`.

## Step 1 — Discover dependency manifest

Identify all dependency sources:
- `package.json` — direct `dependencies`, `devDependencies`, `peerDependencies`, `optionalDependencies`.
- `package-lock.json` — resolved transitive graph (if present).
- Workspaces: if `package.json` declares `workspaces`, collect `package.json` from each workspace
  member and report per-workspace counts.

Summarize:
- Total direct runtime dependencies (name + version).
- Total direct dev/test dependencies.
- Total transitive dependency count (from lock file if available).
- Node.js version constraint from `"engines"`.

## Step 2 — Run available tooling

Run all available commands; skip gracefully if not installed:

```bash
# CVE / vulnerability scan (built into npm)
npm audit --omit=dev 2>&1
npm audit 2>&1

# Outdated versions
npm outdated 2>&1

# Unused dependencies (if depcheck is installed)
npx depcheck 2>&1 || echo "depcheck not installed"

# Unused / stale exports (if knip is installed)
npx knip 2>&1 || echo "knip not installed"

# License compliance (if license-checker is installed)
npx license-checker --summary 2>&1 || echo "license-checker not installed"
```

Include all output verbatim in the "Tooling" section.

## Step 3 — Manual review

For each direct runtime dependency not already flagged by tooling:

1. **Version constraint health:** is it pinned exactly in `package-lock.json`? Is the lock file
   committed? Are `overrides` used for any transitive pin?
2. **Maintenance status:** when was the last release? Are critical issues open and unaddressed?
   Is the package archived or deprecated on npm?
3. **Transitive footprint:** does it pull in a large transitive graph for a narrow use case?
   Could a Node.js built-in replace it?
4. **Types availability:** does the package bundle `.d.ts` declarations, or does a `@types/*`
   package exist? Missing types require `any` casts or ambient declarations — flag as a risk.
5. **ESM / CJS compatibility:** does the package's `exports` map support the project's module
   system? A CJS-only package in an ESM project requires dynamic `import()` or an adapter.
6. **Security history:** known CVEs in the past 12 months (check npm advisory database or NVD).

## Step 4 — Output report

```
## npm Dependency Audit Report

Manifest: package.json  <workspace member list if applicable>
Node.js version: <from engines or .nvmrc>
Direct runtime deps: <N>
Direct dev/test deps: <N>
Transitive deps: <N from lock file>  /  "lock file not present"
Lock file: <committed / missing>

### CVEs / Security vulnerabilities
<npm audit output, or "no vulnerabilities detected">

### Outdated packages
<npm outdated output, or "all up to date">

### Unused dependencies
<depcheck / knip output, or "tool not installed — manual review needed">

### License compliance
<license-checker summary, or "tool not installed — manual review needed">

### Manual findings

#### High
- `<package>@<version>` — <issue>. **Recommendation:** <action>.

#### Medium
- …

#### Low
- …

### Summary
<N> high issues requiring immediate action.
<N> medium issues recommended before next release.
<N> low / informational notes.
```

Omit tiers with no findings.
