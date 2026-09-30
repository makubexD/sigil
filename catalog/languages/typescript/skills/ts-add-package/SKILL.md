---
id: typescript/ts-add-package
kind: skill
title: "Add Package (TypeScript)"
description: "Vet and wire a new npm package — checks CVEs, types availability, license, and ESM/CJS compatibility before adding"
name: ts-add-package
language: typescript
appliesTo:
  - "**/*"
allowedTools:
  - Read
  - Bash
  - Glob
  - Grep
  - Edit
argumentHint: "<package-id> [version] [--dev]"
uses:
  rules:
    - typescript/ts-dependencies
    - typescript/ts-npm
  agents: []
tags:
  - typescript
  - add
  - package
  - npm
---

## When to Use

Use any time you need to add a new npm dependency. Pass the package ID; optionally pin a version and add --dev for devDependencies. Confirms before adding if vetting flags risk.

---

# Add Package

**Package:** $ARGUMENTS

Parse `$ARGUMENTS`:
- First token → `<package-id>`
- If a second token looks like a version (e.g. `4.2.0`) → `<version>`; else auto-discover.
- If `--dev` is present → `devDependencies` (also add `@types/<pkg>` if needed).

## Step 1 — Discover repo layout

- Locate the project root: `package.json` (or root `package.json` for a workspaces monorepo).
- Determine the target `package.json` — if multiple workspace members exist, ask the user which
  package should receive the dependency.
- Check whether the package is already referenced:
  ```bash
  grep -r "\"<package-id>\"" . --include="package.json"
  ```
  If found, report the current version and ask whether to **update** instead of add.

## Step 2 — Vet the package

**CVE check:**
```bash
# Temporarily add to a scratch manifest and audit, or use the advisory API
npm info <package-id> version 2>&1
npm audit fix --dry-run 2>&1 || true
```

Check https://www.npmjs.com/package/<package-id> for:

1. **Maintenance status** — last publish date, download trend, open issues. Flag if last release
   > 12 months ago.
2. **License** — MIT/Apache/BSD/ISC are typically acceptable; GPL/AGPL require legal review for
   commercial projects; unlicensed packages are a risk. Flag non-permissive licenses.
3. **Types availability** — three tiers:
   - ✅ Bundled: `package.json` has `"types"` / `"typings"` field.
   - ✅ Separate: `@types/<package-id>` exists on npm.
   - ⚠ None: consumer must write ambient declarations or use `any` casts — flag as a risk.
4. **ESM / CJS compatibility** — does the package's `exports` map include the conditions required
   by the project's module system (`"import"` for ESM, `"require"` for CJS)?
5. **Transitive footprint** — preview with:
   ```bash
   npm install <package-id>@<version> --dry-run 2>&1
   ```
6. **Node built-in alternative** — can `node:fs`, `node:crypto`, `fetch`, `structuredClone`, etc.
   cover this need? If yes, recommend the built-in and stop.
7. **Source** — is it published by a recognized author or organization? Check the npm page for
   download counts and provenance.

**If vetting flags a risk:** present the finding and ask for explicit confirmation before proceeding.

## Step 3 — Determine version

**If `<version>` was provided:** use it exactly.

**If not provided:**
```bash
npm info <package-id> dist-tags.latest
```
Use the latest stable version; avoid pre-release unless explicitly requested.

## Step 4 — Add the package

```bash
npm install <package-id>@<version>            # runtime dep
npm install <package-id>@<version> --save-dev # dev dep (--dev flag)
```

If types are not bundled and `@types/<package-id>` exists, add it automatically:
```bash
npm install @types/<package-id> --save-dev
```

## Step 5 — Verify lockfile updated

```bash
git diff package-lock.json | head -40
```

Confirm that `package-lock.json` was updated — an unchanged lockfile indicates something went wrong
with the install.

## Step 6 — Run the quality gate

```bash
tsc --noEmit
eslint .
vitest run
```

Discover the gate from `package.json` scripts first (look for `check`, `validate`, `ci`). If
the gate fails, **undo the addition** (`npm uninstall <package-id>`) and report the failure.

## Step 7 — Report

```
## Add Package Report

Package: <package-id>@<version>
Added to: <target package.json>
Category: <dependencies / devDependencies>

### Vetting
- CVEs: <none detected / ⚠ flagged — detail>
- License: <MIT / Apache-2.0 / ⚠ flagged — detail>
- Maintenance: <active / ⚠ last release: <date>>
- Types: <bundled / @types/<pkg> added / ⚠ no types available>
- ESM/CJS: <compatible / ⚠ mismatch — detail>
- Transitive additions: <N new packages>
- Built-in alternative: <none / ⚠ node:X can replace — recommendation>

### Gate
✅ tsc passed, eslint passed, vitest passed  /  ❌ <failure detail>

### Next steps
<Any recommended follow-up: add to types, configure ESM interop, etc.>
```
