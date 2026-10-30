---
name: react-audit-deps
description: "Audit npm dependencies for a React project — known CVEs (npm audit), outdated versions, unused packages, bundle-size outliers, and license compliance"
when_to_use: "Use to check for known CVEs, outdated packages, and bundle-size outliers in a React project's npm dependencies. Fires for \"are there any known CVEs\", \"audit dependencies\", \"check for vulnerable packages\", or before a release."
allowed-tools: Read, Bash, Glob, Grep
argument-hint: "(no arguments)"
context: fork
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

---

## Applied Rules

### Dependencies (React)

## Bundle Size Is a Cost, Not Just Install Time

Every dependency added to a React app ships to the browser (unless it's server-only in an RSC
context). Before adding a UI/utility library, check its bundle-size impact on
[bundlephobia.com](https://bundlephobia.com) and prefer a tree-shakeable, ESM-first package over one
that forces a large monolithic import.

```tsx
// Correct — named import from a tree-shakeable library pulls in only what's used
import { debounce } from "es-toolkit";

// Avoid — a default-export utility-belt library often can't be tree-shaken at all
import _ from "lodash";
```

## Peer Dependencies

React ecosystem libraries (component libraries, form libraries, animation libraries) commonly
declare `react`/`react-dom` as `peerDependencies` with a version range. Before adding one, confirm
its peer range actually covers the project's installed React version — a mismatch produces runtime
errors that `npm install` alone won't catch (npm 7+ warns, but doesn't block).

## Prefer the Platform/Framework Before Adding a Library

Check whether React itself or the framework (Next.js) already covers the need before reaching for a
package: `useId` (stable IDs for SSR), `useDeferredValue`/`useTransition` (built-in scheduling,
before reaching for a "debounce this render" library), `next/image` (image optimization), `next/font`
(font loading) — these avoid an extra dependency and are already integrated with the framework's
hydration model.

## Vet Before Adding

When adding a new dependency:
1. Confirm it is actively maintained and has recent releases addressing issues.
2. Check for known CVEs: `npm audit` after adding.
3. Confirm it ships TypeScript types (bundled `.d.ts` or a `@types/*` package).
4. Check ESM/CJS compatibility with the build tool (Vite, Next.js) — a CJS-only package can still
   work but may need special handling in an ESM-first Vite config.
5. Check the license is compatible with the project.

See `/react-add-package` for an automated vet-and-wire workflow.

## Remove Unused Dependencies

Audit with `depcheck` or `knip` after removing code that used an import — an unused UI library left
in `package.json` still ships its CSS/runtime if imported anywhere, even unintentionally through a
barrel file. Remove the entry and reinstall to refresh the lock file.

## Dependency Updates

Keep dependencies current, especially React itself and the framework — security patches and
concurrent-feature improvements land in minor releases. Prefer automated update PRs (Dependabot,
Renovate) that run the full test suite (including a build, to catch bundle-breaking changes) before
merging. Never merge a major-version bump to React, the framework, or a core UI library without
reading its migration guide — a "backwards-compatible" minor bump can still change default
behavior in a component library.

### npm (React)

## Commit the Lockfile

Commit `package-lock.json` (or `pnpm-lock.yaml`/`yarn.lock`, whichever the project's package
manager produces) — it is the reproducibility guarantee across every developer machine and CI run.
Use `npm ci` (not `npm install`) in CI: it installs strictly from the lockfile and fails if
`package.json`/lockfile are out of sync, instead of silently re-resolving.

Never hand-edit the lockfile. Pin a problematic transitive dependency with `overrides` in
`package.json`:

```json
{
  "overrides": {
    "vulnerable-transitive-dep": ">=2.1.0"
  }
}
```

## Semver Ranges in `package.json`

Use caret ranges (`^18.2.0`) for dependencies to accept non-breaking updates automatically, but rely
on the **lockfile**, not the range, for what's actually installed — the range is a policy for
`npm update`, the lockfile is the reproducible truth for `npm ci`. Pin exact versions (no `^`/`~`)
only for tooling where an unexpected minor bump has bitten the project before.

## `npm audit`

Run `npm audit` after adding or updating any dependency; run it in CI as a non-blocking report at
minimum, blocking on `high`/`critical` findings once the project's baseline is clean:

```bash
npm audit --omit=dev              # production dependency tree only
npm audit fix                     # auto-applies safe, non-breaking fixes
```

`npm audit fix --force` can introduce breaking major-version bumps silently — never run it without
reviewing the diff and re-running the full test suite + build afterward.

