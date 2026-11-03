# Plan: complement mode and the plugin duplicate guard (ADR Phase 2b)

Roadmap: [distribution-channels-2026-09.md](decisions/distribution-channels-2026-09.md) § 6, Phase 2b: "`sigil add
--complement` + duplicate guard against enabled sigil plugins — not built". § 3 says why it matters: delivering one
artifact through both channels is harmful. Claude namespaces plugin items, so it loads both copies. On Copilot, the
project's copy of a skill or agent silently beats the plugin's, and for MCP the plugin's server wins over the
project's (`docs/setup/copilot.md` § Copies of the same artifact). § 8 item 5 says duplicates are documented, not guarded.

## Sources (read 2026-11-03)

- Claude, [settings reference § enabledPlugins](https://code.claude.com/docs/en/settings-reference#enabledplugins):
  object keyed `plugin-name@marketplace-name` → Boolean, valid in any settings file (user `~/.claude/settings.json`,
  project `.claude/settings.json`, local `.claude/settings.local.json`, managed). `/plugin` and `claude plugin enable`
  write it. With no entry at any scope, a plugin follows its `defaultEnabled` (default `true`).
- Claude, [plugins reference](https://code.claude.com/docs/en/plugins-reference): when a marketplace entry's `name`
  differs from the manifest's, `enabledPlugins` uses the entry name.
- Copilot, [CLI plugin reference § File locations](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-plugin-reference#file-locations):
  plugins installed from a marketplace live in `~/.copilot/installed-plugins/MARKETPLACE/PLUGIN-NAME`. § Loading order:
  agents and skills are first-found-wins (project and personal beat plugins, silently); MCP is last-wins (the plugin
  beats an already installed server).

## Decisions (settled from the docs, per the decide-from-docs rule)

1. **What a plugin holds is computed once, from the code `build` uses.** A new
   `marketplacePluginContents(catalog, packs)` returns plugin name → catalog ids: each pack plugin's members
   (`getPackArtifacts` limited by `pluginMembersByKind`, plus the shared agents `computeSharedAgentIds` adds) and one
   `hook-*` / `mcp-*` plugin per config artifact (`configPluginName`). `build --target claude` is refactored to read
   it, so the guard and the marketplace can't disagree. The marketplace name is packs.yaml `marketplace.name`, or
   sigil's default.
2. **Detection is per target, on `Target`** (platform logic stays in `src/targets/<name>/`): a new optional
   `Target.enabledPlugins(env)` returns the enabled plugin names from this marketplace and the file or folder each came
   from. `env` carries `projectDir`, `homeDir` (default `os.homedir()`, injectable for tests) and `marketplace`.
   - **Claude**: reads `enabledPlugins` from local, project and user settings, in that precedence. The highest scope
     that sets a key decides. Only an explicit `true` counts. A plugin with no entry is not counted: whether it is
     installed lives in files the docs don't describe. Managed settings are not read. A file that is missing or not
     JSON is skipped; a file that isn't JSON also gets one warning line.
   - **Copilot**: each folder under `~/.copilot/installed-plugins/<marketplace>/` is one installed plugin.
   - **Codex, Cursor, Antigravity**: none in this phase. Their plugin state isn't documented in a form read here; the
     ADR records this as left open.
   - Files go through `src/safe-read.ts`, as every other read does.
3. **The overlap is computed in one neutral module**, `src/plugin-overlap.ts`:
   `pluginOverlaps(target, catalog, packs, env)` → `Map<id, { plugin, source }>`, empty when the target has no
   `enabledPlugins`. `add`, `status` and the wizard call it; none of them reads settings files.
4. **`sigil add` warns by default, and `--complement` skips.** Without the flag, each picked artifact an enabled
   plugin already delivers is still installed, with one warning line naming the plugin and where it is enabled.
   Changing what plain `add` installs would surprise existing users. With `--complement`, those artifacts go to
   `skipped[]` with a new `SkipCause` `'plugin'`, and the reason `delivered by plugin <name>@<marketplace>
