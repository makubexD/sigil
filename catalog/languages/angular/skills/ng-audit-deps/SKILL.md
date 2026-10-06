---
id: angular/ng-audit-deps
kind: skill
title: "Audit Dependencies (Angular)"
description: "Audit project dependencies — outdated versions, known CVEs, unused packages, Angular lockstep, and license compliance"
name: ng-audit-deps
language: angular
allowedTools:
  - Read
  - Bash
  - Glob
  - Grep
argumentHint: "(no arguments)"
uses:
  rules:
    - angular/ng-dependencies
    - angular/ng-security
  agents:
    - angular/ng-security-auditor
tags:
  - angular
  - audit
  - dependencies
  - security
whenToUse: "Run via `/ng-audit-deps` before a release or as a periodic maintenance check — e.g. \"audit my dependencies\", \"are any packages out of date or vulnerable\". Produces a read-only report covering CVEs, outdated versions, Angular lockstep, and license compliance; makes no changes."
---

# Audit Dependencies

This skill produces a **read-only dependency health report** — it makes no changes.
To update or remove dependencies, act on the report's recommendations manually (or use `/ng-add-package`).

## Step 1 — Discover dependency manifest

Read `package.json` and note:
- Direct runtime dependencies (`dependencies`) — name + declared version range.
- Dev/test dependencies (`devDependencies`).
- For a library, `peerDependencies` (especially `@angular/*`).
- The Angular major version and the Node/engines constraint.

Confirm a committed lock file exists (`package-lock.json`); note if it is missing.

## Step 2 — Run available tooling

Run all available tools; skip gracefully if not installed:

```bash
# CVE / vulnerability scan
npm audit 2>&1 || echo "npm audit unavailable"
npx osv-scanner --lockfile=package-lock.json 2>&1 || echo "osv-scanner not installed"

# Outdated versions
npm outdated 2>&1 || true

# Unused / missing dependencies
npx depcheck 2>&1 || echo "depcheck not installed"
npx knip 2>&1 || echo "knip not installed"

# License compliance
npx license-checker --summary 2>&1 || echo "license-checker not installed"
```

## Step 3 — Manual review

For each direct runtime dependency the tools did not cover:

1. **Version range health:** pinned tightly enough to be reproducible, but not so tight it blocks security patches?
2. **Angular lockstep:** are `@angular/*` (and CDK/Material) on the same major? Is any Angular-aware dependency's peer range incompatible with the project's Angular major? Flag mismatches — they should be resolved via `ng update`.
3. **Maintenance status:** recent release? Critical issues open and unaddressed?
4. **Transitive footprint / bundle impact:** large tree or bundle cost for a narrow use; could a platform/Angular built-in replace it (see `ng-dependencies`)?
5. **Types & ESM:** ships types and is ESM-compatible with the Angular build?
6. **Security history:** CVEs in the past 12 months?

## Step 4 — Report

```
## Dependency Audit Report
Manifest: package.json
Angular: <major>   Node engines: <range>
Direct runtime deps: <N>   Dev deps: <N>   Peer deps: <N>
Lock file: <present / MISSING>

### CVEs / Security vulnerabilities
<npm audit / osv-scanner output, or "no vulnerabilities detected" / "tooling not installed">

### Outdated packages
<npm outdated output, or "all up to date">

### Angular lockstep
<@angular/* + CDK/Material version alignment; any incompatible peer ranges>

### Unused dependencies
<depcheck / knip output, or "not installed — manual review needed">

### License compliance
<license-checker summary, or "not installed">

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
