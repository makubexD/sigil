# Publish the Claude marketplace from CI (2026-10)

Status: in progress on `feat/publish-claude-marketplace` (`docs/plan-publish-claude-marketplace.md`). Started from
`docs/ideas/publish-claude-marketplace.md` and ADR
[distribution-channels-2026-09](distribution-channels-2026-09.md) § 6, Phase 0 (deterministic output) and Phase 2
(publish + CI sync gate).

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
