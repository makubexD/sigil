---
id: react/react-npm
kind: rule
title: npm (React)
description: React/frontend npm mechanics — lockfile discipline, npm audit, semver ranges, monorepo workspace considerations
language: react
appliesTo:
  - "**/package.json"
tags:
  - react
  - npm
  - packaging
appliesToRationale: Scoped to package.json because these are package-manager mechanics declared there, not runtime component logic.
---

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
