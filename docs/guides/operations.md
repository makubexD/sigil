# Build, CI, and Release

Recipes for working on a local checkout of sigil: building and invoking it, the CI gate, inspecting
build output, and cutting a release. If you are only installing artifacts into your own project, you
want [consuming.md](consuming.md) instead.

---

## Build and link

This is the one canonical copy of the build and invocation steps. Other docs link here.

**Prerequisites:** Node.js `>=20.19.0` (the `engines` floor; CI tests Node 22 and Node 20), npm, and git.

```bash
git clone https://github.com/makubexD/sigil.git
cd sigil
npm install
npm run build
```

`npm run build` cleans `dist-cli/` and `test-compiled/`, compiles `src/` with
`tsc -p tsconfig.build.json`, and regenerates `schema/*.schema.json` and
`docs/reference/capabilities.md`. It sets `NODE_OPTIONS=--max-old-space-size=8192` itself through
`cross-env` (the compiler needs more than the default V8 heap), so you never set it by hand.
`npm run build:watch` sets it too.

### Three ways to run `sigil`

| Invocation                        | Use when                                                            |
| --------------------------------- | ------------------------------------------------------------------- |
| `npm link`, then `sigil <args>`   | You work on sigil and use it in other projects. Run `npm link` once |
| `node <abs-path>/dist-cli/cli.js` | You want no global install, or a script that pins one checkout      |
| `npm run sigil -- <args>`         | Quick runs from inside the sigil clone                              |

- **`npm link`** points the global `sigil` command at `dist-cli/cli.js` by path, so it survives
  rebuilds. `npm unlink -g sigil` removes it.
- **`node <abs-path>/dist-cli/cli.js`** works from any directory, for example
  `node C:\src\sigil\dist-cli\cli.js add all --yes`.
- **`npm run sigil -- <args>`** runs with the sigil package directory as the working directory, and
  nothing in `src/` reads `INIT_CWD`. So `--project-dir` defaults to the sigil repo itself, not the
  directory you typed the command in. Pass `--project-dir <abs-path>` when you target another project.
- **Flags need a `--` first.** `npm run sigil -- --help` prints sigil's help; `npm run sigil --help`
  prints npm's. Commands without flags (`npm run sigil help`, `npm run sigil list`) work either way.

The catalog always resolves from the package (`PKG_ROOT`), never from the current directory, so every
invocation above sees the same catalog.

### Windows and PowerShell

The npm scripts work unchanged in PowerShell and cmd, because `cross-env` handles the heap flag. Only
matters if you run `tsc` or `node` yourself:

```powershell
$env:NODE_OPTIONS = "--max-old-space-size=8192"; npx tsc -p tsconfig.build.json
# or, in any shell:
npx cross-env NODE_OPTIONS=--max-old-space-size=8192 tsc -p tsconfig.build.json
```

POSIX shells accept `NODE_OPTIONS=--max-old-space-size=8192 npx tsc -p tsconfig.build.json`.

### Tests and `pretest`