(<source>)`. Rules and settings are never in a plugin, so they are never skipped. That is the policy/capability
   split from decision 1 of the ADR. A dependency the plugin doesn't hold is still installed.
5. **`sigil status` adds notes and never writes.** One note line per installed entry an enabled plugin also delivers,
   next to the existing overlap notes. `--json` rows gain an optional `plugin` field (`{ name, source }`), absent when
   there's no overlap.
6. **The wizard shows the same warning in its preview.** It has no complement toggle in this phase; that is listed as
   a follow-up in the ADR.

Each worker step ends with `npm run build && npm run lint && npm run test:built` green unless it says otherwise.

## Step 1 `[inline: live probe of Claude and Copilot behaviour]`: confirm the state files

- In a scratch `git init` project, with `CLAUDE_CONFIG_DIR` pointed at a scratch folder so `~/.claude` is untouched:
  `claude plugin marketplace add makubexD/sigil@marketplace` (or the form `docs/setup/claude-code.md` uses), then
  `claude plugin install hook-protect-config@sigil --scope project`. Expect `.claude/settings.json` to hold
  `"enabledPlugins": { "hook-protect-config@sigil": true }`. Repeat with `--scope local` and expect
  `.claude/settings.local.json`.
- Copilot (read-only): list `~/.copilot/installed-plugins/`; expect a `sigil/` folder with one folder per installed
  plugin if any were installed during the 2026-10-31 check.
- Record both results in the ADR under § 6 as "Phase 2b probes". If an expectation fails, stop and amend decision 2
  before step 3.

## Step 2 `[worker:medium]`: one function for plugin contents

- Files: new `src/targets/claude-code/plugin-contents.ts`; `src/targets/claude-code/index.ts` (and
  `plugin-assemble.ts` only if needed) read it; new `test/targets/claude-code/plugin-contents.test.ts`.
- `marketplacePluginContents(catalog: ResolvedCatalog, packs: Pack[]): ReadonlyMap<string, readonly string[]>`,
  plugin names in marketplace order, ids sorted. Pack plugins: `hasPluginMembers` packs only; members from
  `getPackArtifacts` filtered by `pluginMembersByKind` for each `PACK_PLUGIN_KINDS` kind, plus `computeSharedAgentIds`.
  Config plugins: `buildConfigPlugins`' selection, named by `configPluginName`. The build loop takes its membership
  from this function. No output change.
- Tests: (a) `essentials` with a `pluginExclude` id → that id absent. (b) A pack whose skill `uses.agents` a shared
  agent outside the pack → that agent's id present. (c) `shared/protect-config` → key `hook-protect-config` holding
  only that id. (d) A pack with only `mcp` artifacts → no key. (e) Against the real catalog: the key set equals the
  plugin names in a fresh `build --target claude`'s `.claude-plugin/marketplace.json`.
- Also run `npm run marketplace:check -- <a build of master>`, or build twice and `diff -r`: `dist/claude/` must stay
  byte-identical.

## Step 3 `[worker:medium]`: `Target.enabledPlugins` and the Claude reader

- Files: `src/types.ts` (the optional member and its `EnabledPluginsEnv` / `EnabledPlugin` types); new
  `src/targets/claude-code/enabled-plugins.ts`, wired in `claude-code/index.ts`; new
  `test/targets/claude-code/enabled-plugins.test.ts`.
- Returns `EnabledPlugin[]`: `{ name, source }`, `source` relative to the project for project and local scope
  (`.claude/settings.json`), `~/.claude/settings.json` for user scope.
- Tests, with temp `projectDir` and `homeDir`: (a) project `{"a@sigil": true}` → `[{a, .claude/settings.json}]`.
  (b) user `true` and local `false` for `a@sigil` → empty. (c) user `false`, project `true` → enabled from the project.
  (d) `b@other: true` → empty (other marketplace). (e) no settings files → empty, no throw. (f) a project file that
  isn't JSON → skipped, one warning, the other scopes still read. (g) `enabledPlugins` not an object → skipped.
  (h) marketplace `acme` from options → `a@acme` counted, `a@sigil` not. (i) a settings file that is a symlink is
  refused through `safe-read`, the same way other reads are.

## Step 4 `[worker:medium]`: the Copilot reader

- Files: new `src/targets/copilot/enabled-plugins.ts`, wired in `copilot/index.ts`; new
  `test/targets/copilot/enabled-plugins.test.ts`.
- Lists the folders under `<homeDir>/.copilot/installed-plugins/<marketplace>/`; `source` is that folder, written
  `~/.copilot/installed-plugins/<marketplace>/<name>`. Regular folders only, never a followed link.
- Tests: (a) two plugin folders → both, sorted. (b) folder missing → empty. (c) a file (not a folder) → ignored.
  (d) `_direct/` and other marketplaces → ignored. (e) a symlinked folder → ignored.

## Step 5 `[worker:medium]`: the neutral overlap module

- Files: new `src/plugin-overlap.ts`; new `test/plugin-overlap.test.ts`.
- `pluginOverlaps(target, catalog, packs, env)`: joins `target.enabledPlugins` with `marketplacePluginContents` into
  `Map<id, { plugin, source }>`. An enabled name that isn't in the current contents (an old or renamed plugin) is
  ignored. When two enabled plugins hold the same id, the first in marketplace order is kept.
- Tests, with a stub target: (a) target without `enabledPlugins` → empty. (b) one enabled pack plugin → every member
  mapped to it. (c) unknown enabled name → empty. (d) id in two enabled plugins → the first one. (e) a `hook-*` plugin
  enabled → only that hook id.

## Step 6 `[worker:medium]`: `sigil add` warns, `--complement` skips

- Files: `src/cli.ts` (the `--complement` option on `add`, lazy wiring unchanged), `src/commands/add/index.ts`
  (`AddOpts.complement`), `src/commands/add/plan.ts` (compute overlaps once; under `complement`, move the ids to
  `skipped[]` before scaffolding; otherwise add `pluginOverlaps` to `AddPlan`), `src/select/selection.ts`
  (`SkipCause` gets `'plugin'`), the add summary printer that prints `skipped[]`. New
  `test/commands/add-plugin-overlap.test.ts`.
- Tests, in a temp project with a temp home holding `.claude/settings.json` that enables a sigil pack plugin:
  (a) `add <a skill in that pack> --target claude` → installs, prints one warning naming the plugin and
  `.claude/settings.json`, exit 0. (b) Same with `--complement` → nothing written, the skip line names the plugin, exit 0. (c) `--complement` with a rule the skill `uses` → the rule is still written. (d) `--complement` with no enabled
  plugin → same files as without the flag. (e) `--target cursor` with the same settings → no warning (no reader).
  (f) `--dry-run --complement` → the skip shows, nothing written. (g) `test/cli-startup.test.ts` still passes (no
  eager import).
- Run `npm run build` so `docs/reference/cli-flags.md` picks up `--complement`; commit it.

## Step 7 `[worker:medium]`: `sigil status` notes and the JSON field

- Files: `src/commands/status.ts` (notes after the existing overlap notes), `src/commands/status-overlaps.ts` only if
  the note renderer is shared, `src/commands/status-json.ts` (optional `plugin` field). New
  `test/commands/status-plugin-overlap.test.ts`.
- Tests: (a) an installed skill that an enabled plugin holds → one note naming the skill, the plugin and its source.
  (b) none enabled → no note, output unchanged from today. (c) `--json` → that row has
  `plugin: { name, source }`, others have no `plugin` key. (d) status writes nothing (the manifest and settings are
  unchanged byte for byte).

## Step 8 `[worker:medium]`: the wizard preview line

- Files: the wizard's install preview (find it from `src/wizard/CLAUDE.md`, which auto-loads), and its test.
- The preview shows the step 6 warning lines from `AddPlan.pluginOverlaps`, in the same words.
- Tests: (a) a plan with one overlap → the preview contains the warning line. (b) no overlap → the preview is unchanged.

## Step 9 `[inline: user-facing copy]`: docs

- `docs/guides/consuming.md` (plugin and `sigil add` together, `--complement`), `docs/setup/claude-code.md`,
  `docs/setup/copilot.md` § Copies of the same artifact (now guarded on `add` and noted by `status`),
  `docs/reference/spec.md` (`add` flags), `CHANGELOG.md` `[Unreleased]`.
- ADR: § 6 row 2b → **done <date>**, the § 6 paragraph on 2b, § 8 item 5 ("documented, not guarded" → guarded), plus
  what's left open: Codex, Cursor and Antigravity readers, managed settings, a wizard toggle.

## Step 10 `[inline: live check]`: prove it

- In a scratch project with `CLAUDE_CONFIG_DIR` set to a scratch folder: install a sigil pack plugin at project scope,
  then `sigil add <a skill from it> --target claude` → warning; `--complement` → skipped; `sigil status` → note.
  Record the result in the ADR's Phase 2b paragraph.

Commit trailers per step as the global rules say (`Plan-Step: docs/plan-complement-mode.md#<n>`).

