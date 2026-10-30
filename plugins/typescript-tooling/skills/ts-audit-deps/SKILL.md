---
name: ts-audit-deps
description: "Audit npm dependencies — known CVEs, outdated versions, deprecated packages, unused references, and license compliance (TypeScript)"
when_to_use: "Use before releases, when adding new dependencies, or as a periodic maintenance check — or when the user asks \"are my dependencies up to date\", \"any known CVEs\", \"audit my deps\", or \"check for outdated packages\". Produces a read-only report; no dependency changes are made. Complements ts-security-auditor, which handles code-level (not dependency-level) vulnerabilities."
allowed-tools: Read, Bash, Glob, Grep
argument-hint: "(no arguments)"
context: fork
---

# Audit Dependencies

This skill produces a **read-only npm dependency health report** — it makes no changes. To act on
findings, use `/ts-add-package` to add or update a package, or remove unused deps from `package.json`
manually and run `npm install`.

## Step 1 — Discover dependency manifest

Identify all dependency sources:
- `package.json` — direct `dependencies`, `devDependencies`, `peerDependencies`, `optionalDependencies`.
- `package-lock.json` — resolved transitive graph (if present).
- Workspaces: if `package.json` declares `workspaces`, collect `package.json` from each workspace
  member and report per-workspace counts.

Summarize:
- Total direct runtime dependencies (name + version).
- Total direct dev/test dependencies.
- Total transitive dependency count (from lock file if available).
- Node.js version constraint from `"engines"`.

## Step 2 — Run available tooling

Run all available commands; skip gracefully if not installed:

```bash
# CVE / vulnerability scan (built into npm)
npm audit --omit=dev 2>&1
npm audit 2>&1

# Outdated versions
npm outdated 2>&1

# Unused dependencies (if depcheck is installed)
npx depcheck 2>&1 || echo "depcheck not installed"

# Unused / stale exports (if knip is installed)
npx knip 2>&1 || echo "knip not installed"

# License compliance (if license-checker is installed)
npx license-checker --summary 2>&1 || echo "license-checker not installed"
```

Include all output verbatim in the "Tooling" section.

## Step 3 — Manual review

For each direct runtime dependency not already flagged by tooling, check: version pinned in the
lock file (and is the lock file committed?); maintenance status (last release, open critical
issues, archived/deprecated on npm); transitive footprint (could a Node built-in replace it?);
types availability (bundled `.d.ts` or `@types/*` — missing types force `any` casts, flag as a
risk); ESM/CJS compatibility with the project's module system; and CVEs in the past 12 months.

## Step 4 — Report

```
## Dependency Audit Report

Manifest: package.json  <workspace member list if applicable>
Node.js version: <from engines or .nvmrc>
Direct runtime deps: <N>
Direct dev/test deps: <N>
Transitive deps: <N from lock file>  /  "lock file not present"
Lock file: <committed / missing>

### CVEs / Security vulnerabilities
<npm audit output, or "no vulnerabilities detected">

### Outdated packages
<npm outdated output, or "all up to date">

### Unused dependencies
<depcheck / knip output, or "tool not installed — manual review needed">

### License compliance
<license-checker summary, or "tool not installed — manual review needed">

### Manual findings

#### High
- `<package>@<version>` — <issue>. **Recommendation:** <action>.

#### Medium
- …

#### Low
- …

### Summary
<N> high issues requiring immediate action.
<N> medium issues recommended before next release.
<N> low / informational notes.
```

Omit tiers with no findings.

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

### Security (TypeScript)

## Secrets and Credentials

Never embed secrets, API keys, tokens, passwords, or connection strings in source code, config files
committed to the repo, log messages, exceptions, or `toString()` / `JSON.stringify()` output.

Read secrets from environment variables or a secrets manager at startup:

```typescript
// Correct — read from env, fail fast with a clear message
const apiToken = process.env.API_TOKEN;
if (!apiToken) throw new Error("API_TOKEN environment variable is required");

// Avoid — hardcoded fallback makes the "missing" state silently use a real secret
const apiToken = process.env.API_TOKEN ?? "dev-token-1234";
```

Document required environment variables in `.env.example` with placeholder values only (never real
values). Never commit `.env` files — add them to `.gitignore`. See `ts-git` for the full history
hygiene invariant.

## Shell Injection

Never build shell commands by concatenating or interpolating untrusted input. Use
`child_process.execFile` or `child_process.spawn` with an argument array — they do not invoke a shell:

