---
name: ng-release
description: "Prepare an Angular library release — verify quality gates, generate a changelog from git log, and propose a version bump"
when_to_use: "Run manually via `/ng-release <version>` before cutting a release tag — e.g. \"prepare a release\", \"cut version 1.2.0\". Pass the target version number as the argument; omit it to get a suggested bump from recent commits. Does not tag, push, or publish — produces a checklist and changelog draft for human review."
allowed-tools: Read, Bash, Glob, Grep
argument-hint: "<version> (e.g. 1.2.0)"
disable-model-invocation: true
---

# Release Preparation

**Target version:** $ARGUMENTS

> This skill is **user-invoked only** (`disable-model-invocation: true`). It prepares
> the release but does **not** create a tag, push to remote, or publish to a registry.
> All final actions require human confirmation.

## Step 1 — Verify quality gates

Discover and run the project's full quality gate, **angular-eslint first**:

```bash
# Prefer a discovered package.json "check" script. Fallback triple:
#   ng lint            (angular-eslint; falls back to eslint .) — required
#   tsc --noEmit       (full strictTemplates check via `ng build`)
#   vitest run         (or ng test --watch=false)
# Optional, only if configured: prettier --check . / biome check . (never fails the gate when absent)
```

**If any required gate fails: stop and report.** Do not proceed — a release with failing gates is blocked. A missing formatter is not a failure; note it and continue.

For a publishable library, also confirm the package builds: `ng build <lib>` (ng-packagr), and consider running `ng-api-compat-reviewer` to confirm the SemVer bump matches the surface diff.

## Step 2 — Check the working tree

```bash
git status --porcelain
git stash list
```

If there are uncommitted changes or stashes, **report and stop** — a release must be cut from a
clean working tree.

Note the current branch and whether it is ahead of or behind the remote:
```bash
git log --oneline origin/main..HEAD
```

## Step 3 — Determine the version

**If `$ARGUMENTS` is provided:** use that as the target version.

**If `$ARGUMENTS` is empty:**
1. Read the current version from `package.json` (`"version"`).
2. Read recent commits (Step 4) and suggest a bump:
   - Any `feat:` commit → minor bump (0.X.0).
   - Only `fix:` / `refactor:` / `chore:` / `perf:` commits → patch bump (0.0.X).
   - Breaking change (`BREAKING CHANGE:` in a commit body, or a Breaking finding from `ng-api-compat-reviewer`) → major bump (X.0.0).
Ask the user to confirm the version before proceeding.

## Step 4 — Generate changelog

```bash
git log <last-tag>..HEAD --oneline --no-merges
```

If no tag exists, use the first commit: `git log --oneline --no-merges`.

Group commits by type and produce a changelog section:

```markdown
## [<version>] — <today's date>

### Features
- <summary of feat: commits>

### Bug Fixes
- <summary of fix: commits>

### Refactoring
- <summary of refactor: commits>

### Other
- <perf, chore, docs, ci, test commits>
```

Omit sections with no entries.

## Output Release Checklist

```
## Release Checklist — v<version>

### Quality gates
✅ lint passed  /  ✅ types passed  /  ✅ tests passed (<N> tests, <coverage>%)
Formatter: ✅ / ⏭ none configured
Library build: ✅ / ⏭ n/a

### Working tree
✅ clean  /  ❌ uncommitted changes — resolve before releasing

### Version
Current: <current-version>
Proposed: <target-version>
Bump type: <major / minor / patch>

### Changelog draft
<markdown changelog section from Step 4>

### Next steps (human action required)
1. Review and edit the changelog above.
2. Update `version` in `package.json` to `<target-version>`.
3. Commit: `git commit -m "chore: release v<target-version>"`
4. Tag: `git tag -a v<target-version> -m "Release v<target-version>"`
5. Push: `git push origin main --tags`
6. Publish (if applicable): `npm publish` (or `npm publish` from the built library `dist/`).
```

---

## Applied Rules

### Conventions (Angular)

## Types, Not `any`
Annotate every public method signature and return type. Avoid `any` — it disables the
type checker for everything it touches. Prefer `unknown` for genuinely unknown values
and **narrow before use**. Use generics (`Array<T>`, `Map<K, V>`) or a small interface
for polymorphism. When a type truly cannot be known at annotation time, narrow it as soon
as possible rather than propagating it outward.

For third-party values that arrive untyped, define a narrow interface containing only the
members you actually use — this constrains coupling to what you touch and keeps the type
checker clean without reaching for `any`.

## Strictness
Run TypeScript in **strict** mode (`"strict": true` in `tsconfig.json`), plus
`noImplicitOverride`, and enable `strictTemplates` in `angularCompilerOptions` so the
template type-checker catches binding mistakes. Every type error is a real contract gap.
`@ts-ignore` is banned; use `@ts-expect-error // <one-line reason>` only when a suppression
is genuinely justified — it fails the build if the error ever disappears, so it cannot rot
silently.

