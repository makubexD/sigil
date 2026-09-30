# Build, CI, and Release

Recipes for catalog maintainers: running the CI gate, inspecting build output, and cutting a release.

---

## Validation as a CI gate

`validate` exits non-zero on any schema error, dangling `extends`/`uses` reference, or cycle.

```yaml
# .github/workflows/ci.yml (example)
- name: Validate catalog
  run: |
    npm ci
    npm run build
    npm run validate
```

**Test that the gate works** — temporarily break a reference:

```bash
# In any SKILL.md, add a non-existent rule:
#   uses:
#     rules: [csharp/does-not-exist]

sigil validate
# ✗  [csharp/cs-generate-tests] uses.rules references unknown artifact 'csharp/does-not-exist'
# ✗ 1 error(s) found.
# exit code 1
```

Cycle detection: if rule A `extends` B and B `extends` A, validate reports a cycle error.

---

## Template-drift gate (`sigil sync --check`)

`sigil sync --check` catches a template edited without its dependent artifacts being propagated —
add it as a second gate alongside `validate`, scoped to the current PR's diff:

```yaml
# .github/workflows/ci.yml (example)
- name: Check template propagation
  run: |
    npm ci
    npm run build
    node dist-cli/cli.js sync --check --changed-since origin/main
```

Exits non-zero and names every artifact still built against a stale template revision. Run
`sigil sync` (no flags) locally to see the same report without failing the build, and
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
`docs/audits/2026-09-27/campaign.json` it wipes the target folder (`C:\WorkspaceMaku\TestCaI`, or
`PROBE_TARGET`), installs the combination, copies in a legacy fixture, and sends real prompts. It
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

1. **Preflight** — verifies a clean git working tree; warns if not on `master`/`main`
2. **Compute version** — bumps the level you specified (or validates an explicit `x.y.z`)
3. **Write version** — updates `package.json` and `package-lock.json`
4. **Verify gate** — runs `npm run build && npm run validate && npm test && npm run catalog:build`;
   the rebuild regenerates `dist/**/plugin.json` with the new version
5. **Promote CHANGELOG** — renames `## [Unreleased]` to `## [x.y.z] - YYYY-MM-DD`, inserts a fresh
   `## [Unreleased]` above it
6. **Commit + tag** — `git commit -m "release: vX"` and `git tag vX.Y.Z`. **Does not push.**

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