```typescript
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const execFileAsync = promisify(execFile);

// Correct — argument array, no shell
const { stdout } = await execFileAsync("git", ["log", "--oneline", branch]);

// Avoid — shell interpolation, command injection
const { stdout } = await exec(`git log --oneline ${branch}`);  // branch could be "; rm -rf /"
```

Avoid `child_process.exec` and `child_process.execSync` with any untrusted input, and never pass
`shell: true` to `spawn` with dynamic arguments.

## Path Traversal

Validate user-supplied paths against an allowed root before using them. Resolve the path first —
relative components (`../`) are expanded — then assert it starts with the allowed prefix:

```typescript
import path from "node:path";

function safeReadFile(userPath: string, allowedRoot: string): string {
  const resolved = path.resolve(allowedRoot, userPath);
  if (!resolved.startsWith(path.resolve(allowedRoot) + path.sep)) {
    throw new Error(`Path traversal attempt: ${userPath}`);
  }
  return fs.readFileSync(resolved, "utf8");
}
```

## Unsafe Deserialization and Untrusted Input

Never use `eval`, `new Function(code)`, or `vm.runInNewContext` on data from external sources.
`JSON.parse` is safe for data, but validate the parsed shape with a schema library (zod, valibot,
arktype) before consuming it as a typed object — `JSON.parse` returns `any` and bypasses all
compile-time checks:

```typescript
import { z } from "zod";

const EventSchema = z.object({ id: z.string(), start: z.string() });

const parsed = EventSchema.parse(JSON.parse(rawBody)); // throws ZodError on invalid shape
```

Never deserialize untrusted YAML with a schema that constructs JavaScript types (functions,
regexps). `js-yaml` 4+ `yaml.load(input)` is safe by default; on 3.x the default `load` is not, so
upgrade. Pass `{ schema: yaml.JSON_SCHEMA }` when only JSON-compatible values are expected.

## Prototype Pollution

Guard object-merging and property-setting operations against `__proto__`, `constructor`, and
`prototype` key injection — these can poison the prototype chain and affect all objects in the
process:

```typescript
// Correct — Object.create(null) gives a prototype-free map; or check for forbidden keys
function safeMerge<T extends object>(target: T, source: Record<string, unknown>): T {
  for (const key of Object.keys(source)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
    (target as Record<string, unknown>)[key] = source[key];
  }
  return target;
}
```

When building lookup maps from external data, use `Object.create(null)` rather than `{}` to avoid
inheriting `Object.prototype` properties.

## Secure Randomness

Use `crypto.randomBytes` / `crypto.randomUUID` (Node built-in) for security-sensitive values:
session IDs, CSRF tokens, API keys, nonces. `Math.random()` is not cryptographically secure and
must not be used for any secret or identifier.

```typescript
import { randomBytes, randomUUID } from "node:crypto";

const sessionId = randomUUID();                   // 128-bit random UUID
const token = randomBytes(32).toString("hex");    // 256-bit hex token
```

## Timing-Safe Comparison

Compare secrets, HMACs, and tokens with `crypto.timingSafeEqual` — a byte-by-byte constant-time
comparison. Normal `===` short-circuits on the first differing byte, leaking timing information
that can be used to reconstruct secrets:

```typescript
import { timingSafeEqual, createHmac } from "node:crypto";

function verifyHmac(payload: Buffer, receivedSig: string, secret: string): boolean {
  const expected = createHmac("sha256", secret).update(payload).digest();
  const received = Buffer.from(receivedSig, "hex");
  if (expected.length !== received.length) return false;
  return timingSafeEqual(expected, received);
}
```

## Network I/O

Always set a request timeout. Use `AbortSignal.timeout(ms)` (Node 18+) or an `AbortController`
with `clearTimeout` to prevent requests from hanging indefinitely:

```typescript
const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
```

Never disable TLS certificate verification (`rejectUnauthorized: false`) outside of local test
environments, and never leave it in production code without a documented justification guarded by
an environment variable.

Allowlist redirect targets and outbound URLs when a service makes requests on behalf of user input
(SSRF). Where a block list is unavoidable, check the resolved address, not the hostname, and connect
to that address so a re-resolution cannot swap it. Reject private IP ranges: loopback, `10.x`,
`172.16-31.x`, `192.168.x`, link-local `169.254.x` (cloud metadata), `0.0.0.0`, and their IPv6
equivalents. Reject non-HTTP/HTTPS schemes unless explicitly required.