## Separate `dependencies` from `devDependencies`

Runtime libraries (anything imported into code that ships to the browser or runs the server) go in
`dependencies`. Build tooling, test runners, type stubs, and linters go in `devDependencies` — a
build tool accidentally in `dependencies` bloats a production install that doesn't need it (though
frontend builds typically bundle everything regardless, so this mostly matters for a Next.js
server/API-route dependency graph and for install-time cost in CI).

## Monorepo Workspaces

If the project uses npm/pnpm/yarn workspaces, add a dependency to the **specific package** that
needs it (`npm install <pkg> --workspace=apps/web`), never to the workspace root unless it is
genuinely shared tooling (a repo-wide linter config, a build orchestrator). A dependency hoisted to
the root that only one package actually uses obscures that package's real dependency graph.

## Remove Unused Dependencies

Audit with `depcheck` or `knip` periodically. An unused dependency still gets installed, still gets
audited, and — if it's ever imported by mistake through a barrel file — still ships to the client
bundle. Remove it and run `npm install` to refresh the lockfile.

See `react-add-package` for the automated vet-and-wire skill and `react-dependencies` for the
broader bundle-size and peer-dependency guidance this rule's mechanics support.

### Security (React)

## `dangerouslySetInnerHTML` Requires Sanitization

React escapes JSX text content by default — that protection is bypassed entirely by
`dangerouslySetInnerHTML`. Never pass unsanitized user or third-party content to it; run it through
a sanitizer (`DOMPurify`) first:

```tsx
// Correct — sanitized before rendering
<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(userSuppliedHtml) }} />

// Wrong — direct XSS if userSuppliedHtml contains a <script> or event-handler attribute
<div dangerouslySetInnerHTML={{ __html: userSuppliedHtml }} />
```

Prefer rendering as plain text (`{content}`) whenever the content doesn't genuinely need to be HTML
— it needs no sanitization step at all and can't regress into an XSS hole later.

## Client-Exposed Environment Variables Are Public

Any variable prefixed `NEXT_PUBLIC_`/`VITE_` (or otherwise bundled into client JavaScript) is
visible to anyone who opens devtools — it is **not** a place for a secret, even a "low-risk" one.
A real API secret, signing key, or admin token must stay server-only (an unprefixed variable read
only in a Server Component, API route, or server action) and never be threaded down into a Client
Component's props.

```tsx
// Wrong — a server-only secret passed into a Client Component ships to the browser bundle
"use client";
export function Widget({ apiSecret }: { apiSecret: string }) { ... }

// Correct — the secret stays server-side; the client only receives the data it fetched with it
// (Server Component fetches with the secret, passes only the resulting data down)
```

## Unvalidated Redirects

Never build a redirect target directly from a URL query parameter without validating it against an
allowlist of known-safe paths — an open redirect (`?returnTo=https://evil.example.com`) is a
common phishing vector layered on top of a trusted domain.

```tsx
function safeRedirect(target: string): string {
  return target.startsWith("/") && !target.startsWith("//") ? target : "/";
}
```

## Third-Party Scripts and Content

Loading a third-party script (`<script src="...">`, an embedded iframe) grants it execution
context in your page. Use Subresource Integrity (`integrity="sha384-..."`) for any third-party
script pulled from a CDN, and set a Content-Security-Policy header restricting `script-src` to known
origins — this is typically a Next.js `next.config.js`/middleware concern, but any component that
injects a `<script>` tag dynamically must be reviewed against the CSP.

## Auth Token Storage

Prefer an httpOnly, Secure cookie set by the server for session tokens over `localStorage` —
`localStorage` is readable by any script running on the page, so an XSS hole anywhere in the app
(including a third-party dependency) can exfiltrate the token. If a client-readable token is
genuinely required (e.g., for a client-side API call), scope its lifetime short and never store a
long-lived refresh token there.

## CSRF on State-Changing Requests

For a cookie-authenticated app, state-changing requests (POST/PATCH/DELETE) must carry CSRF
protection — a same-site cookie attribute (`SameSite=Lax`/`Strict`) plus a server-validated CSRF
token for `Strict`-incompatible cross-site flows. A token-header-authenticated API (Bearer token in
an `Authorization` header, not a cookie) is inherently CSRF-safe since a cross-site form cannot set
a custom header — but confirm the app is actually using that model before relying on it.

See `react-logging` for the related no-PII invariant and `react-security-auditor` for a systematic
sweep of these patterns across the whole codebase.
