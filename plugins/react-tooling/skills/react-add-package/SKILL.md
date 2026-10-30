---
name: react-add-package
description: "Vet and wire a new npm package for a React project — checks CVEs, bundle-size impact, types, and peer-dependency range before adding"
when_to_use: "Use any time you need to add a new npm dependency to a React project — fires for \"add the zustand package\", \"install react-hook-form\", or \"add zod as a dependency\". Pass the package name; optionally pin a version and add --dev for build/test-only packages. Confirms before adding if vetting flags risk (large bundle impact, peer-dependency mismatch, CVE). Not for updating an already-installed package's version — see react-audit-deps for checking existing dependencies."
allowed-tools: Read, Bash, Glob, Grep, Edit
argument-hint: "<package-name> [version] [--dev]"
---

# Add Package

**Package:** $ARGUMENTS

Parse `$ARGUMENTS`:
- First token → `<package-name>`
- If a second token looks like a version (e.g. `4.2.0`, `^4.0`) → `<version>`; else auto-discover
- If `--dev` is present → install as a `devDependency`

## Step 1 — Discover repo layout

Locate `package.json`, determine the package manager from the lock file present (`package-lock.json`
→ npm; `pnpm-lock.yaml` → pnpm; `yarn.lock` → yarn), identify whether this is a monorepo workspace
(look for `workspaces:` in the root `package.json`) and, if so, which package the addition targets.
Check whether the package is already declared (`grep -n "<package-name>" package.json`) — if found,
report the existing range and ask whether to update instead of add.

## Step 2 — Vet the package

**CVE check:**
```bash
npm view <package-name> 2>&1   # metadata: version, license, maintainers
```
(Run `npm audit` after the tentative add in Step 4 for the full resolved-tree CVE check.)

Check https://www.npmjs.com/package/<package-name> and
[bundlephobia.com/package/<package-name>](https://bundlephobia.com) for: **maintenance status**
(recent release, open issues — flag if last release > 18 months ago); **bundle size** (flag if it
adds significant weight for the functionality gained — see `react-dependencies`); **types**
(bundled `.d.ts` or a `@types/<package-name>` package — flag if neither exists); **peer
dependencies** (confirm its declared `react`/`react-dom` peer range actually covers the project's
installed React version); **license** (MIT/BSD/Apache typically fine, GPL/AGPL needs review).

**If vetting flags a risk:** present the finding and ask for explicit confirmation before proceeding.

## Step 3 — Determine version

**If `<version>` was provided:** use it exactly.

**If not provided:** fetch the latest stable version (`npm view <package-name> version`); prefer
latest stable, avoid pre-release unless explicitly requested.

## Step 4 — Add the package

Add via the project's package manager.


```bash
npm install <package-name>@<version>                 # runtime dependency
npm install --save-dev <package-name>@<version>       # --dev

# pnpm / yarn equivalents if that's the detected manager
pnpm add <package-name>@<version>
yarn add <package-name>@<version>
```

For a monorepo workspace, target the specific package (`npm install <pkg> --workspace=apps/web`) —
never the root, unless it's genuinely shared tooling.

## Step 5 — Verify the install

### Lock file

```bash
git diff package-lock.json   # or pnpm-lock.yaml / yarn.lock
```

### Quality gate

```bash
npm run lint && npx tsc --noEmit && npm test && npm run build
```

If the gate fails, **undo the addition** (revert `package.json` and the lock file) and report the
failure. Building is included deliberately — a bundler-incompatible package fails here, not in lint.

## Step 6 — Report

```
## Add Package Report

Package: <package-name> v<version>
Manager: <npm / pnpm / yarn>
Dev-only: <yes / no>

### Vetting
- CVEs: <none detected / ⚠ flagged — detail>
- Bundle size: <N kB gzipped / ⚠ flagged as significant>
- License: <MIT / Apache-2.0 / ⚠ flagged — detail>
- Maintenance: <active / ⚠ last release: <date>>
- Types: <bundled / @types available / ⚠ untyped>
- Peer range: <compatible / ⚠ mismatch — detail>

### Gate
✅ lint, type-check, tests, and build passed  /  ❌ <failure detail>

### Next steps
<Any recommended follow-up.>
```

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
