---
id: angular/ng-add-package
kind: skill
title: "Add Package (Angular)"
description: "Vet and add a dependency — prefer ng add for Angular-aware packages, npm install otherwise, with peer-range and supply-chain checks"
name: ng-add-package
language: angular
allowedTools:
  - Read
  - Bash
  - Glob
  - Grep
  - Edit
argumentHint: "<package> [version] [--dev]"
uses:
  rules:
    - angular/ng-dependencies
    - angular/ng-npm
  agents: []
tags:
  - angular
  - add
  - package
  - npm
whenToUse: "Run via `/ng-add-package <package>` when a new dependency is needed — e.g. \"add ngx-toastr\", \"install this package as a dev dependency\". Vets for CVEs, types, ESM compatibility, Angular peer compatibility, and license before installing; undoes the change if the gate fails afterward."
---

# Add Package

**Target:** {sigil:arguments}  (package name, optional version, optional `--dev`)

## Step 1 — Discover repo layout

Parse `<package>`, optional `[version]`, and `--dev`. Read `package.json` and note:
- The Angular major (`@angular/core`) and Node engines constraint.
- Whether `<package>` (or an equivalent) is **already referenced** — if so, report and stop (don't duplicate).
- Whether the project is an application or a publishable library (affects `dependencies` vs `peerDependencies`).

## Step 2 — Vet the package

Gather evidence and decide whether to proceed:

```bash
npm view <package> version time.modified peerDependencies dependencies 2>&1
npm view <package> dist.unpackedSize 2>&1
```

Check each:
1. **Replaceable by a built-in?** Could the platform (`fetch`, `structuredClone`, `crypto`, `Intl`, `URL`) or Angular/CDK (HttpClient, Forms, overlay, a11y, drag-drop, virtual scroll) cover this need? If yes, **recommend the built-in and stop** (see `ng-dependencies`).
2. **Maintenance:** recent release; not deprecated/abandoned.
3. **Security:** known CVEs — `npm audit` will run after install; if `osv-scanner` is available, check now.
4. **Transitive footprint / bundle impact:** large tree or heavy bundle cost for a narrow use.
5. **Types:** ships bundled `.d.ts`, or a maintained `@types/<package>` exists.
6. **ESM compatibility:** works with the Angular build (avoid CommonJS-only packages that trigger optimization-bailout warnings).
7. **Angular peer compatibility:** for an Angular-aware package, confirm its `peerDependencies` range includes the project's Angular major. **An incompatible peer range is a blocker.**
8. **License:** compatible with the project.

If any check flags meaningful risk, **present the findings and confirm with the user before adding.**

## Step 3 — Determine version

**If `[version]` was provided:** use it exactly, after confirming its `peerDependencies` range includes
the project's Angular major (`npm view <package>@<version> peerDependencies`).

**If not provided:** pick the newest stable release whose `@angular/core` peer range covers the
project's Angular major — not simply `latest`. Angular-aware packages usually track Angular majors, so
`latest` may already require a newer Angular than the project runs:

```bash
npm view <package> dist-tags 2>&1                           # latest, next, and any vNN-lts tags
npm view <package>@<candidate> peerDependencies 2>&1        # check the @angular/core range
```

Avoid pre-release (`next`, `-rc`) unless explicitly requested. If no release supports the project's
Angular major, report that and stop. Never upgrade Angular as a side effect of adding a package; that
is a separate `ng update @angular/core @angular/cli` migration the user chooses to run.

## Step 4 — Add the package

**Prefer `ng add` for Angular-aware packages** (Angular Material, CDK, NgRx, transloco, etc.) — it runs
schematics that wire up providers, imports, and config:

```bash
ng add <package>[@version]   # ⚠️ schematics MODIFY project files
```

> **Warn the user that `ng add` modifies files** (app config, providers, styles). Review the changes it
> makes before committing. Run it only after the user is aware.

**Otherwise use npm:**

```bash
npm install <package>[@version]            # runtime dependency
npm install --save-dev <package>[@version] # when --dev
npm install --save-dev @types/<package>    # if the package ships no bundled types
```

For a publishable library where the package is a host requirement, add it to `peerDependencies`
(and usually `devDependencies` for local builds) rather than `dependencies`.

## Step 5 — Verify the install

### Lock file

Confirm `package-lock.json` was updated and the package resolved.

### Quality gate

Run the project's gate: `ng lint` + `tsc --noEmit` + `vitest run` (or discovered `npm run check`).
Run `npm audit` to surface any CVEs the install introduced.

**If the gate fails or the install broke the build, undo the change** (`npm uninstall <package>`, restore
`package.json`/lock) and report what went wrong rather than leaving the tree broken.

## Step 6 — Report

```
## Add Package Report
  Package:        <name>@<resolved-version>  (<dependencies | devDependencies | peerDependencies>)
  Installer:      <ng add (files modified) / npm install>
  CVEs:           <none detected / ⚠ flagged — detail>
  License:        <MIT / Apache-2.0 / ⚠ flagged — detail>
  Maintenance:    <active / ⚠ last release: <date>>
  Types:          <bundled / @types added / none>
  Peer range:     <compatible range / N/A>
  Gate:           ✅ lint  ✅ types  ✅ tests  ✅ audit  /  ❌ <which failed — change undone>
```
