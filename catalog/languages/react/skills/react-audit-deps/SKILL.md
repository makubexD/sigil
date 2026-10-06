---
id: react/react-audit-deps
kind: skill
title: "Audit Dependencies (React)"
description: "Audit npm dependencies for a React project — known CVEs (npm audit), outdated versions, unused packages, bundle-size outliers, and license compliance"
name: react-audit-deps
language: react
allowedTools:
  - Read
  - Bash
  - Glob
  - Grep
argumentHint: "(no arguments)"
uses:
  rules:
    - react/react-dependencies
    - react/react-npm
    - react/react-security
  agents:
    - react/react-security-auditor
tags:
  - react
  - audit
  - dependencies
  - security
skillContext: fork
whenToUse: "Use to check for known CVEs, outdated packages, and bundle-size outliers in a React project's npm dependencies. Fires for \"are there any known CVEs\", \"audit dependencies\", \"check for vulnerable packages\", or before a release."
---

# Audit Dependencies

Read-only audit — reports findings, does not modify `package.json` or the lock file.

## Step 1 — Discover dependency manifest

Locate `package.json`. List `dependencies` (ship to the client bundle unless server-only) and
`devDependencies` separately.

## Step 2 — Run available tooling

### CVE scan

```bash
npm audit --omit=dev 2>&1     # production tree — what actually reaches users
npm audit 2>&1                 # full tree including dev tooling
```

### Outdated packages

```bash
npm outdated 2>&1
```
Flag packages more than 2 major versions behind, or with no release in 18+ months (cross-check via
`npm view <package> time.modified`).

### Unused dependencies

```bash
npx depcheck 2>&1
```
If unavailable, cross-reference manually: for each dependency in `package.json`, `grep -rn
"from ['\"]<pkg>" src/` and flag any with zero matches.

## Step 3 — Manual review

### Bundle-size outliers

For each dependency shipped to the client (not build-only tooling), check its size on
[bundlephobia.com](https://bundlephobia.com). Flag any dependency whose size is disproportionate to
the functionality actually used from it (e.g. importing one function from a large monolithic
utility library — see `react-dependencies`'s tree-shaking guidance).

### License compliance

For each direct dependency, check its declared license (`npm view <package> license`). Flag any
GPL/AGPL-licensed dependency for review if the project is proprietary/commercial, and flag any
dependency with no declared license at all.

## Step 4 — Report

```
## Dependency Audit Report

### CVEs / Security vulnerabilities
<npm audit output summary, grouped by severity>

### Outdated packages
- `<package>` — installed <version>, latest <version> [<N> major versions behind / stale since <date>]

### Unused dependencies
- `<package>` — declared but no import found

### Bundle-size outliers
- `<package>` — <size> gzipped, flagged because <reason>

### License compliance
- `<package>` — <license>, flagged because <reason>

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

Omit sections and tiers with no findings.