`npm test` runs the `pretest` script first: `npm run build` (refreshes `dist-cli/`) and
`npm run build:test` (`tsc -p tsconfig.test.json`, output `test-compiled/`). The compiled tests import
from `../dist-cli/…`, not from `src/`, which is why the build must come first. Because `pretest`
compiles `src/`, type errors there fail `npm test`. To run a single test file, see
[CONTRIBUTING.md](../../CONTRIBUTING.md#testing).

`npm run test:built` compiles only the tests and runs them, with no `npm run build` first. It assumes
`dist-cli/` is current, so CI and `ci:local` use it right after their own Build step (that saved the duplicate
build, about 10 s on Windows). Anywhere else, use `npm test`, which works alone on a clean checkout.

`scripts/run-tests.cjs` runs one test file per CPU (`SIGIL_TEST_CONCURRENCY=<n>` overrides) and prints coverage
unless `SIGIL_TEST_COVERAGE=0`, which the CI test step sets.

The runner also preloads `scripts/quiet-console.cjs`, which silences `console.log`, `console.info` and
`console.debug` in every test process. Under `node --test` those calls share a pipe with the runner's own
messages, and on Node 20 stray text can corrupt them ("Unable to deserialize cloned data"). Set
`SIGIL_TEST_OUTPUT=1` to see the output while debugging.

---

## CI

`.github/workflows/ci.yml` runs on every pull request and on pushes to `master`. The matrix is
`ubuntu-latest` / Node 22 and `windows-latest` / Node 20. Each matrix job runs these steps, in order:

1. `npm ci`
2. `npm audit --omit=dev` (runtime dependencies, fails on any severity)
3. `npm run lint` and `npm run format:check`, run side by side by `scripts/run-parallel.cjs` (both only
   read files; each one's output is grouped, and a failure in one does not hide the other)
4. `npm run build`
5. `npm run validate`
6. `node dist-cli/cli.js sync --check`
7. `npm run test:built` (the build just ran, so `npm test`'s `pretest` would repeat it)
8. `npm run catalog:build`
9. Smoke test: `node dist-cli/cli.js --version` and `node dist-cli/cli.js list`

A separate Linux job, **Claude plugin validation**, installs a pinned Claude Code CLI and runs
`npm run validate:claude-plugins`: `claude plugin validate --strict` over `dist/claude` (the
marketplace) and every plugin, so warnings fail too. It needs no login and uses no secrets. The CLI
version is pinned once, in `package.json` (`config.claudeCodeVersion`); `ci.yml` and `release.yml`
both install that version. GitHub Actions are pinned to full commit SHAs (the tag in a comment).

**Run the same thing locally before you push.** `npm run ci:local` chains every step above (except
`npm ci`) in the same order, plus the plugin validation, which it skips with a notice when `claude`
is not on PATH. It is the full local equivalent of CI.

`npm run check` is a faster **subset**: lint, format check, `check-doc-comments`, and tests. It skips
the audit, `validate`, `sync --check`, `catalog:build`, and the smoke test, so a green `check` does not
mean a green CI.

### What the gates catch

- **`validate`** exits non-zero on any schema error, dangling `extends` / `uses` reference, or
  cycle. Example, with a skill whose `uses.rules` names a rule that does not exist (exit code 1; the
  path under each error is the artifact file):

  ```text
  Validating catalog at: <catalog-dir>
  ✗ 2 error(s) found.
    ✗  [csharp/cs-generate-tests] Dangling uses.rules reference: 'csharp/does-not-exist' does not exist in the catalog
       <catalog-dir>/languages/csharp/skills/cs-generate-tests/SKILL.md
    ✗  [csharp/cs-generate-tests] Dangling uses.agents reference: 'csharp/cs-code-reviewer' does not exist in the catalog
       <catalog-dir>/languages/csharp/skills/cs-generate-tests/SKILL.md
  ```

  If rule A `extends` B and B `extends` A, `validate` reports a cycle error. Per-error fixes:
  [troubleshooting](../reference/troubleshooting.md#sigil-validate--sigil-check-report-violations).

- **`sync --check`** fails on three things: an artifact built against a stale template revision,
  conformance errors, and stale provider docs. Superseded-spec notices and conformance warnings print
  but do not fail it. CI runs it without `--changed-since`. Run `sigil sync` (no flags) locally for the
  same report, and `sigil sync --apply` for the mechanical fixes. How to fix drift:
  [authoring.md](authoring.md#keeping-artifacts-in-sync-with-their-template). How the conformance
  engine works: [architecture.md](../reference/architecture.md).

---

## Build every target and inspect output

```bash
sigil build --target all       # dist/claude/, dist/copilot/ and dist/agents-standard/
sigil build --target claude    # a single target
sigil build --target copilot

# Inspect
ls dist/claude/plugins/dotnet-tooling/skills/cs-generate-tests/                       # SKILL.md
grep "Applied Rules" dist/claude/plugins/dotnet-tooling/skills/cs-generate-tests/SKILL.md
cat dist/claude/plugins/dotnet-tooling/.claude-plugin/plugin.json                     # version = package version

# Regenerate JSON Schemas from the zod source (also part of npm run build)
node dist-cli/schema/emit.js
```

To install the Claude output as a plugin, see the plugin section of
[consuming.md](consuming.md#install-a-pack-as-a-claude-plugin).

---

## Live-prompt check (manual, costs money)

The tests prove the emitted files are right. A separate maintainer tool checks that Claude Code and
Copilot CLI actually use them. It is manual, makes real (paid) model calls, and is never part of
`npm test` or CI.

It lives at `docs/audits/2026-09-27/tools/` on purpose: it reads that audit snapshot's `campaign.json`,
`fixtures/` and `results/`, so it was not moved. For each campaign entry (a fixture `K<n>` plus one
prompt `P<n>`, such as `K1:P7`) it wipes the folder in `PROBE_TARGET` (default
`C:\WorkspaceMaku\TestCaI`; it refuses to wipe any other folder name unless `PROBE_TARGET` is set),
installs the artifacts, copies in a legacy fixture, sends real prompts, and records whether skills
triggered, agents were dispatched, rules loaded, and hooks, settings and MCP servers took effect.

```bash
node docs/audits/2026-09-27/tools/live-probe.js --dry                       # build fixtures only, no model calls
node docs/audits/2026-09-27/tools/live-probe.js --provider claude --only K1:P7 --max-usd 2
node docs/audits/2026-09-27/tools/live-probe.js --only K2:P2,K2:P3 --repeat 3   # k/3 pass rate, no retries
node docs/audits/2026-09-27/tools/live-probe-report.js                      # writes docs/audits/2026-09-27/live-probe-report.md
```

---

## Release a new version (`sigil release`)

`sigil release` bumps the version, runs a gate, promotes the CHANGELOG, then commits and tags.

```bash
# Inside the sigil repo, with a clean working tree
sigil release patch          # 0.1.0 → 0.1.1
sigil release minor          # 0.1.0 → 0.2.0
sigil release major          # 0.1.0 → 1.0.0
sigil release 0.2.1          # explicit version

sigil release patch --dry-run    # preview every step without writing anything
sigil release patch --no-verify  # skip the release gate, npm run ci:local (escape hatch)
```

**What it does, in order:**

1. **Compute version.** Bumps the level you gave (default `patch`); an explicit `x.y.z` is used as
   given. Runs even for `--dry-run`.
2. **Preflight.** Skipped for `--dry-run`. Otherwise verifies a clean git working tree, and warns
   (then continues) when not on `master` / `main`.
3. **Confirm.** Prompts only in an interactive TTY when `--yes` was not passed. `--yes`, or no TTY,
   proceeds without a prompt. (The help text calls `--yes` required off a TTY; the implementation does
   not enforce that.) `--dry-run` returns before this prompt.
4. **Write version** to `package.json` and `package-lock.json`.
5. **Verify gate.** Runs `npm run ci:local`, the full CI mirror (`RELEASE_GATE` in
   `src/commands/release.ts`), unless `--no-verify` is set. Step 1 already requires a clean working
   tree, so stash any untracked scratch files first; the format check reads them too. That flag skips only the gate; the version write and the commit still
   happen. `dist/` is gitignored, so the plugin.json files the gate regenerates are not committed.
6. **Promote CHANGELOG.** Renames `## [Unreleased]` to `## [x.y.z] - YYYY-MM-DD` and inserts a fresh
   `## [Unreleased]` above it. This runs after the gate, so a failed gate leaves CHANGELOG alone.
7. **Commit and tag.** Stages only `package.json`, `package-lock.json` (if present) and
   `CHANGELOG.md` (if present), then `git commit -m "release: vX.Y.Z"` and `git tag vX.Y.Z`.
   **It does not push.** Regenerated schema JSON and `docs/reference/capabilities.md` are not staged.

Then push:

```bash
git push && git push --tags
```

Pushing a `v*.*.*` tag triggers `.github/workflows/release.yml`, which runs `npm ci`, installs the
pinned Claude Code CLI, runs `npm run ci:local` (the same gate as CI), and then
`npm publish --provenance --access public` using npm OIDC Trusted Publishing (no stored token).

> **The release gate is the CI gate.** `sigil release` and `release.yml` both run `npm run ci:local`,
> so a release can't pass a narrower check than a pull request (`test/workflows.test.ts` guards this).
> Two differences remain. Locally, the Claude plugin validation is skipped when the `claude` CLI is not
> installed (CI always runs it). And because `release.yml` runs `npm audit` after the tag is pushed, an
> advisory published in between blocks the publish of that tag: fix it and release a new version.

### One-time npm setup (before the first automated release)

OIDC publishing does not work until the package exists on npm and is linked to this workflow:

1. **Publish the first version manually** from a maintainer's machine: `npm publish --access public`.
   The package must already exist on npmjs.com before a Trusted Publisher can be attached.
2. On npmjs.com, open the package, then **Publishing → Trusted Publishers**, and add: repository
   `makubexD/sigil`, workflow `release.yml`, environment left blank.

After that, tag pushes publish automatically. If OIDC cannot be configured, the comment in
`release.yml` describes a fallback that publishes with an `NPM_TOKEN` secret instead.

---

> **Release failures** → [troubleshooting](../reference/troubleshooting.md#sigil-release-fails-at-the-verify-gate)
> **CI workflow** → [ci.yml](../../.github/workflows/ci.yml) · **Release workflow** → [release.yml](../../.github/workflows/release.yml)
> **Version history** → [CHANGELOG.md](../../CHANGELOG.md)
