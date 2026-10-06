---
id: react/react-add-package
kind: skill
title: "Add Package (React)"
description: "Vet and wire a new npm package for a React project — checks CVEs, bundle-size impact, types, and peer-dependency range before adding"
name: react-add-package
language: react
allowedTools:
  - Read
  - Bash
  - Glob
  - Grep
  - Edit
argumentHint: "<package-name> [version] [--dev]"
uses:
  rules:
    - react/react-dependencies
    - react/react-npm
  agents: []
tags:
  - react
  - add
  - package
  - npm
whenToUse: "Use any time you need to add a new npm dependency to a React project — fires for \"add the zustand package\", \"install react-hook-form\", or \"add zod as a dependency\". Pass the package name; optionally pin a version and add --dev for build/test-only packages. Confirms before adding if vetting flags risk (large bundle impact, peer-dependency mismatch, CVE). Not for updating an already-installed package's version — see react-audit-deps for checking existing dependencies."
---

# Add Package

**Package:** {sigil:arguments}

Parse `{sigil:arguments}`:
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
npm run lint && npx tsc --noEmit && npx vitest run && npm run build
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
- Types: <bundled / @types available / ⚠ untyped>
- Peer range: <compatible / ⚠ mismatch — detail>

### Gate
✅ lint, type-check, tests, and build passed  /  ❌ <failure detail>

### Next steps
<Any recommended follow-up.>
```
