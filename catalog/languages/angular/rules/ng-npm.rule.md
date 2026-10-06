---
id: angular/ng-npm
kind: rule
title: npm (Angular)
description: "npm mechanics for Angular workspaces — ng update for framework packages, npm ci, overrides, npm audit gate, lifecycle scripts, engines, .npmrc tokens, ng-packagr publishing (Angular)"
language: angular
appliesTo:
  - "**/package.json"
  - "**/package-lock.json"
  - "**/.npmrc"
  - "**/angular.json"
  - "**/ng-package.json"
tags:
  - angular
  - npm
  - packaging
appliesToRationale: Scoped to npm's manifest, lockfile, and registry config plus the two Angular files that steer the package manager (angular.json's cli.packageManager) and library packaging (ng-package.json) — package-manager mechanics live there, not in component source.
---

This rule is the package-manager mechanics. Which dependencies to take, how to vet them, the
runtime/dev/peer split, and Angular version lockstep as a policy are in `ng-dependencies`; this rule
does not repeat them.

## Framework Packages Move Only Through `ng update`

Never change an `@angular/*` version in `package.json` by hand, and never run
`npm install @angular/core@<version>` on its own. `ng update` rewrites the versions **and** runs the
migration schematics; a hand bump skips the schematics and leaves code written for the old major.

```bash
ng update                                   # list what is outdated and what can be updated
ng update @angular/core @angular/cli        # framework + CLI together, one major at a time
ng update @angular/material                 # CDK/Material after the core update
```

- Every `@angular/*` package in `package.json` carries the **same version** (and the same range
  operator). A mixed set (`@angular/core@20.1` next to `@angular/forms@20.0`) is a defect, even
  when it installs.
- Move one major per `ng update` run and commit between majors — the schematics assume a single step.
- Run `ng update` on a clean working tree, so the schematic diff is reviewable on its own.

## Peer Dependencies Track the Angular Major

npm 7+ installs peer dependencies and fails the install on a conflicting peer range. When that
happens, fix the graph — upgrade or replace the package whose peer range excludes the project's
Angular major. Do not add `--legacy-peer-deps` or `--force`, and do not set `legacy-peer-deps=true`
in `.npmrc`: both silently install an Angular-aware package against a major it was never built for.

For a publishable library, declare `@angular/*` in `peerDependencies` with a range that covers the
majors the library is tested against (`"^20.0.0"`), and keep `tslib` as its only runtime dependency
unless the library truly needs more.

## Lockfile and `npm ci`

Commit `package-lock.json` and install with `npm ci` in CI and release builds. Never hand-edit the
lockfile; regenerate it with `npm install` (or `ng update`) and commit it with the `package.json`
change that caused it. The lockfile owns what is installed; the `package.json` range only governs
what the next update may pick.

## Pin the Package Manager in `angular.json`

When the workspace uses something other than npm, set it once in `angular.json` so `ng add`,
`ng update`, and `ng new` schematics install with the same tool and write the same lockfile:

```json
{ "cli": { "packageManager": "pnpm" } }
```

One workspace, one package manager, one lockfile. A second lockfile (`yarn.lock` next to
`package-lock.json`) is a defect — delete the one the configured manager does not produce. Declare
the version too, with `"packageManager": "pnpm@<version>"` in `package.json`, so Corepack and CI
use the same release.

## Transitive Pinning with `overrides`

When a transitive dependency carries a vulnerability and the direct dependency has not shipped a
fix, force a safe version with `overrides` rather than editing the lockfile:

```json
{
  "overrides": {
    "vulnerable-transitive-dep": ">=2.1.0"
  }
}
```

Never use `overrides` to force an `@angular/*` version or to bypass a peer-range conflict on an
Angular package — that is the hand bump the `ng update` section forbids. Record why the override
exists (in `SECURITY.md` or the PR description, since JSON has no comments) and remove it once the
direct dependency ships the fix.

## `npm audit` as a Gate

Run `npm audit` in CI, not only when vetting a new package:

```bash
npm audit --omit=dev              # production tree; block on high/critical
npm audit                         # full tree; report dev-tool findings
```

Most Angular dev-tree findings sit under the build toolchain and never reach the browser bundle;
triage them, but do not let them block a release the way a runtime finding does. Never run
`npm audit fix --force` — it applies breaking majors, including to `@angular/*` packages, outside
`ng update`. See the `ng-audit-deps` skill for the full dependency audit.

## Lifecycle Scripts and Engines

- `postinstall` and `prepare` scripts run on every install. Read a new package's scripts before
  adding it, flag any new dependency that adds a `postinstall` for review, and remove the old
  `postinstall: ngcc` step from workspaces upgraded from Angular 12 or earlier — ngcc no longer exists.
- Declare `engines.node` in `package.json` with the Node range the Angular CLI version supports, pin
  it locally with `.nvmrc` / `.node-version`, and enforce it in CI (`engine-strict=true` in `.npmrc`).
  An unsupported Node fails `ng build` with an unhelpful error.

## `.npmrc` Token Hygiene

Never commit a registry token. Reference it from the environment and scope the private registry to
its package scope only, so an internal package name cannot resolve from the public registry:

```ini
@myorg:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NPM_TOKEN}
```

## Publishing a Library: from `dist/`, Never the Root

A library is built by ng-packagr (`ng build <lib>`) into the Angular Package Format under
`dist/<lib>/`. That folder holds the generated `package.json`, the FESM bundles, the typings and the
`exports` map — publish it, never the library's source folder or the workspace root.

```bash
ng build my-lib --configuration production
cd dist/my-lib
npm pack --dry-run                # inspect exactly what will be uploaded
npm publish --provenance
```

- Do not hand-write `exports`, `main`, `module`, or `typings` in the library's source
  `package.json` — ng-packagr generates them; hand-written fields conflict with the APF layout.
  Extra shipped assets go in `ng-package.json` `assets`, not in a `files` list.
- Guard against an accidental root publish: keep `"private": true` in the workspace root
  `package.json`.
- Gate publishing on the project's quality gate and a production build of the library. The
  `ng-release` skill drives the release checklist; `ng-api-compat-reviewer` confirms the SemVer bump.

## Never

- An `@angular/*` version changed outside `ng update`, or two `@angular/*` packages on different versions.
- `--legacy-peer-deps` / `--force` to get past an Angular peer conflict.
- `npm install` in CI, or a hand-edited lockfile.
- Two lockfiles in one workspace.
- `npm publish` from the library source folder or the workspace root.
- A registry token in a committed `.npmrc`.
