# Plan: no empty plugins, then mark the Claude marketplace supported

Goal: `sigil build --target claude` never emits a plugin that delivers nothing, the docs' install example names a
plugin with content, and once a release carries that, the S2 channel is marked supported.

Found while verifying `v0.2.0` (2026-10-30): `/plugin install essentials@sigil` succeeds, but the plugin holds only
`.claude-plugin/plugin.json`. Every `essentials` artifact is an `mcp`, `hook` or `prompt`, and the Claude plugin
channel delivers none of those yet (`docs/reference/capabilities.md` § plugin, note 1). README and
`docs/setup/claude-code.md` use `essentials@sigil` as the install example, and Phase 0 of
`docs/decisions/distribution-channels-2026-09.md` § 6 promises "no empty plugins". The other 13 plugins carry 2-28
files each.

Rule: a pack becomes a plugin only when it has at least one member `pluginMembersByKind` returns (today `skill`,
`agent`, `workflow`). Rules alone don't count: they travel only inside skills. Otherwise the pack gets no
`plugins/<name>/` folder and no `marketplace.json` entry. Packing hooks, MCP and prompts into plugins is ADR Phase 1
and stays out of scope.

Branch: `fix/no-empty-plugins`.

## Step 1 — skip a pack with nothing to deliver `[worker:medium]`

Files: `src/targets/claude-code/plugin-assemble.ts`, `src/targets/claude-code/target-helpers.ts`,
`src/targets/claude-code/index.ts`.

- `plugin-assemble.ts`: export `hasPluginMembers(packArtifacts: ResolvedArtifact[]): boolean`, true when
  `pluginMembersByKind(packArtifacts)` returns a non-empty list for any kind in `WRITABLE_PLUGIN_KINDS`. Doc comment:
  a pack whose artifacts the plugin channel can't carry (only `mcp` / `hook` / `prompt` / `settings`, or rules with no
  skill) gets no plugin, so the marketplace never lists an empty one.