## Review fixes (2026-11-03, `/agent-skills:review` of the whole feature)

## Step 11 `[worker:medium]`: the Claude reader never aborts on a bad settings path

- Files: `src/targets/claude-code/enabled-plugins.ts`, `test/targets/claude-enabled-plugins.test.ts`.
- `readScope`'s `fs.lstatSync(scope.file, { throwIfNoEntry: false })` throws on EACCES / ENOTDIR. Catch it, push
  `${scope.source}: <message>` to `warnings`, return undefined, and keep reading the other scopes (as the Copilot
  reader does).
- Tests: (a) a project whose `.claude` is a regular file (ENOTDIR) → no throw, one warning naming that scope, a
  plugin enabled at user scope still found. (b) unchanged behaviour for a missing file (no warning).

## Step 12 `[worker:medium]`: `add --complement` renders with the set `update` uses

- Files: `src/commands/add/co-install.ts`, `src/commands/add/plan-scaffold.ts`, `test/commands/add-plugin-overlap.test.ts`.
- `coInstallSetFor` must leave out the dependencies `--complement` skipped (`excludeDeps`), so a kept artifact's
  Boundary names only what is installed; otherwise `status` calls it outdated right after `add`.
- Test: enable `python-starter` in the temp home, `add skill:python/py-document agent:python/py-security-auditor`
  with `deps: true, complement: true`, then the status computation for the project reports every entry up to date.

## Step 13 `[worker:medium]`: `update` and `status` never re-add a dependency an enabled plugin delivers

- Files: `src/freshness.ts` (`missingDependencies` callers), `src/commands/update-deps.ts`, their tests.
- A missing `uses:` dependency an enabled plugin of that target delivers (`pluginOverlaps`, env as `status` builds
  it) is not reported as `newDependencies` and not installed by `installNewDependencies`.
- Test: complement add as in step 12, then `status` shows no "update would also install", and `update --yes` writes
  no new file.

## Step 14 `[inline: user-facing copy]`: review doc nits

- `spec.md` add row and CHANGELOG: picks or dependencies. `consuming.md`: a symlinked settings file is skipped with a
  warning; under `--complement` a skipped skill's rules are recorded as your picks. Optional findings left open (in
  the ADR's left-open list): `CLAUDE_CONFIG_DIR`, symlinked settings, `status --json` dropping reader warnings, the
  wizard printing the advisory twice.
