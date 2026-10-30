# Plan: publish the Claude marketplace from CI

Source: [docs/ideas/publish-claude-marketplace.md](ideas/publish-claude-marketplace.md), ADR
[distribution-channels-2026-09](decisions/distribution-channels-2026-09.md) § 6, Phase 0 (deterministic output) and Phase
2 (publish + CI sync gate). Branch `feat/publish-claude-marketplace`, one PR.

Standing procedure: RED first, `npm run ci:local` green, merge on green CI. Step 1 is an owner gate: it runs after this
plan is committed, and nothing after it starts until the owner has picked go / fix-first / rethink and the answer is
written into this file.

Owner answers (2026-10-30): asked where the marketplace lives and when the spike runs, the owner said "choose the best
option" for both. Chosen, with reasons recorded in step 2: a `marketplace` branch in this repo, and the spike runs as
step 1 after the plan commit, stopping for the owner on any difference.

## Evidence re-checked (2026-10-30)

- `.gitignore:3` still ignores `dist/`; `.github/workflows/` still has only `ci.yml` and `release.yml`.
- `release.yml` has one job, `publish`, with `permissions: contents: read, id-token: write` (top level). It runs
  `npm run ci:local`, then `npm publish --provenance`. No marketplace step.
- Phase 0 partly shipped: `src/load.ts:76-84` sorts the globbed source paths ("sorting keeps every emitted file
  stable"). Whether every emitter is stable is unproven; step 1 tests it.
- Known nondeterminism: `writeRegistry` (`src/commands/build.ts:61`) stamps `new Date().toISOString()` into
  `<out-dir>/registry.json`. That file sits beside `claude/`, not inside it, so it only matters if the published tree
  includes it.
- No README Quick Start `<details>` blocks and no `docs/setup/` directory exist yet, although the ADR asks every
  install-route phase to add both.

## Steps

### 1. Spike: byte-stable output `[inline: research]`

Test the brief's riskiest assumption before anything else: do two identical builds produce byte-identical output?

Run from a clean build (`npm run build`), using the scratchpad for output:

| Case                      | Command                                                                                                                   | Expected (assumption holds)                  |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| a. Same build, run twice  | `node dist-cli/cli.js build --target claude --out-dir $S/a` and again with `$S/b`, then `diff -r $S/a/claude $S/b/claude` | no output, exit 0                            |
| b. registry.json          | `diff $S/a/registry.json $S/b/registry.json`                                                                              | only the timestamp line differs (known)      |
| c. Different cwd and path | build from a fresh `git clone` in another directory and diff its `claude/` against `$S/a/claude`                          | identical (no absolute paths leak in)        |
| d. Locale and TZ          | `LC_ALL=C TZ=UTC` and `LC_ALL=tr_TR.UTF-8 TZ=Asia/Tokyo`, diff both against `$S/a/claude`                                 | identical (no `localeCompare` or date drift) |
| e. File order on disk     | copy `catalog/` with files created in reverse order, build with `--catalog-dir`, diff                                     | identical                                    |
| f. Node versions          | run case a on Node 20 (release.yml) and on Node 24 (local) and diff                                                       | identical                                    |

For every difference found, record the file, the differing bytes and the source line that produces them.

Output: `docs/decisions/publish-claude-marketplace-2026-10.md` § Determinism, with the table filled in (actual results)
and a go / fix-first verdict. **Stop and report to the owner.** The owner decides between:

- **go**: output is stable; skip step 4.
- **fix-first**: step 4 removes each source of nondeterminism before any gate is built.
- **rethink**: the instability can't be fixed cheaply; the drift gate compares a normalized form instead, and this plan
  is amended.

Result (2026-10-30): cases a–e identical. Case f (Node 20) was not run, because downloading a Node 20 binary was blocked
on this machine; step 3's test covers it on CI's Node 20 leg. Owner verdict 2026-10-30: **go** ("go all"), so step 4 is skipped. Details: decision doc § Determinism.

### 2. Record the location decision `[inline: decision doc]`

Decided 2026-10-30 (owner delegated the choice). Write it into the decision doc § Location along with the reasons:

- **Location: an orphan `marketplace` branch in this repo**, holding exactly the contents of `claude/` at its root
  (`.claude-plugin/marketplace.json`, `plugins/`). Users run `/plugin marketplace add makubexD/sigil#marketplace`. The
  Claude Code docs confirm that `owner/repo#ref` pins a branch or tag
  ([discover-plugins](https://code.claude.com/docs/en/discover-plugins), "Add a marketplace" source table).
  - Rejected: committing to the root of `master`. Every catalog PR would carry regenerated output, `master` history would
    hold generated files, and users would get unreleased catalog changes.
  - Rejected: a dedicated repo. It needs a deploy key or PAT secret and a second repo to maintain, with nothing gained
    over a branch now that refs are supported.
  - Rejected: tags only. Users would have to change their add command on every release to get updates.
- **Auth**: the workflow `GITHUB_TOKEN` with `contents: write`, set on the `marketplace` job only. No PAT or deploy key.
- **Versioning: per sigil release.** `plugin.json` already carries `pkg.version`. Every publish commit on `marketplace`
  is also tagged `marketplace-v<version>`, so a user can pin `makubexD/sigil#marketplace-v<version>`.
- **Drift gate meaning**: the `marketplace` branch must equal a fresh `--target claude` build of the latest release tag.
  That catches a hand edit to the branch, or a partial or failed publish. Unreleased catalog changes on `master` are not
  drift. The guard against false failures is step 3's determinism test, which runs in the normal suite.

### 3. RED: determinism test `[worker:medium]`

File: `test/commands/build-determinism.test.ts` (new; model it on `test/commands/build-identity.test.ts`).

Cases:

1. Two `build --target claude` runs into two temp dirs → recursive file maps of `claude/` are equal (same paths, same
   bytes). Expected: passes if step 1 said go, fails on the spike's findings if fix-first.
2. Same, but the second build runs with `TZ=Asia/Tokyo LC_ALL=tr_TR.UTF-8` in the child env. Expected: same as case 1.
3. `registry.json` from the two runs is equal after deleting the timestamp field. Expected: passes.

Test command: `npm test -- --test-name-pattern=determinism`.

### 4. Remove each source of nondeterminism `[worker:medium]` (only if step 1 says fix-first)

Files: the ones step 1 names (at most about 3 per run; split into 4a, 4b, … if there are more). The exact change per
finding is written here after step 1. Test: step 3 goes green, `npm test` green, and `dist/claude/` is byte-identical
before and after except for the fixed lines.

### 5. Drift-check script `[worker:medium]`

Files: `scripts/check-marketplace-drift.cjs` (new), `package.json` (`"marketplace:check"` script),
`test/scripts/check-marketplace-drift.test.ts` (new).

Change: `node scripts/check-marketplace-drift.cjs <published-dir>` builds `--target claude` into a temp dir and compares
`claude/` against `<published-dir>` recursively. Exit 0 when equal; exit 1 with the list of added, removed and changed
paths otherwise. It ignores `.git/` only (the publish step adds nothing beyond `claude/`).

Cases:

1. Published dir equals a fresh build → exit 0, no output besides one ✓ line.
2. One `SKILL.md` edited in the published dir → exit 1, the path listed as changed.
3. One file deleted → exit 1, listed as removed. One extra file → exit 1, listed as added.
4. `.git/` present in the published dir → ignored, exit 0.

Test command: `npm test -- --test-name-pattern=marketplace-drift`.

### 6. Release publish job `[worker:medium]`

File: `.github/workflows/release.yml`.

Change: a new job `marketplace` with `needs: publish` and `permissions: contents: write` (job-level only). It checks out
the tag, runs `npm ci && npm run build && node dist-cli/cli.js build --target claude --out-dir $RUNNER_TEMP/mp`, then
checks out the `marketplace` branch into a second directory (on the first run, which has no branch yet, it creates an
orphan branch). It replaces that tree with `$RUNNER_TEMP/mp/claude/` (keeping `.git/`), commits as
`github-actions[bot]` with the message `marketplace: <tag>`, tags the commit `marketplace-<tag>`, and pushes both. If the
tree is unchanged, it skips the commit but still tags. Pin every action by SHA like the existing ones. The `publish`
job's permissions stay unchanged.

Test: `npx prettier --check .github/workflows/release.yml`, plus `actionlint` if installed. The real run is checked in
step 9.

### 6b. Split the release gate from npm publish `[worker:medium]`

Added 2026-10-30 after review: step 6's `needs: publish` tied the marketplace to `npm publish`, which comes last (it
needs npm Trusted Publishing set up first). The owner approved the split.

File: `.github/workflows/release.yml`.

Change: three jobs. `gate` holds the existing checkout, setup-node, `npm ci`, Claude Code CLI install and
`npm run ci:local` steps (with their comments). `publish` gets `needs: gate`, and runs checkout, setup-node with
`registry-url`, `npm ci`, and the existing npm publish step and comment block (`prepack` builds). `marketplace` gets
`needs: gate` instead of `needs: publish`. Top-level permissions become `contents: read` only. `id-token: write` moves
to the `publish` job together with `contents: read`, and `marketplace` keeps `contents: write`. Update the marketplace
comment ("runs after the npm publish succeeds" becomes "runs after the gate passes, independent of npm publish").

Test: prettier check; a YAML parse asserting `gate` has no `needs`, `publish.needs == gate`, `marketplace.needs == gate`,
top-level permissions has no `id-token`, and `publish.permissions['id-token'] == 'write'`.

### 7. Drift gate job `[worker:medium]`

Amended 2026-10-30 after step 6b: the release to compare is the newest `marketplace-v*` tag minus its prefix, not the
latest `v*.*.*` tag, and the job runs after every Release run (no `conclusion == 'success'` condition), because npm
publish can now fail while the marketplace job succeeds. Release pushes branch and tag with `git push --atomic`.

File: `.github/workflows/marketplace-drift.yml` (new).

Change: triggers on `workflow_run` of Release (completed) and on `workflow_dispatch`, with `permissions: contents: read`.
It checks out the latest `v*.*.*` tag, builds, checks out the `marketplace` branch into a second directory and runs
`npm run marketplace:check <dir>`; it fails on drift. Before the branch exists it reports "no marketplace branch yet"
and passes. `setup-node` uses Node `'20'`, the same as `release.yml`, so the drift build matches the published one
(decision doc § Determinism).

Test: same as step 6.

### 8. Docs: the marketplace route `[inline: user-facing copy]`

Files: `README.md` (Quick Start gains the first `<details>` block, "Claude Code marketplace", per ADR § 6),
`docs/setup/claude-code.md` (new: add the marketplace, install one plugin, update, remove), `docs/guides/publishing.md`
(how sigil publishes its own marketplace, linked as a worked example), `docs/index.md` (links).

Test: `npm run format:check`, and every link resolves.

### 9. Close-out `[worker:medium]`, then owner checks `[inline: owner]`

Worker part. Files: `CHANGELOG.md` entry; `docs/ideas/publish-claude-marketplace.md` deleted; `docs/ideas/README.md`
row removed; the decision doc keeps the still-true facts (location, auth, versioning, determinism). Test:
`npm run ci:local` green.

Owner part, recorded in the PR:

- After the first tagged release: the `marketplace` job pushed, and the drift job is green.
- On a clean machine: `/plugin marketplace add makubexD/sigil#marketplace` and `/plugin install <one plugin>` succeed, and the
  plugin's skill appears.
- Then `workflow-report .`, `/agent-skills:review` of the feature, and this plan deleted after merge.
