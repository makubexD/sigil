# Build, CI, and Release

Recipes for catalog maintainers: building and linking a local checkout, running the CI gate,
inspecting build output, and cutting a release.

---

## Build and link

From a clone:

```bash
git clone <repo-url>
cd sigil
npm install
npm run build          # clean, tsc -p tsconfig.build.json, regenerate schema/*.schema.json and docs/reference/capabilities.md
npm run validate       # schema + reference-graph integrity
npm run catalog:build  # compile catalog source → dist/claude/ and dist/copilot/
npm test               # pretest builds, then node --test
npm run check          # lint && format:check && check-doc-comments && test
npm link               # one-time: global `sigil` symlink onto dist-cli/cli.js
```

**Heap-size:** `tsc` OOMs at the default 4 GB V8 heap (Zod's recursive generics force deep
type-inference). `npm run build` sets `NODE_OPTIONS=--max-old-space-size=8192` automatically via
`cross-env`. If you invoke `tsc` directly (for example `npm run build:watch`), prefix it yourself.

**Tests:** `pretest` runs `npm run build` and `npm run build:test` (`tsc -p tsconfig.test.json`,
output `test-compiled/`). `npm test` runs `node --test` on `test-compiled/**/*.test.js`, so a manual
build is not required before `npm test`. `test/` is excluded from `tsconfig.build.json`; the compiled
tests import from `../dist-cli/…`. `npm run check` does not run `tsc --noEmit` — type errors in
`src/` still fail because `pretest` compiles with `tsc -p tsconfig.build.json`.

**CLI:** `npm link` points the global `sigil` command at `dist-cli/cli.js` by path, so it survives
rebuilds. `npm unlink -g sigil` removes it. Without a link, use `npm run sigil -- <args>`.

---

## Validation as a CI gate

`validate` exits non-zero on any schema error, dangling `extends`/`uses` reference, or cycle.

`.github/workflows/ci.yml` runs on every pull request and on pushes to `master`. The job matrix
is `ubuntu-latest` / Node 22 and `windows-latest` / Node 20. Each job runs, in order:
`npm ci`, `npm audit --omit=dev`, `npm run lint`, `npm run format:check`, `npm run build`,
`npm run validate`, `node dist-cli/cli.js sync --check`, `npm test`, `npm run catalog:build`,
then a smoke check of `node dist-cli/cli.js --version` and `node dist-cli/cli.js list`.

```yaml
# .github/workflows/ci.yml — validate step (the job also builds, lints, and tests; see the file)
- name: Validate catalog
  run: npm run validate
```

**Test that the gate works** — temporarily break a reference:

```bash
# In a SKILL.md, point uses.rules at an id that is not in the catalog:
#   uses:
#     rules: [csharp/does-not-exist]

sigil validate
```

Captured from `sigil validate` against a one-skill catalog with that broken `uses.rules` (the
agent line is the same run: `csharp/cs-code-reviewer` was not in that catalog either). The path
under each error is the artifact file. Exit code 1.

```text
Validating catalog at: <catalog-dir>
✗ 2 error(s) found.
  ✗  [csharp/cs-generate-tests] Dangling uses.rules reference: 'csharp/does-not-exist' does not exist in the catalog
     <catalog-dir>/languages/csharp/skills/cs-generate-tests/SKILL.md
  ✗  [csharp/cs-generate-tests] Dangling uses.agents reference: 'csharp/cs-code-reviewer' does not exist in the catalog
     <catalog-dir>/languages/csharp/skills/cs-generate-tests/SKILL.md
```

Cycle detection: if rule A `extends` B and B `extends` A, validate reports a cycle error.

---

## Template-drift gate (`sigil sync --check`)

`sigil sync --check` is a CI gate with three failure conditions: template drift (an artifact
still built against a stale template revision), conformance errors, and stale docs. Superseded-spec
notices and conformance warnings are printed and do not fail the gate. CI runs it with no
`--changed-since` filter:

```yaml
# .github/workflows/ci.yml
- name: Check template drift + catalog conformance + provider-doc staleness
  run: node dist-cli/cli.js sync --check
```

`--changed-since <git-ref>` is an optional local narrowing of template drift. The CI job does not
pass it. Run `sigil sync` (no flags) locally to see the same report without failing the build, and
`sigil sync --apply` to write the mechanical fixes before pushing — see
`docs/guides/authoring.md` § Keeping artifacts in sync with their template.

---

## Build both targets and inspect output

