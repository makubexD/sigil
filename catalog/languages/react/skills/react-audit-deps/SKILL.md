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
  agents: []
tags:
  - react
  - audit
  - dependencies
  - security
whenToUse: "Use to check for known CVEs, outdated packages, and bundle-size outliers in a React project's npm dependencies. Fires for \"are there any known CVEs\", \"audit dependencies\", \"check for vulnerable packages\", or before a release."
---

# Audit Dependencies

Read-only audit — reports findings, does not modify `package.json` or the lock file.

## Step 1 — Discover the dependency set

Locate `package.json`. List `dependencies` (ship to the client bundle unless server-only) and
`devDependencies` separately.

## Step 2 — CVE scan

```bash
npm audit --omit=dev 2>&1     # production tree — what actually reaches users
npm audit 2>&1                 # full tree including dev tooling
```

## Step 3 — Outdated packages

```bash
npm outdated 2>&1
```
Flag packages more than 2 major versions behind, or with no release in 18+ months (cross-check via
`npm view <package> time.modified`).

## Step 4 — Unused dependencies

```bash
npx depcheck 2>&1
```
If unavailable, cross-reference manually: for each dependency in `package.json`, `grep -rn
"from ['\"]<pkg>" src/` and flag any with zero matches.

## Step 5 — Bundle-size outliers

For each dependency shipped to the client (not build-only tooling), check its size on
[bundlephobia.com](https://bundlephobia.com). Flag any dependency whose size is disproportionate to
the functionality actually used from it (e.g. importing one function from a large monolithic
utility library — see `react-dependencies`'s tree-shaking guidance).

## Step 6 — License compliance

For each direct dependency, check its declared license (`npm view <package> license`). Flag any
GPL/AGPL-licensed dependency for review if the project is proprietary/commercial, and flag any
dependency with no declared license at all.

## Step 7 — Report

```
## Dependency Audit Report

### CVEs
<npm audit output summary, grouped by severity>

### Outdated
- `<package>` — installed <version>, latest <version> [<N> major versions behind / stale since <date>]

### Unused
- `<package>` — declared but no import found

### Bundle-Size Outliers
- `<package>` — <size> gzipped, flagged because <reason>

### License Concerns
- `<package>` — <license>, flagged because <reason>

### Verdict
<One sentence: dependency set is healthy / N issues found, worst is <severity>.>
```

Omit sections with no findings.
