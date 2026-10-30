---
name: ng-audit-deps
description: "Audit project dependencies — outdated versions, known CVEs, unused packages, Angular lockstep, and license compliance"
when_to_use: "Run via `/ng-audit-deps` before a release or as a periodic maintenance check — e.g. \"audit my dependencies\", \"are any packages out of date or vulnerable\". Produces a read-only report covering CVEs, outdated versions, Angular lockstep, and license compliance; makes no changes."
allowed-tools: Read, Bash, Glob, Grep
argument-hint: "(no arguments)"
context: fork
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

### Security (Angular)

## Secrets and Credentials
Anything compiled into the application bundle is **public** — users can read it in DevTools.
Credentials, tokens, API keys, and signing secrets **must never** appear in source, in
`environment.ts` / `environment.prod.ts`, in log statements, or in error messages. Authenticate
against a server that holds the secret; the client receives only short-lived, scoped tokens
obtained at runtime. Document required server-side variables in the README — never their values.

```ts
// Wrong — shipped to every browser
export const environment = { apiKey: 'sk_live_abc123' };

// Right — the client calls a backend that holds the secret
const token = await this.auth.getAccessToken(); // obtained at runtime, short-lived
```

## Cross-Site Scripting (XSS)
Angular contextually auto-escapes interpolation (`{{ value }}`) and property bindings — rely on it.
- **Never** call `bypassSecurityTrust*` (`bypassSecurityTrustHtml`, `…Url`, `…ResourceUrl`, …) on
  untrusted input. Each call is an explicit hole in the sanitizer; use it only for content you
  fully control, with a comment justifying it.
- Bind `[innerHTML]` only to sanitized or statically-trusted content. Prefer rendering structured
  data over injecting raw HTML.
- Treat `DomSanitizer` as a last resort, not a convenience.

```ts
// Wrong — untrusted markup bypasses the sanitizer
this.html = this.sanitizer.bypassSecurityTrustHtml(userSuppliedMarkup);

// Right — let Angular sanitize on binding
// template: <div [innerHTML]="userSuppliedMarkup"></div>
```

## Template / Code Injection
Never compile templates or evaluate expressions from untrusted input: no `eval`, no
`new Function(...)`, no dynamic component/template compilation driven by user data. Build UI from
typed data and the framework's declarative bindings instead.

## URL and HTTP Construction
- Build query parameters with `HttpParams`, not string concatenation, so values are encoded.
- Validate and **allowlist** any URL or host assembled from user input before issuing a request
  (SSRF and open-redirect vector); never redirect to a raw user-supplied URL.
- Never place credentials or tokens in a URL — use headers (and let an interceptor attach them).

```ts
// Right — encoded params, fixed base URL
const params = new HttpParams().set('q', userQuery);
this.http.get(`${this.baseUrl}/search`, { params });
```

## Trusted Types / CSP
Where the app enforces a Content-Security-Policy and Trusted Types, keep DOM writes going through
Angular's bindings and sanitizer so policy violations don't appear at runtime. Avoid direct
`element.innerHTML =` / `document.write` assignments.

## Authorization Is Server-Side
Route guards and `*ngIf`/`@if` on a role are **UX only** — they hide UI, they do not protect data.
Every privileged operation must be authorized again on the server. Never treat a client-side check
as a security boundary.

## Secure Randomness and Comparison
Use `crypto.getRandomValues()` / `crypto.randomUUID()` for tokens, nonces, and identifiers — never
`Math.random()`, which is not cryptographically secure. Compare secrets/HMACs with a constant-time
comparison, not `===`, when the comparison happens anywhere a timing signal could leak.

## Unsafe Deserialization and Storage
- Parse external data with `JSON.parse` into a validated shape; never feed untrusted input to
  `eval`-like reviver hacks.
- Do not persist tokens or PII in `localStorage`/`sessionStorage` when an XSS could read them;
  prefer short-lived in-memory tokens or secure, `HttpOnly` cookies set by the server.

## Dependencies
Client-side dependencies ship to users, so a vulnerable package is a direct attack surface. Run
`npm audit` and keep dependencies current (deep scan → the `ng-audit-deps` skill;
codebase-wide review → the `ng-security-auditor` agent).