- `target-helpers.ts` `buildOnePackPlugin`: return `undefined` when `!hasPluginMembers(packArtifacts)`, before
  calling `buildPlugin`. Update its return type and doc comment ("or `undefined` when the pack has nothing the plugin
  channel delivers").
- `index.ts` compile loop (line ~123): skip an `undefined` result; nothing else changes.

Test: `npm run build` passes; `ls dist/claude/plugins` lists 13 folders, no `essentials`;
`jq -r '.plugins[].name' dist/claude/.claude-plugin/marketplace.json` lists the same 13.

## Step 2 — tests and the output snapshot `[worker:medium]`

Files: `test/targets/claude-code.test.ts`, `test/fixtures/output-snapshot/build.json` (regenerated, never hand-edited).

Add a `describe('empty packs', …)` in `claude-code.test.ts`, using that file's existing catalog and compile helpers:

1. A pack whose artifacts are only an `mcp` and a `hook` → compile output has no key starting with `plugins/<pack>/`,
   and `marketplace.json` `plugins` has no entry named `<pack>`.
2. A pack holding only a rule that no skill in the pack uses → same as case 1.
3. A pack with one `skill` → `plugins/<pack>/.claude-plugin/plugin.json` and the skill's `SKILL.md` exist; the
   marketplace has one entry for it.
4. A build with one empty pack and one skill pack → the marketplace lists exactly the skill pack.
5. Bundled catalog (`packs.yaml`) → every `marketplace.json` entry has at least one file under `plugins/<name>/`
   besides `.claude-plugin/plugin.json`, and `essentials` is not listed.

Then `npm run snapshot:update` and check the snapshot diff only removes `plugins/essentials/.claude-plugin/plugin.json`
and changes `.claude-plugin/marketplace.json`.

Test: `npm test` passes. Negative check: make `hasPluginMembers` return `true` and rerun the compiled
`claude-code.test.js`. Cases 1, 2, 4 and 5 fail; case 3 passes. Restore it.

## Step 3 — docs: example install and where non-plugin packs go `[worker:medium]`

Files: `README.md`, `docs/setup/claude-code.md`, `docs/guides/consuming.md`.

- Replace `essentials@sigil` with `spec-driven@sigil` in `README.md:83` and `docs/setup/claude-code.md:32, 49, 58`.
  It is language-neutral, like the old example.
- In `docs/setup/claude-code.md`, right after the install command block, add: "A pack whose artifacts are all MCP
  servers, hooks or prompts, such as `essentials`, has no plugin yet: plugins can't carry those kinds. Install it with
  `sigil add` instead."
- `docs/guides/consuming.md:497`: drop `essentials` from the list of example plugins, and add the same one-sentence
  note there, linking `../reference/capabilities.md#plugin`.

Test: `npx prettier --check README.md docs/setup/claude-code.md docs/guides/consuming.md`;
`grep -rn 'essentials@sigil' README.md docs/` returns nothing.

## Step 4 — CHANGELOG and decision records `[worker:medium]`

Files: `CHANGELOG.md`, `docs/decisions/publish-claude-marketplace-2026-10.md`,
`docs/decisions/distribution-channels-2026-09.md`.

- `CHANGELOG.md` `[Unreleased]` → `### Fixed`: "The Claude marketplace no longer lists `essentials` as an empty
  plugin: a pack whose artifacts plugins can't carry (MCP, hooks, prompts) gets no plugin. Install `essentials` with
  `sigil add`."
- Marketplace decision doc: add a short `## Empty plugins` section before `## Drift gate`, stating the rule above,
  that `v0.2.0` shipped `essentials` empty, and that `v0.2.1` removes it.
- Distribution ADR § 6, Phase 0 row: leave the row's text alone; add a note below the table: "'No empty plugins' done
  2026-10-30 (`docs/plan-no-empty-plugins.md`)".

Test: `npx prettier --check` on the three files.

## Step 5 — ship the PR `[inline: release judgment]`

`npm run ci:local`, push, open the PR, wait for CI, merge.

## Step 6 — release `v0.2.1` and verify `[inline: verification]`

`sigil release patch --yes`, then push the commit and the tag once `master` CI is green. Check: Release run green with
`publish` skipped; the `marketplace` branch has 13 plugins and no `plugins/essentials`; `marketplace-v0.2.1` is on the
branch tip; Marketplace drift passed after comparing against `v0.2.1`. Using an empty `CLAUDE_CONFIG_DIR` in the
scratchpad, `claude plugin marketplace add makubexD/sigil#marketplace` and `claude plugin install spec-driven@sigil`
succeed, and the installed plugin holds `skills/feature/SKILL.md`.

## Step 7 — owner clean-machine install `[inline: owner action]`

`/plugin marketplace add makubexD/sigil#marketplace`, then `/plugin install spec-driven@sigil`; the `feature` skill
appears.

## Step 8 — mark the channel supported `[worker:medium]` (only after step 7 is confirmed)

Files: `README.md`, `docs/setup/claude-code.md`, `docs/index.md`, `docs/decisions/publish-claude-marketplace-2026-10.md`.

- `README.md` (~line 86): delete the "First publish pending" blockquote and the blank line after it.
- `docs/setup/claude-code.md` (~line 10): same.
- `docs/index.md` S2 row: status `Supported (first publish pending)` → `Supported`; in the notes cell replace "From
  the next release on, each release pushes" with "Each release pushes".
- Decision doc `Status:` paragraph → "Status: shipped; first published with `v0.2.0` (2026-10-30), empty-plugin fix
  in `v0.2.1`, clean-machine install confirmed by the owner." Keep the ADR sentence that follows.
- Delete `docs/plan-gate-npm-publish.md` (its steps 5-8 are covered here) and this plan file.

Test: `npx prettier --check` on the four files; `grep -rn -i 'first publish pending' README.md docs/` returns
nothing.