```bash
# Build all targets at once
sigil build --target all
# → dist/claude/ and dist/copilot/

# Build a single target
sigil build --target claude
sigil build --target copilot

# Inspect generated output
ls dist/claude/plugins/dotnet-tooling/skills/cs-generate-tests/
# SKILL.md

# Verify rule bodies are inlined in the plugin SKILL.md
grep "Applied Rules" dist/claude/plugins/dotnet-tooling/skills/cs-generate-tests/SKILL.md
# ## Applied Rules

# Verify plugin.json carries the package version
cat dist/claude/plugins/dotnet-tooling/.claude-plugin/plugin.json
# { "name": "dotnet-tooling", "version": "0.1.0", … }

# Regenerate JSON Schemas from zod (runs automatically as part of npm run build)
node dist-cli/schema/emit.js
# ✓ schema/skill.schema.json
# ✓ schema/agent.schema.json
# …
```

---

## Live-prompt check (manual, costs money)

The tests above prove that the emitted files are right. `docs/audits/2026-09-27/tools/live-probe.js`
checks that Claude Code and Copilot CLI actually use them. For each combination in
`docs/audits/2026-09-27/campaign.json` it wipes the directory in the `PROBE_TARGET` environment
variable, installs the combination, copies in a legacy fixture, and sends real prompts. It
then records whether each skill triggered, the right agent was dispatched, rules loaded only for
their own files and changed the code, the hook blocked, the setting granted access, and the MCP
server connected. Every probe is a real model call, so this is never part of `npm test`.

```bash
node docs/audits/2026-09-27/tools/live-probe.js --dry                        # set up fixtures only, no model calls
node docs/audits/2026-09-27/tools/live-probe.js --provider claude --only K1:P7 --max-usd 2
node docs/audits/2026-09-27/tools/live-probe.js --only K2:P2,K2:P3 --repeat 3  # k/3 pass rate, no retries
node docs/audits/2026-09-27/tools/live-probe-report.js                      # → docs/audits/2026-09-27/live-probe-report.md
```

---

## Release a new version (`sigil release`)

`sigil release` automates the full release lifecycle — no manual version editing, no forgotten
rebuilds, no missing CHANGELOG entry.

```bash
# Inside the catalog repo, with a clean working tree
sigil release patch          # 0.1.0 → 0.1.1
sigil release minor          # 0.1.0 → 0.2.0
sigil release major          # 0.1.0 → 1.0.0
sigil release 0.2.1          # explicit version

sigil release patch --dry-run    # preview every step without writing anything
sigil release patch --no-verify  # skip build/validate/test gate (escape hatch)
```

**What the command does (in order):**

1. **Compute version** — bumps the level you specified. Omitting the level means `patch`. An
   explicit `x.y.z` is used as given. This runs even for `--dry-run`.
2. **Preflight** — skipped for `--dry-run`. Otherwise verifies a clean git working tree; warns if
   not on `master`/`main` and continues.
3. **Confirm** — prompts only in an interactive TTY when `--yes` was not passed. `--yes`, or no TTY,
   proceeds without a prompt. (The command's help text calls `--yes` required off a TTY; the
   implementation does not enforce that.) `--dry-run` returns before this prompt.
4. **Write version** — updates `package.json` and `package-lock.json`
5. **Verify gate** — runs `npm run build && npm run validate && npm test && npm run catalog:build`
   unless `--no-verify` is set. That flag skips the gate only; the version write and the commit
   still happen. The gate regenerates `dist/**/plugin.json` with the new version. `dist/` is
   gitignored, so that output is not what gets committed.
6. **Promote CHANGELOG** — renames `## [Unreleased]` to `## [x.y.z] - YYYY-MM-DD`, inserts a fresh
   `## [Unreleased]` above it. This runs after the gate, so a failed gate does not rewrite
   CHANGELOG.
7. **Commit + tag** — stages only `package.json`, `package-lock.json` when it exists, and
   `CHANGELOG.md` when it exists. `git commit -m "release: vX.Y.Z"` and `git tag vX.Y.Z`.
   **Does not push.** Schema JSON and `docs/reference/capabilities.md` are not staged, even if
   the gate regenerated them.

**After the command:**

```bash
git push && git push --tags
# → triggers .github/workflows/release.yml → npm publish --provenance (OIDC Trusted Publishing)
```

---

> **Troubleshooting release failures** → [reference/troubleshooting.md](../reference/troubleshooting.md#sigil-release-fails-at-the-verify-gate)
> **CI workflow source** → [.github/workflows/ci.yml](../../.github/workflows/ci.yml)
> **Release workflow source** → [.github/workflows/release.yml](../../.github/workflows/release.yml)
> **Version history** → [CHANGELOG.md](../../CHANGELOG.md)
