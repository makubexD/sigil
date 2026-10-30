---
name: ts-add-package
description: "Vet and wire a new npm package — CVEs, types, license, ESM/CJS compatibility (TypeScript)"
when_to_use: "Use any time a new npm package needs adding — \"add <package>\", \"install <package>\", \"I need a library for X\". Confirms before adding if vetting flags risk. Scoped to bringing in a package that is not yet installed — not for bumping an existing package to a newer release, which needs no vetting workflow."
allowed-tools: Read, Bash, Glob, Grep, Edit
argument-hint: "<package-id> [version] [--dev]"
---

# Add Package

**Package:** $ARGUMENTS

Parse `$ARGUMENTS`:
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

## Step 5 — Verify the install

### Lock file

`git diff package-lock.json | head -40` — an unchanged lockfile means the install didn't take.

### Quality gate

Discover the gate from `package.json` scripts (`check`/`validate`/`ci`/`prepublishOnly`) and run
that. Only if none exists, fall back to the type checker, linter, and `scripts.test` separately —
never hardcode a specific runner. If the gate fails, **undo** (`npm uninstall <package-id>`) and
report the failure.

## Step 6 — Report

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

---

## Applied Rules

### Dependencies (TypeScript)

## Commit the Lockfile

Commit `package-lock.json` (or the project's lock file) to version control. It is the reproducibility
guarantee: everyone on the team and every CI run installs the exact same transitive graph. Use
`npm ci` in CI — it installs from the lockfile and fails if `package.json` and `package-lock.json`
are out of sync.

Never hand-edit the lockfile. If a transitive dependency needs to be pinned, use `overrides` in
`package.json`:

```json
{
  "overrides": {
    "vulnerable-transitive-dep": ">=2.1.0"
  }
}
```

See `ts-npm` for the full lockfile + security workflow.

## Separate `dependencies` from `devDependencies`

| Category | Location | Installed in production? |
|---|---|---|
| Runtime libraries | `dependencies` | Yes |
| Type declarations (`@types/*`) | `devDependencies` | No |
| Test runners, linters, compilers, build tools | `devDependencies` | No |
| Optional peer deps | `peerDependencies` / `optionalDependencies` | As declared |

Never install dev tools in a production image or bundle. A runtime package that leaks into
`devDependencies` will cause missing-module errors in production.

## Prefer Node Built-Ins

Check whether the Node.js standard library already provides what you need before reaching for an npm
package. Common built-in replacements:

| Need | Built-in |
|---|---|
| File I/O | `node:fs`, `node:fs/promises` |
| Paths | `node:path` |
| Crypto / random | `node:crypto` |
| HTTP client | global `fetch` (Node 18+) |
| Streams | `node:stream`, `node:stream/promises` |
| Deep clone | `structuredClone` |
| Cancellation | `AbortController` / `AbortSignal` |
| URL parsing | `URL` / `URLSearchParams` |
| Assertions | `node:assert` |

If a built-in covers ≥ 80% of the use case, prefer it. Adding a dependency for a single utility
function is usually not worth the maintenance, security, and bundle cost.

## Vet Before Adding

Before adding any package, confirm:

1. **Actively maintained** — recent releases, issues addressed, not archived.
2. **CVEs** — run `npm audit` after adding; check the advisory database.
3. **Types** — does the package bundle `.d.ts` declarations? If not, does `@types/<pkg>` exist? If
   neither exists, adding the package requires ambient declarations or `any` casts.
4. **ESM / CJS compatibility** — does the package's `exports` map support your module system?
5. **Transitive footprint** — `npm install <pkg> --dry-run` to preview what else gets added.
6. **License** — MIT/Apache/BSD are typically acceptable; GPL/AGPL require legal review for
   commercial projects; unlicensed packages are a risk.

See `/ts-add-package` to run the vet-and-wire flow interactively.

## Remove Unused Dependencies

Audit with `depcheck` or `knip` after deleting code that used an import. Remove the package from
`package.json` and run `npm install` to update the lockfile. Dead entries in `package.json` add
install time, audit surface, and signal-to-noise ratio problems in reviews.

## Dependency Updates

Keep dependencies current. Automated update PRs (Dependabot, Renovate) that run the full test suite
are the lowest-friction path. Never merge a dependency update without running the project's full
quality gate — discover it from `package.json` scripts (`check`/`validate`/`ci`), or fall back to
type-check + lint + `scripts.test` (whatever runner that resolves to; never assume Vitest
specifically). A major-version bump is a code-change opportunity, not just a version bump — read
the migration guide before merging.

### npm (TypeScript)

## Lockfile Integrity

Commit `package-lock.json` in every project. It records the exact version, resolved URL, and
integrity hash of every transitive dependency — the only guarantee that all environments install the
same graph.

- **CI must use `npm ci`**, not `npm install` — it installs from the lockfile and exits non-zero if
  `package.json` and `package-lock.json` are out of sync.
- Never hand-edit the lockfile. Regenerate it by running `npm install`.
- Do not add `package-lock.json` to `.gitignore`. If you see it there, remove the entry.

## Vulnerability Scanning

Run `npm audit` as part of the CI quality gate:

```bash
npm audit --omit=dev   # audit runtime deps only; fail on any severity
npm audit              # include devDeps; acceptable to warn-only on High/Critical in dev tools
```

Triage findings before marking them as acceptable. An audited-and-ignored vulnerability is preferable
to an unaudited one — document the justification in `package.json` under `"overrides"` with a comment
or in a dedicated `SECURITY.md` entry.

For additional coverage, run `osv-scanner` (Google's open-source OSV scanner) against the lockfile —
it cross-references multiple advisory databases and catches findings that `npm audit` misses.

## Transitive Pinning with `overrides`

When a transitive dependency has a known vulnerability but the direct dependency has not yet released
a fix, use `overrides` to force a safe version:

```json
{
  "overrides": {
    "vulnerable-dep": ">=2.0.1"
  }
}
```

Document why in a comment in `package.json` (JSON does not allow comments — put the justification in
`SECURITY.md` or a PR description), and remove the override once the direct dependency ships the fix.

## Node Version Constraint

Specify the minimum supported Node.js version in `package.json` under `"engines"`:

```json
{
  "engines": {
    "node": ">=20.0.0"
  }
}
```

Use `nvm` / `fnm` with a `.nvmrc` or `.node-version` file for local version pinning. CI should
enforce `engines.node` via `npm install --engine-strict` or a `check-engines` pre-step.

## Lifecycle-Script Risk

`postinstall`, `prepare`, and other npm lifecycle scripts run automatically during `npm install`.
A malicious or compromised package can use these to exfiltrate environment variables, install
backdoors, or run arbitrary code.

Before adding any package with lifecycle scripts:
1. Read the script — `npm pack <pkg>` and inspect `scripts` in the extracted `package.json`.
2. Evaluate whether the script is necessary for the package to function.
3. For CI or automated installs where scripts are not needed, use:
   ```bash
   npm install --ignore-scripts
   ```
   and run required build scripts explicitly.

Flag any new devDependency that adds a `postinstall` script for team review.

## `.npmrc` Token Hygiene

Never commit authentication tokens to `.npmrc`. Use environment-variable substitution:

```ini
# .npmrc (committed)
@myorg:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NPM_TOKEN}
```

The `${NPM_TOKEN}` placeholder is expanded at install time from the environment — the literal token
never appears in the file. Add `.npmrc.local` (with actual tokens) to `.gitignore`.

Scope registries narrowly — only packages under the `@myorg` scope go to the private registry;
everything else resolves from the public registry. This prevents dependency-confusion attacks where
a private package name could be hijacked on the public registry.

## Publishing Hygiene

Before publishing a package:

1. **Declare `files`** — only ship what consumers need:
   ```json
   { "files": ["dist", "README.md", "LICENSE"] }
   ```
2. **Declare `exports`** — an explicit exports map prevents consumers from importing internal paths:
   ```json
   {
     "exports": {
       ".": { "import": "./dist/index.js", "types": "./dist/index.d.ts" },
       "./utils": { "import": "./dist/utils.js", "types": "./dist/utils.d.ts" }
     }
   }
   ```
3. **Validate before publishing:**
   ```bash
   npm pack --dry-run              # inspect what would be uploaded
   npx publint                    # check exports map correctness
   npx @arethetypesright/cli      # verify ESM/CJS type resolution is correct
   ```
4. **Run `prepublishOnly` gate** — add to `package.json` scripts, chaining the type checker, the
   linter, and the project's own `test` script (never hardcode a specific runner):
   ```json
   { "prepublishOnly": "tsc --noEmit && eslint . && npm test" }
   ```
5. **Publish with provenance** (npm 9.5+, GitHub Actions):
   ```bash
   npm publish --provenance
   ```
   Provenance links the published package to the specific CI workflow run and source commit —
   consumers can verify the package was built from your repo.

## Never

- API keys or tokens as plain text in `.npmrc` committed to the repo.
- `"*"` in version specifiers for published packages (use exact versions in `dependencies`).
- Publishing without a `prepublishOnly` gate.
- `npm install` in CI (use `npm ci`).
