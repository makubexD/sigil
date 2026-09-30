---
id: angular/ng-dependencies
kind: rule
title: Dependencies (Angular)
description: Angular/Node dependency management — pinning, vetting, Angular lockstep, dev/runtime separation, removing unused
language: angular
appliesTo:
  - package.json
  - "**/*.ts"
severity: recommended
extends: []
tags:
  - angular
  - dependencies
---


## Pin and Lock
Every dependency must be resolved through a committed lock file. Commit `package-lock.json`
(or the toolchain's lock) and install reproducibly with `npm ci` in CI and release builds —
not `npm install`, which can drift the tree. Pin transitive versions through `overrides` when a
specific transitive release must be held or patched.

Keep `package.json` as the single source of truth for declared dependencies. Avoid parallel,
hand-maintained dependency lists elsewhere.

## Separate Runtime, Dev, and Peer Dependencies
- **`dependencies`** — what the running application needs at runtime.
- **`devDependencies`** — build and test tooling (Angular CLI, angular-eslint, Vitest, type
  packages, formatters). Never ship these to production.
- **`peerDependencies`** — for a publishable **library**, declare Angular and other host packages
  here with an appropriate version range rather than bundling them.

## Angular Version Lockstep
The Angular packages move together. When upgrading, bump `@angular/*` (and CDK/Material, which
track the Angular major) **as a set**, and use `ng update` so its migration schematics run — do
not hand-edit one Angular package to a different major. Before adding any Angular-aware package,
check its `peerDependencies` against the project's Angular major; an incompatible peer range is a
blocker, not a warning to ignore.

## Prefer Platform and Framework Built-ins
Before adding a dependency, check whether the platform or Angular already covers the need:
`fetch`, `structuredClone`, `crypto`, `Intl`, `URL`, `AbortController`; Angular's `HttpClient`,
Forms, Router, and the Angular CDK (overlay, a11y, drag-drop, virtual scroll, layout). A
dependency adds supply-chain risk and bundle weight; a built-in adds neither.

## Vet Before Adding
When adding a new dependency:
1. Confirm it is actively maintained (recent release, issues addressed).
2. Check for known CVEs (`npm audit`, `osv-scanner`).
3. Review its transitive footprint and its effect on bundle size.
4. Confirm it ships **types** (bundled `.d.ts` or a maintained `@types/*`) and is **ESM-compatible**
   so it works with the Angular build.
5. Check the license is compatible with the project.
6. For Angular-aware packages, confirm peer-dependency compatibility (see lockstep above).

See the `ng-add-package` skill for the guided add-and-vet procedure.

## Remove Unused Dependencies
Unused imports and unused declared dependencies are dead weight and a supply-chain risk.
Periodically audit with `depcheck` or `knip`. If a package is imported in only one place and that
code is deleted, remove the dependency from `package.json` and refresh the lock file.

## Dependency Updates
Keep dependencies reasonably current — unmaintained versions accumulate CVEs. Prefer automated
update PRs (Dependabot, Renovate) that run the full gate before merging, and route Angular package
updates through `ng update`. Never merge a dependency update without running the project's quality
gate (discovered `npm run check`, or `ng lint` + `tsc --noEmit` + `vitest run`) first.
