---
name: ng-add-package
description: "Vet and add a dependency — prefer ng add for Angular-aware packages, npm install otherwise, with peer-range and supply-chain checks"
when_to_use: "Run via `/ng-add-package <package>` when a new dependency is needed — e.g. \"add ngx-toastr\", \"install this package as a dev dependency\". Vets for CVEs, types, ESM compatibility, Angular peer compatibility, and license before installing; undoes the change if the gate fails afterward."
allowed-tools: Read, Bash, Glob, Grep, Edit
argument-hint: "<package> [version] [--dev]"
---

# Add Package

**Target:** $ARGUMENTS  (package name, optional version, optional `--dev`)

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

---

## Applied Rules

### Dependencies (Angular)

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

### npm (Angular)

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
