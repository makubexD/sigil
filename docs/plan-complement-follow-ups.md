# Plan: complement mode follow-ups (ADR Phase 2b, left open)

Roadmap: [distribution-channels-2026-09.md](decisions/distribution-channels-2026-09.md) § 6, the Phase 2b paragraph's
"Left open" list. Phase 2b itself shipped in PR #184 (`ab34f3e`). The previous step plan is `docs/plan-complement-mode.md`.

Branch: `feat/complement-follow-ups`.

## Sources (read 2026-11-03)

- Claude, [settings reference § enabledPlugins](https://code.claude.com/docs/en/settings-reference#enabledplugins):
  keyed `plugin-name@marketplace-name`. A plugin with no entry at any scope falls back to its `defaultEnabled`. Managed
  `enabledPlugins` force-enables a plugin.
- Claude, [plugins reference § defaultEnabled](https://code.claude.com/docs/en/plugins-reference#defaultenabled):
  defaults to `true`. Once a user's `enabledPlugins` entry is written, it persists across updates.
- Claude, [managed settings](https://code.claude.com/docs/en/managed-settings): file-based policy is
  `managed-settings.json` plus an optional `managed-settings.d/*.json` (merged after it, in alphabetical order, hidden
  files ignored) in `/Library/Application Support/ClaudeCode/` (macOS), `/etc/claude-code/` (Linux and WSL),
  `C:\Program Files\ClaudeCode\` (Windows). The other managed sources are server-managed, MDM (macOS plist, HKLM) and
  HKCU. A developer's files never override a managed value.
- Claude, [settings](https://code.claude.com/docs/en/settings): with `CLAUDE_CONFIG_DIR` set, Claude Code stores the
  user settings and plugins there instead of `~/.claude`.
- Codex, [plugins § build](https://developers.openai.com/codex/plugins/build): installed plugins live in
  `~/.codex/plugins/cache/$MARKETPLACE_NAME/$PLUGIN_NAME/$VERSION/`.
  [Config reference](https://developers.openai.com/codex/config-reference): `plugins.<plugin>.enabled` enables or
  disables a plugin by its `plugin-name@marketplace-name` key, and `plugins._default.enabled` sets the default for
  installed plugins. Trusted-project settings can override user settings.
- Antigravity, [Plugins](https://antigravity.google/docs/plugins): the CLI stages an installed plugin in
  `~/.gemini/config/plugins/<plugin_name>/`. A folder in `.agents/plugins/` is a workspace plugin. `agy plugin import
claude` copies Claude plugins into the same folder.
- Cursor, [Plugins](https://cursor.com/docs/plugins): you install and manage plugins in the Customize UI. Only
  `~/.cursor/plugins/local` (plugin development) is documented on disk.
- What each tool loads from sigil's Claude marketplace: Copilot loads skills, agents and prompts. Its hooks are
  **Unsafe**, and its MCP root is the plugin folder
  ([copilot-plugin-channel-2026-10](decisions/copilot-plugin-channel-2026-10.md), Decision: "Copilot users keep
  `sigil add` for hooks and MCP"). Codex loads skills and MCP, ignores agents, and its hook plugins fail open
  ([codex-target-2026-10](decisions/codex-target-2026-10.md) § Plugins).

## Decisions (settled from the docs, per the decide-from-docs rule)

1. **Fix first: an overlap counts only for a kind the tool really loads from the plugin.** Today `pluginOverlaps` counts
   every id a Claude marketplace plugin holds, on Copilot too. So `sigil add --complement --target copilot` with
   `hook-protect-config` installed skips the hook. Copilot's plugin copy of that hook is Unsafe, which leaves `.env`
   unguarded. A new optional `Target.pluginKinds` (absent = every kind) limits the overlap: Copilot gets
   `skill | agent | prompt`. Codex gets `skill` only: its MCP root through a plugin was never checked, and an
   unchecked kind stays installed.
2. **Each target names whose plugin contents it reads.** `registeredPluginContents` takes the first target that
   defines `marketplacePluginContents`. That breaks once Antigravity defines its own. The rule becomes: the target's
   own `marketplacePluginContents` if it has one, else that of the target named by a new
   `Target.pluginContentsFrom` (Copilot and Codex: `'claude-code'`), else nothing.
3. **Claude reader: `CLAUDE_CONFIG_DIR` moves the user scope.** When it is set and non-empty, the user scope reads
   `$CLAUDE_CONFIG_DIR/settings.json`, and its `source` shows the real path. `EnabledPluginsEnv` gains an optional
   `vars` (environment variables; readers default to `process.env`) so tests never touch the real environment.
4. **Claude reader: a symlinked settings file is followed at user scope only.** Dotfile managers link
   `~/.claude/settings.json`, and refusing it silently drops the guard. The user scope resolves the link with
   `realpath` and reads the target through `readRegularFile`, with the same size cap. Project and local files keep
   refusing links: a cloned repo could point one anywhere, and a JSON parse error echoes file text into a warning.
5. **Claude reader: file-based managed settings are read as the highest scope.** That is `managed-settings.json`, then
   `managed-settings.d/*.json` in alphabetical order (hidden files skipped), each later file overriding the earlier
   per key, in the OS directory above. A managed `true` force-enables a plugin, so it is counted. A managed `false` is
   respected too. Server-managed, MDM and registry policy aren't files sigil can read, so they stay a documented limit.
   `EnabledPluginsEnv` gains an optional `systemDir` that replaces the OS directory, for tests only.
6. **`defaultEnabled`: not read, closed as won't-do.** Claude's installed-plugin state is in files the docs don't
   describe. sigil's plugins never set `defaultEnabled: false`, and an install writes an explicit `true` (probe B2).
   The only case missed is an installed plugin whose entry the user deleted by hand.
7. **Codex reader.** A plugin is installed when a regular folder
   `<codexHome>/plugins/cache/<marketplace>/<plugin>/` exists **and** `config.toml` has a `plugins."<plugin>@<marketplace>"`
   table (probe C2: Codex reports either one alone as not installed). `codexHome` is `$CODEX_HOME`, or `~/.codex` when it is
   unset. The plugin is enabled by `plugins."<plugin>@<marketplace>".enabled` in `<codexHome>/config.toml`, else
   `plugins._default.enabled`, else `true`. Parse with `smol-toml` (already a dependency), through `readRegularFile`.
   The project `.codex/config.toml` is not read: it applies only in a trusted project, and trust lives in Codex's own
   state. That is a documented limit. Step 1 confirms the layout before step 5 is built.
8. **Antigravity reader and contents.** Antigravity installs sigil's own Antigravity plugins (`build --target
antigravity`), not the Claude marketplace. So the target gets its own `marketplacePluginContents`, computed from the
   code its build uses. Installed plugins are the regular folders in `.agents/plugins/` (workspace, listed first) and
   `~/.gemini/config/plugins/`. A folder counts only when it holds a `plugin.json` whose `name` equals the folder name
   **and** has no `.claude-plugin/` folder. An `agy plugin import claude` copy has that folder, and its hook doesn't
   work on Antigravity (U7), so it must never count. Antigravity has no third-party marketplace, so these overlaps
   have no marketplace. `PluginOverlap.marketplace` becomes optional, and the shared wording drops `@<marketplace>`
   when there is none. Disabled state isn't documented, but probe A2 found it: `agy plugin disable` writes
   `plugins.<name>.enabled: false` to `~/.gemini/config/config.json`. An explicit `false` there drops the plugin (counting
   a disabled plugin would make `--complement` skip something nothing delivers); anything else counts as enabled.
   Antigravity plugins carry only repo-wide rules, and no pack has one today (probe A3).
9. **Cursor: no reader.** Cursor documents no on-disk plugin state outside its development folder, and Phase F is
   paused on Cursor usage. Recorded as left open with that reason.
10. **`status --json` reader warnings go to stderr.** Stdout stays the JSON array (no shape change). The warnings use
    the same `plugin check:` lines the text output prints.
11. **The wizard prints the plugin advisory once.** The plan box already shows it. The wizard runs inside `add`
    (`resolveInputs`), whose inputs already carry `fromWizard`, so `resolveAndPartitionIds` skips
    `printPluginOverlapAdvice` when `ctx.inputs.fromWizard` is true. No new option. Plain `sigil add` is unchanged.
12. **The wizard gets a complement choice.** It appears only when the preview found overlaps, as a select after the
    deps step: "Install them anyway" (default, as plain `add` does) or "Skip what the plugin delivers (--complement)".
    The choice sets `s.complement`, is passed to `add`, and appears in the equivalent command the wizard prints.

Each worker step ends with `npm run build && npm run lint && npm run test:built` green unless it says otherwise.

## Step 1 `[inline: live probe of Codex and Antigravity plugin state]`: confirm the state files

- Codex (`codex` is installed): `codex plugin marketplace add makubexD/sigil --ref marketplace`, then
  `codex plugin add typescript-starter@sigil` (or the form the Codex record used). Expect
  `~/.codex/plugins/cache/sigil/typescript-starter/<version>/`. Turn the plugin off in `/plugins` (Space), then look
  for `[plugins."typescript-starter@sigil"] enabled = false` in `~/.codex/config.toml`. Uninstall afterwards and restore
  `config.toml` byte for byte (back it up first).
- Antigravity: `npm run catalog:build`, then `agy plugin install dist/antigravity/plugins/typescript-starter`. Expect
  `~/.gemini/config/plugins/typescript-starter/plugin.json` with `name: typescript-starter` and no `.claude-plugin/`.
  Run `agy plugin disable typescript-starter` if the command exists, and note any file it changes. Uninstall, and
  leave `~/.gemini/config/` as it was (never delete anything else there).
- Record both under the ADR § 6 Phase 2b paragraph as "Phase 2b follow-up probes". If an expectation fails, amend
  decision 7 or 8 in this file before step 5 or 7.

## Step 2 `[worker:medium]`: overlaps only for kinds the tool loads, from the right contents

- Files: `src/types.ts`, `src/plugin-overlap.ts`, `src/targets/copilot/index.ts`, `test/plugin-overlap.test.ts`.
- `Target` gains `readonly pluginKinds?: readonly ArtifactKind[]` (doc: the kinds this tool loads and runs correctly
  from the plugins it reads; absent means every kind) and `readonly pluginContentsFrom?: string` (doc: the name of the
  target whose built plugins this tool installs; used when the target has no `marketplacePluginContents` of its own).
- `src/plugin-overlap.ts`: replace `registeredPluginContents(catalog, packs)` with
  `pluginContentsFor(target, catalog, packs)`. It returns `target.marketplacePluginContents(...)` when defined, else
  the registered target named `target.pluginContentsFrom`'s, else an empty map. `collectOverlaps` drops an id whose
  artifact kind (looked up in `catalog`) is not in `target.pluginKinds`, when that is set. Update the module header.
- Copilot target: `pluginKinds = ['skill', 'agent', 'prompt']`, `pluginContentsFrom = 'claude-code'`. Cite
  `docs/decisions/copilot-plugin-channel-2026-10.md` in a one-line comment.
- Tests: (a) Copilot with `hook-protect-config` installed in a temp home → `pluginOverlaps` is empty for
  `hook:shared/protect-config`. (b) The same with an installed pack plugin → its skill ids are present and no hook or
  MCP id is. (c) Claude with `hook-protect-config@sigil: true` → the hook id is present (no `pluginKinds`). (d) A stub
  target with neither field → empty, and contents are never computed (spy). Existing tests stay green.

## Step 3 `[worker:medium]`: Claude reader follows `CLAUDE_CONFIG_DIR` and a symlinked user settings file

- Files: `src/types.ts` (`EnabledPluginsEnv` gains optional `vars?: Readonly<Record<string, string | undefined>>`,
  doc: environment variables, readers default to `process.env`), `src/targets/claude-code/enabled-plugins.ts`,
  `test/targets/claude-enabled-plugins.test.ts`.
- User scope: the file is `path.join(vars.CLAUDE_CONFIG_DIR, 'settings.json')` when that variable is non-empty, and its
  `source` is that path with the home prefix shown as `~`. Otherwise it stays `~/.claude/settings.json`.
- User scope only: when `lstat` shows a symbolic link, resolve it with `fs.realpathSync` and read the resolved path
  through `readRegularFile` with the same cap. A broken link is reported as one warning. Project and local scopes are
  unchanged and still refuse a link.
- Tests: (a) `vars: { CLAUDE_CONFIG_DIR: <tmp>/cfg }` with `enabledPlugins` there → found, with `source` naming that
  file. `~/.claude/settings.json` in the temp home is then ignored. (b) An empty `CLAUDE_CONFIG_DIR` → the home file is
  read. (c) A user `settings.json` that is a symlink to a real file → found, no warning. (d) A broken user symlink → one
  warning, other scopes still read. (e) A project `.claude/settings.json` symlink → still refused with a warning (skip
  the symlink tests with `t.skip` when `symlinkSync` throws, as `test/load-references.test.ts` does).

## Step 4 `[worker:medium]`: Claude reader reads file-based managed settings

- Files: `src/types.ts` (`EnabledPluginsEnv` gains optional `systemDir?: string`, doc: replaces the OS policy
  directory, for tests), `src/targets/claude-code/enabled-plugins.ts`, `test/targets/claude-enabled-plugins.test.ts`.
- Managed dir: `systemDir`, else `/Library/Application Support/ClaudeCode` on `darwin`, `C:\Program Files\ClaudeCode` on
  `win32`, and `/etc/claude-code` otherwise. Read `managed-settings.json`, then each non-hidden `*.json` in
  `managed-settings.d/` sorted by name. Merge their `enabledPlugins` objects key by key, later files winning. The
  result is the highest scope, ahead of local, with `source` `managed settings (<file that set the key>)`. Read
  through `readRegularFile`. A missing dir or file is silent. An unreadable or invalid one is one warning, and the
  other scopes are still read. A non-boolean entry is ignored.
- Update the module header: managed file-based policy is read; server-managed, MDM and registry policy are not.
- Tests: (a) managed `true` while local says `false` → counted, source names the managed file. (b) managed `false`
  while project says `true` → not counted. (c) `managed-settings.d/20-b.json` overrides `10-a.json` and
  `managed-settings.json` for the same key. (d) A `.hidden.json` drop-in is ignored. (e) Invalid JSON in a drop-in → one
  warning, the other drop-ins and scopes still apply. (f) No managed dir → no warning.

## Step 5 `[worker:medium]`: Codex plugin reader

- Files: new `src/targets/codex/enabled-plugins.ts`, `src/targets/codex/index.ts`, new
  `test/targets/codex-enabled-plugins.test.ts`.
- `readCodexEnabledPlugins(env)` per decision 7: `codexHome` = `vars.CODEX_HOME` when non-empty, else
  `<homeDir>/.codex`. List regular folders (never links) under `<codexHome>/plugins/cache/<marketplace>/`, as the Copilot
  reader does. Read `<codexHome>/config.toml` through `readRegularFile` (1 MiB cap), parse it with `smol-toml`. A
  folder counts only when `plugins["<name>@<marketplace>"]` is a table; then apply its `enabled`, then
  `plugins._default.enabled`, then `true`. Only a boolean counts. A missing `config.toml` means nothing is installed.
  A bad TOML file is one warning, and every cache folder then counts as enabled. `source` is
  `~/.codex/plugins/cache/<marketplace>/<name>` (or the `CODEX_HOME` path). Results are sorted by name.
- Codex target: `enabledPlugins` calls it, `pluginKinds = ['skill']`, `pluginContentsFrom = 'claude-code'` (comment
  cites `docs/decisions/codex-target-2026-10.md` § Plugins).
- Tests: (a) an installed folder with a bare `[plugins."<name>@<mp>"]` table → enabled; the same folder with no
  `config.toml`, or a `config.toml` without that table → not counted. (b) An explicit `enabled = false` → not counted. (c)
  `_default.enabled = false` with an explicit `true` for one plugin → only that one. (d) `CODEX_HOME` respected. (e)
  Invalid TOML → one warning, installed plugins counted. (f) A symlinked plugin folder → skipped. (g) Through
  `pluginOverlaps` with the real catalog: an installed `typescript-starter` yields its skill ids and no agent id.

## Step 6 `[worker:medium]`: Antigravity plugin contents from the build's own code

- Files: new `src/targets/antigravity/plugin-contents.ts`, `src/targets/antigravity/index.ts` (and
  `plugin-assemble.ts` / `plugin-config.ts` only if the build loop must read membership from it), new
  `test/targets/antigravity-plugin-contents.test.ts`.
- `antigravityPluginContents(catalog, packs)`: plugin name → sorted catalog ids, in build order, from the same pack
  membership `buildAntigravityPlugins` uses and the config plugins `buildAntigravityConfigPlugins` emits. Mirror
  `src/targets/claude-code/plugin-contents.ts`. Expose it as the target's `marketplacePluginContents`.
- Tests: (a) The key set equals the `plugins/<name>/` folders of a fresh `build --target antigravity`. (b) Each
  plugin's ids are exactly what its built folder holds: for `typescript-starter`, its skills and agents, and no
  scoped rule (only repo-wide rules ship, and no pack has one today; probe A3). (c) `dist/antigravity/` is byte-identical
  before and after (build twice and `diff -r`).

## Step 7 `[worker:medium]`: optional marketplace on an overlap

- Files: `src/plugin-overlap.ts`, `src/commands/status-plugins.ts`, `src/manifest` status type that declares
  `StatusResult['plugin']` (find it with `grep -rn "plugin?:" src/manifest`), `test/plugin-overlap.test.ts`.
- `EnabledPluginsResult` gains `marketplace?: false` (doc: the tool installs plugins outside any marketplace). When it
  is `false`, `pluginOverlaps` leaves `PluginOverlap.marketplace` out. Otherwise it stays `env.marketplace`, as today.
  `PluginOverlap.marketplace` and the status row's `marketplace` become optional.
- `formatPluginOverlap`: `plugin <name>@<marketplace>` when a marketplace is set, `plugin <name>` otherwise.
- Tests: the wording with and without a marketplace. A status row without one has no `marketplace` key in `--json`.

## Step 8 `[worker:medium]`: Antigravity plugin reader

- Files: new `src/targets/antigravity/enabled-plugins.ts`, `src/targets/antigravity/index.ts`, new
  `test/targets/antigravity-enabled-plugins.test.ts`.
- `readAntigravityEnabledPlugins(env)` per decision 8: regular folders (never links) under
  `<projectDir>/.agents/plugins/` then `<homeDir>/.gemini/config/plugins/`. A folder counts when its `plugin.json`,
  read through `readRegularFile` (64 KiB cap), parses to an object whose `name` equals the folder name, and it has no
  `.claude-plugin` entry. The first folder for a name wins. `source` is `.agents/plugins/<name>` or
  `~/.gemini/config/plugins/<name>`. It returns `marketplace: false` (step 7). An unreadable or invalid `plugin.json` is
  one warning. Then read `<homeDir>/.gemini/config/config.json` through `readRegularFile` (1 MiB cap): a plugin whose
  `plugins.<name>.enabled` is exactly `false` is dropped (decision 8, probe A2). A missing file is silent; an invalid
  one is one warning, and every found plugin then counts.
- Antigravity target: `enabledPlugins` calls it. No `pluginKinds` (its own plugins carry every kind they hold).
- Tests: (a) A user-scope folder with a matching `plugin.json` → counted. (b) The same name in both scopes →
  the workspace source. (c) A folder holding `.claude-plugin/` → not counted. (d) `name` mismatch → not counted. (e)
  Invalid JSON → one warning. (f) `config.json` with `{"plugins": {"<name>": {"enabled": false}}}` → not counted;
  `true` or no entry → counted; invalid `config.json` → one warning, still counted. (g) Through `pluginOverlaps` with
  the real catalog: an installed `typescript-starter` yields its skill and agent ids, and the wording has no `@`.

## Step 9 `[worker:medium]`: `status --json` prints reader warnings to stderr

- Files: `src/commands/status.ts`, `test/commands/status-plugins*.test.ts` (the existing status plugin test file).
- In the `opts.json` branch, print each reader warning with the same `plugin check:` wording as the text output,
  to stderr (`printPluginCheckWarnings`, which uses `log.warn`; confirm `log.warn` writes to stderr, else use
  `console.error`). Stdout must still parse as the JSON array.
- Test: a project whose `.claude/settings.json` is invalid JSON → `status --json` stdout parses, and stderr holds one
  `plugin check:` line.

## Step 10 `[worker:medium]`: the wizard prints the plugin advisory once

- Files: `src/commands/add/plan.ts` (`resolveAndPartitionIds`: skip `printPluginOverlapAdvice` when
  `ctx.inputs.fromWizard`; the returned `pluginOverlaps` is unchanged), `test/commands/add-plugin-overlap.test.ts`.
- Amended 2026-11-03: the wizard runs inside `add` (`resolveInputs` → `runWizardAt`), so there is no separate wizard
  `runAdd` call to pass an option from; `fromWizard` already says the plan box showed the advisory.
- Test: an add run whose inputs come from the wizard, with one overlapping pick → the `already delivers` header is
  not printed by `add` (the plan box printed it). Plain `add` with the same pick still prints it once.

## Step 11 `[worker:medium]`: the wizard's complement choice

- Files: `src/wizard/steps/add/state.ts` (`complement?: boolean`), new `src/wizard/steps/add/complement.ts`,
  `src/wizard/steps/add/index.ts` (register it right after `depsStep`), the code that builds the `add` options and the
  equivalent command (`src/wizard/command-strings.ts`), and a test next to the existing add-step tests.
- The step is skipped unless `previewPluginOverlaps(s, ids)` is non-empty. It is a select titled
  `Some picks are already delivered by an enabled plugin`, with options `Install them anyway` (value `no`,
  initial) and `Skip what the plugin delivers (--complement)` (value `yes`). It sets `s.complement`. `add` gets
  `complement: s.complement === true`, and the printed command gains `--complement` when it is true. The plan box's
  overlap lines are hidden when `s.complement` is true (they are skipped, not installed), and the skip shows in the
  plan box's skipped list.
- Follow `src/wizard/CLAUDE.md` (step registry rules). Tests: (a) no overlaps → the step doesn't run. (b) Choosing
  `yes` → the command string holds `--complement`, and the overlapping id isn't written. (c) The default → installed,
  and no flag.

Amended 2026-11-03: split in three. `add` reads `ctx.opts.complement` and the wizard runs inside `add`, so the choice
has to come back through `WizardResult` and `ResolvedAddInputs`. Each part ends with build, lint and tests green.

### Step 11a `[worker:medium]`: `add` takes complement from its inputs

- Files: `src/wizard/types.ts` (`WizardResult.complement?: boolean`), `src/commands/add/resolve-inputs.ts`
  (`ResolvedAddInputs.complement: boolean`: typed = `opts.complement === true`; wizard =
  `wizardResult.complement ?? opts.complement === true`), `src/commands/add/plan.ts` (read `ctx.inputs.complement`
  wherever it read `ctx.opts.complement`; add `effectiveComplement: boolean` to `AddPlan` and the effective fields), and
  `test/commands/add-plugin-overlap.test.ts`.
- Test: a typed `--complement` add still skips the overlapping id (existing tests stay green).

### Step 11b `[worker:medium]`: the equivalent command shows `--complement`

- Files: `src/wizard/command-strings.ts` (`EquivalentCommandOptions.complement?: boolean` → appends `--complement`),
  `src/commands/add/render.ts` (pass `plan.effectiveComplement`), and the existing `buildEquivalentCommand` test file.
- Tests: `complement: true` → the command ends with `--complement`; absent or `false` → no flag.

### Step 11c `[worker:medium]`: the wizard step

- Files: `src/wizard/steps/add/state.ts` (`complement?: boolean`), new `src/wizard/steps/add/complement.ts`,
  `src/wizard/steps/add/index.ts` (register after `depsStep`), `src/wizard/add.ts` (copy `s.complement` into
  `WizardResult.complement`), `src/wizard/steps/add/proceed.ts` / `plan-box.ts` (under `s.complement`, no overlap lines;
  those ids in the skipped list), and a wizard test next to the existing add-step tests.
- The select and its options are as in step 11 above. Tests (a)-(c) as in step 11, driven through the wizard.

## Step 12 `[worker:medium]`: docs

- `docs/guides/consuming.md` (duplicate guard section): Codex and Antigravity are covered. Only the kinds each tool
  loads count (the Copilot hook case). Managed file policy, `CLAUDE_CONFIG_DIR` and a symlinked user settings file are
  read. MDM, server-managed policy and the Codex project config are not. Antigravity overlaps have no marketplace.
- `docs/reference/spec.md` `add` row: `--complement` covers Claude Code, Copilot, Codex and Antigravity.
- `CHANGELOG.md` `[Unreleased]`: a **Fixed** line for the Copilot hook/MCP case, plus **Added** lines for the readers
  and the wizard choice.
- ADR § 6 Phase 2b paragraph: replace the "Left open" list with what's done and what's still left: Cursor (decision
  9), `defaultEnabled` (decision 6, won't-do), MDM/server-managed policy, and the Codex project config.

## Step 13 `[inline: live check]`: prove it

- Codex: install `typescript-starter@sigil` as in step 1, then in a scratch project
  `sigil add skill:typescript/ts-generate-tests --target codex` → warning; `--complement` → skipped; `sigil status` →
  note. Then `hook-protect-config@sigil` in Codex and `sigil add hook:shared/protect-config --target codex --complement`
  → **installed** (hook is not a Codex plugin kind).
- Antigravity: install `dist/antigravity/plugins/typescript-starter`, then the same `add` / `--complement` / `status`
  sequence with `--target antigravity`.
- Clean up both tools as in step 1, and record the results in the ADR's Phase 2b paragraph.

Commit trailers per step as the global rules say (`Plan-Step: docs/plan-complement-follow-ups.md#<n>`).
