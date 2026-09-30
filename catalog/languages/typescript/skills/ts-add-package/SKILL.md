---
id: typescript/ts-add-package
kind: skill
title: "Add Package (TypeScript)"
description: "Vet and wire a new npm package — CVEs, types, license, ESM/CJS compatibility"
name: ts-add-package
language: typescript
allowedTools:
  - Read
  - Bash
  - Glob
  - Grep
  - Edit
argumentHint: "<package-id> [version] [--dev]"
whenToUse: >-
  Use any time a new npm dependency needs adding — "add <package>", "install <package>", "I need
  a library for X". Confirms before adding if vetting flags risk. Not for updating an
  already-installed package's version — this skill's value is the pre-install vetting.
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

# Add Package

**Package:** {sigil:arguments}

Parse `{sigil:arguments}`:
- First token → `<package-id>`
- If a second token looks like a version (e.g. `4.2.0`) → `<version>`; else auto-discover.
- If `--dev` is present → `devDependencies` (also add `@types/<pkg>` if needed).

## Step 1 — Discover repo layout

Locate the project root and target `package.json` (ask which workspace member, if more than one).
Check whether the package is already referenced (`grep -r "\"<package-id>\"" . --include="package.json"`);
if found, report the current version and ask whether to **update** instead of add.

## Step 2 — Vet the package

```bash
npm info <package-id> version 2>&1
npm audit fix --dry-run 2>&1 || true
npm install <package-id>@<version> --dry-run 2>&1   # previews transitive footprint
```

Check https://www.npmjs.com/package/<package-id> for:

1. **Maintenance** — last publish date, download trend, open issues; flag if last release > 12mo ago.
2. **License** — MIT/Apache/BSD/ISC typically fine; GPL/AGPL needs legal review; unlicensed is a risk.
3. **Types** — ✅ bundled (`"types"`/`"typings"` field) / ✅ `@types/<package-id>` exists / ⚠ none
   (forces `any` casts or ambient declarations — flag as a risk).
4. **ESM/CJS compatibility** — does `exports` include the condition the project's module system needs?
5. **Node built-in alternative** — could `node:fs`/`node:crypto`/`fetch`/`structuredClone`/etc. cover
   this need instead? If yes, recommend the built-in and stop.
6. **Source** — recognized author/organization, download counts, provenance.

**If vetting flags a risk:** present the finding and ask for explicit confirmation before proceeding.

## Step 3 — Determine version

Use `<version>` if provided; otherwise `npm info <package-id> dist-tags.latest` and use the latest
stable release (avoid pre-release unless explicitly requested).

## Step 4 — Add the package

`npm install <package-id>@<version>` (add `--save-dev` for `--dev`). If types aren't bundled and
`@types/<package-id>` exists, add it too: `npm install @types/<package-id> --save-dev`.

## Step 5 — Verify lockfile updated

`git diff package-lock.json | head -40` — an unchanged lockfile means the install didn't take.

## Step 6 — Run the quality gate

Discover the gate from `package.json` scripts (`check`/`validate`/`ci`/`prepublishOnly`) and run
that. Only if none exists, fall back to the type checker, linter, and `scripts.test` separately —
never hardcode a specific runner. If the gate fails, **undo** (`npm uninstall <package-id>`) and
report the failure.

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
✅ <gate command> passed  /  ❌ <failure detail>

### Next steps
<recommended follow-up, if any>
```
