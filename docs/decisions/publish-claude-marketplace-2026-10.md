# Publish the Claude marketplace from CI (2026-10)

Status: shipped; first published with `v0.2.0` (2026-10-30), empty-plugin fix in `v0.2.1`; install verified with the
Claude Code CLI against an empty config dir. The owner's clean-machine check is still open. ADR
[distribution-channels-2026-09](distribution-channels-2026-09.md) § 6, Phase 0 (deterministic output) and Phase 2
(publish + CI sync gate). The brief it started from was deleted once this record covered it.

## Determinism

The brief's riskiest assumption: two identical `sigil build --target claude` runs produce byte-identical output. If they
don't, a drift gate fails for no reason.

Checked 2026-10-30 on Node 24.22.1 (Linux, ext4), commit `c69827b`, after `npm run build`. Every case compares the 141
files of `claude/` against run a with `diff -r`.

| Case                     | What ran                                                                                                               | Result                                                                               |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| a. Same build, run twice | `node dist-cli/cli.js build --target claude --out-dir <a>`, then `<b>`                                                 | identical                                                                            |
| b. `registry.json`       | `diff <a>/registry.json <b>/registry.json`                                                                             | only `generatedAt` differs (line 3), as expected                                     |
| c. Different cwd/path    | fresh `git clone` in another directory, `npm ci`, `npm run build`, build                                               | identical (no absolute path leaks in)                                                |
| d. Locale and TZ         | `LC_ALL=C TZ=UTC`; `LC_ALL=tr_TR.UTF-8 LANG=tr_TR.UTF-8 TZ=Asia/Tokyo` (Node resolved `tr-TR`, so locale sorts change) | identical in both                                                                    |
| e. File order on disk    | `catalog/` copied with files created in reverse order, built with `--catalog-dir`                                      | identical; weak on its own (ext4 lists entries by hash), so backed by the scan below |
| f. Node 20               | not run: downloading a Node 20 binary (`npx -p node@20`) was blocked on this machine                                   | **open**; step 3's test covers it on CI's Windows / Node 20 leg                      |

Source scan of the build path (`localeCompare`, `Intl.`, `Math.random`, `new Date`, `Date.now`, `readdirSync`,
`os.*`):

- `src/load.ts:76-84` sorts globbed source paths; `listEntries` in `src/load-references.ts` returns `names.sort()`. The
  other unsorted `readdirSync` results there (`skillFolderExtras`, the `skipped` list) only feed skip warnings, never
  output.
- `writeRegistry` (`src/commands/build.ts:61`) stamps `generatedAt` with the current time. `registry.json` is written
  beside `claude/`, not inside it, so the published tree never contains it.
- `compareRegistryEntries` (`src/registry.ts:127-129`) sorts with locale-sensitive `localeCompare`. It only orders
  `registry.json`, the ids are lowercase ASCII kebab-case, and case d showed no change under `tr-TR`. Not a gate risk.

**Verdict: go.** `claude/` is byte-stable across runs, paths, locales, time zones and file order. Step 4 (fixes) is
skipped. The one gap, Node 20, is closed by step 3's determinism test running in CI's Node 20 leg; and as long as the drift
workflow (step 7) pins the same Node version as `release.yml` (`'20'`), a cross-version difference cannot cause a false
drift failure between the two.

## Location

Decided 2026-10-30; the owner delegated the choice ("choose the best option").

- **An orphan `marketplace` branch in this repo**, holding exactly the contents of `claude/` at its root
  (`.claude-plugin/marketplace.json`, `plugins/`). Users add it with `/plugin marketplace add makubexD/sigil#marketplace`.
  Claude Code accepts `owner/repo#ref` to pin a branch or tag
  ([discover-plugins](https://code.claude.com/docs/en/discover-plugins), "Add a marketplace" source table, checked
  2026-10-30).
- **Rejected: the root of `master`.** Every catalog PR would carry regenerated output, `master` history would hold
  generated files, and users would get unreleased catalog changes.
- **Rejected: a dedicated repo.** It needs a deploy key or PAT secret and a second repo to maintain, and a branch gives
  the same clean add command now that refs work.
- **Rejected: tags only.** Users would have to change their add command on every release to get updates.

## Auth and versioning

- **Auth**: the workflow `GITHUB_TOKEN` with `contents: write`, granted on the `marketplace` job only. No PAT or deploy
  key. The npm `publish` job keeps `contents: read` + `id-token: write`.
- **Versioning: per sigil release.** `plugin.json` already carries `pkg.version` (`buildPluginJson`). Each publish
  commit on `marketplace` is tagged `marketplace-v<version>`, so a user can pin
  `makubexD/sigil#marketplace-v<version>`.
- **Only the newest release publishes.** The `marketplace` job skips a tag that is not the newest `v*.*.*` on origin, so
  a backport release never rolls users back, and it skips a tag already published, so re-running a release is a no-op.
  A `concurrency` group serializes two releases pushed together.

## Empty plugins

A pack becomes a plugin only when it holds at least one artifact the plugin channel carries (`skill`, `agent`,
`workflow`). A pack whose members are all `mcp`, `hook` or `prompt` — or rules alone — gets no `plugins/<name>/`
folder and no `marketplace.json` entry, so the marketplace never lists a plugin that delivers nothing. `v0.2.0`
shipped `essentials` empty, because that pack is all MCP servers, hooks and prompts; `v0.2.1` removes it, and
`essentials` installs with `sigil add`.

## Drift gate

The `marketplace` branch must equal a fresh `--target claude` build of the release its tip is tagged with
(`marketplace-v<version>`, minus the prefix). Only the release workflow creates that tag, and it pushes branch and tag
together (`git push --atomic`), so a tip without one fails the gate as a hand edit. Reading the tag from the tip, not
the highest tag, keeps the gate correct whatever order releases ran in. The drift workflow runs after every Release run
whatever its conclusion, since the npm publish job can fail or be skipped (it runs only when the `NPM_PUBLISH`
repository variable is `true`) while the marketplace job succeeds. The gate catches a hand edit or a partial publish.
Unreleased catalog changes on `master` are not drift. False failures are guarded by the determinism test in the normal
suite (§ Determinism), and by the drift workflow building on the same Node version as `release.yml`.