## Explicit Optionals
Model absence with `T | undefined` (or `T | null` consistently with the codebase) — never a
sentinel string or an implicit `undefined` return with an undocumented type. Avoid the
non-null assertion `!` unless you can state in a comment why the value is provably defined;
prefer a guard or `?.`.

## Immutability
Prefer `readonly` on fields and `ReadonlyArray<T>` / `as const` for data that should not
change after construction. Treat `@Input()` values and emitted objects as immutable — mutating
them in place defeats OnPush change detection (see `ng-components`).

## Naming
| Symbol | Style | Example |
|---|---|---|
| Functions, variables, methods | `camelCase` | `parseInput`, `timeRange` |
| Classes, interfaces, enums | `PascalCase` | `UserEvent`, `StatusKind` |
| Private helpers | `camelCase` (optionally `#private`) | `toUtcDate`, `#cache` |
| Module-level constants | `UPPER_SNAKE` or `camelCase` `const` | `DEFAULT_CAP_MINUTES` |

**File naming** is `kebab-case.type.ts`, matching Angular's convention:
`user-profile.component.ts`, `auth.service.ts`, `role.guard.ts`, `date.pipe.ts`,
`logging.interceptor.ts`. Class names are `PascalCase` with the matching suffix
(`UserProfileComponent`, `AuthService`, `RoleGuard`, `DatePipe`). One cohesive concept
per file. Component/directive **selectors** carry the project's prefix — element selectors
`app-*` (e.g. `app-user-profile`), attribute/directive selectors a camelCase prefix
(e.g. `appHighlight`). Discover the actual prefix from `angular.json` (`prefix`) and match it.

## Dependency Injection
> **Discovery rule:** detect the project's DI style before writing. **`inject()`** if you
> see `inject(` calls or `standalone: true`; **constructor injection** if providers are
> declared via `@NgModule` and dependencies arrive as constructor parameters. Match the
> surrounding code; do not mix styles within one file.

### Standalone + signals (Angular 17+)
Resolve dependencies with the `inject()` function at field initialisation. It composes
cleanly, works in functional guards/resolvers/interceptors, and keeps constructors empty.

```ts
export class UserProfileComponent {
  private readonly users = inject(UserService);
  private readonly route = inject(ActivatedRoute);
}
```

### NgModule (classic)
Declare dependencies as `private readonly` constructor parameters; the injector supplies them.

```ts
export class UserProfileComponent {
  constructor(
    private readonly users: UserService,
    private readonly route: ActivatedRoute,
  ) {}
}
```

## Composition over Inheritance
Prefer composing services and content projection over inheriting from a base component.
Inheritance couples a subclass to its parent's implementation and creates fragile hierarchies;
component inheritance in particular tangles lifecycle hooks and DI. Use it only when a genuine
IS-A relationship exists and the Liskov Substitution Principle holds throughout.

- **Hierarchy depth:** keep inheritance chains to ≤ 2 levels; anything deeper is a design smell.
- **Static-method-only "utility" classes** are a namespace masquerading as a class. Use a
  module with exported functions instead — they are simpler and directly importable.
- For shared cross-cutting behaviour prefer a service, a directive, or a pure function over a base class.

## Control Flow
Prefer `switch` or a lookup map over long `if/else if` chains when branching on a closed set
of values. Keep each branch body within the method-body line limit; extract helpers for
complex branches.

**Guard clauses over nesting.** Return early at the top of a method for invalid or trivial
cases. Deep nesting (> 2–3 levels) is a readability smell — flatten it with early returns or
extracted helpers.

## Imports and Exports
Order: external packages → Angular packages → local — angular-eslint / the configured import
ordering rule enforces this. Use `import type { … }` for type-only imports so they are erased
at runtime. Prefer **named exports**; avoid default exports (they make refactors and re-exports
harder). Barrel files (`index.ts` / a library `public-api.ts`) are optional, not mandated — keep
them narrow when present.

**Dynamic imports** (`import('…')`) are the mechanism behind lazy-loaded routes and are
encouraged there. Outside lazy loading, use them only at documented adapter boundaries — never
to hide a normal dependency or paper over a circular import.

## State and Side Effects
Module-level **mutable** globals are banned; hold state in a service so it is injectable and
testable. Constants are the only acceptable module-level state. Prefer pure functions that
receive and return explicit arguments over functions that read or write shared state implicitly.

**Command-query separation (CQS):** a method either returns a value *or* causes a visible side
effect — not silently both. A getter must not mutate; a method that mutates must communicate
that clearly (name, return type). Hidden side effects make code hard to test and reason about.

## Never
- An empty `catch {}` or a `catch` that swallows without logging or re-throwing — these are silent lies.
- `var` — use `const` by default, `let` only when reassignment is required.
- Mutable default behaviour that shares a reference across calls.
- Wildcard re-exports that leak a whole module's internals; export the public surface explicitly.
- Unexplained `@ts-expect-error` / `@ts-ignore` — always pin a reason, and prefer `@ts-expect-error`.
- Using thrown errors for normal control flow — return a typed value (`T | undefined`, a result
  object, or an empty collection) for expected outcomes. Reserve `throw` for truly exceptional conditions.

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
