---
id: angular/ng-add-package
kind: skill
title: "Add Package (Angular)"
description: "Vet and add a dependency — prefer ng add for Angular-aware packages, npm install otherwise, with peer-range and supply-chain checks"
name: ng-add-package
language: angular
appliesTo:
  - "**/*"
allowedTools:
  - Read
  - Bash
  - Glob
  - Grep
  - Edit
argumentHint: "\"<package> [version] [--dev]\""
uses:
  rules:
    - angular/ng-dependencies
  agents: []
tags:
  - angular
  - add
  - package
  - npm
---

## When to Use

Use to add a new dependency to an Angular project. Pass the package name, optional version, and --dev for a devDependency. Vets the package (CVEs, types, ESM, Angular peer compatibility, license) before installing and undoes the change on failure.

---

# Add Package

**Target:** $ARGUMENTS  (package name, optional version, optional `--dev`)

## Step 1 — Parse and inspect the project

Parse `<package>`, optional `[version]`, and `--dev`. Read `package.json` and note:
- The Angular major (`@angular/core`) and Node engines constraint.
- Whether `<package>` (or an equivalent) is **already referenced** — if so, report and stop (don't duplicate).
- Whether the project is an application or a publishable library (affects `dependencies` vs `peerDependencies`).

## Step 2 — Vet before installing

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

## Step 3 — Install

**Prefer `ng add` for Angular-aware packages** (Angular Material, CDK, NgRx, transloco, etc.) — it runs
schematics that wire up providers, imports, and config:

```bash
ng add <package>   # ⚠️ schematics MODIFY project files
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

## Step 4 — Verify, undo on failure, report

- Confirm `package-lock.json` was updated and the package resolved.
- Run the project's gate: `ng lint` + `tsc --noEmit` + `vitest run` (or discovered `npm run check`).
  Run `npm audit` to surface any CVEs the install introduced.
- **If the gate fails or the install broke the build, undo the change** (`npm uninstall <package>`, restore
  `package.json`/lock) and report what went wrong rather than leaving the tree broken.

```
Add Package Report
  Package:        <name>@<resolved-version>  (<dependencies | devDependencies | peerDependencies>)
  Installer:      <ng add (files modified) / npm install>
  Types:          <bundled / @types added / none>
  Angular peer:   <compatible range / N/A>
  Vetting:        <passed / flags: …>
  Gate:           ✅ lint  ✅ types  ✅ tests  ✅ audit  /  ❌ <which failed — change undone>
```
