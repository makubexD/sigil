# Plan: Antigravity target, Phase F (plugin channel)

Phase F of [plan-antigravity-target.md](plan-antigravity-target.md). Evidence:
[antigravity-target-2026-11.md](decisions/antigravity-target-2026-11.md) (D8, U7, and F1 below). The phase follows
[Rules for every target](reference/architecture.md#rules-for-every-target). Branch `feat/antigravity-target-f`, one PR.

U7 showed that `agy plugin import` of sigil's Claude plugin is not a channel, so sigil builds an Antigravity plugin
itself. The model is the Claude plugin build (`src/targets/claude-code/plugin-assemble.ts`, `plugin-build.ts`,
`plugin-config.ts`): pack plugins for whole-file kinds, plus one generated plugin per hook or MCP artifact. Antigravity
differs in five places ([Build plugins](https://antigravity.google/docs/build-plugins),
[Plugins](https://antigravity.google/docs/plugins), checked 2026-11-02):

- **Closed manifest.** `plugin.json` at the plugin root, `additionalProperties: false`. Only `name` is required, and it
  must be kebab-case. There is no `dependencies` field and no marketplace file.
- **Rules ship as files.** `rules/AGENTS.md` is always on, and `rules/<name>.md` takes a `trigger`. Claude's plugin has
  to inline rules into skills; this one doesn't.
- **Agents need a YAML list for `tools`.** U7's agent was skipped for a string.
- **Hooks and MCP sit at the plugin root**: `hooks.json` (named hooks, as in Phase E) and `mcp_config.json`. MCP keys
  are namespaced `<plugin>_<key>`. `${NAME}` expands only for a name declared in `mcpServers.<key>.variables`.
- **No third-party marketplace.** Install is `agy plugin install <path | GitHub URL>` (user profile, read-only copy)
  or a folder placed in `.agents/plugins/<name>/` (workspace).

**Gate:** step 1 must show that an installed plugin's skill reaches a session. If no install route delivers it, stop
after step 1. The plugin channel then stays `none`, and the roadmap records the phase as cut.

## Decisions (settled from the docs; step 1 may amend 3, 5 and 6)

1. **Layout.** `sigil build --target antigravity` writes `dist/antigravity/plugins/<name>/`, one folder per plugin,
   each with `plugin.json` at its root. This replaces today's scaffold layout in `dist/antigravity/`, the same way
   Claude's build is plugin-only. `add` stays the scaffold route. `.antigravity-plugin/plugin.json` is not used,
   because each plugin has its own folder and no other provider's manifest sits beside it.
2. **Plugins and members.**
   - The pack plugins come from `packs.yaml` through `getPackArtifacts` (`pluginExclude` is honoured), with the same
     shared-agent closure as Claude's `computeSharedAgentIds`.
   - Members are skills, agents (each with the shared agents its skills use) and rules. A pack with none of those gets
     no plugin.
   - `pluginDependencies` cannot be expressed in a closed manifest without a `dependencies` field, so it is ignored
     here. The setup page tells users to install the hook plugin as well.
   - Hooks and MCP get one generated plugin each, `hook-<basename>` / `mcp-<basename>` (`configPluginName`), so
     installing a pack never adds a hook. A generated name that collides with a pack plugin or another generated plugin
     fails the build, as it does for Claude.
   - `getPackArtifacts` and `configPluginName` move to `src/targets/shared/plugin-packs.ts`. One target never imports
     another.
3. **Skills.** Each skill uses the scaffold skill spec under `plugins/<pack>/skills/<name>/SKILL.md`, with the same
   frontmatter, references, limits and inlined `uses.rules`. A scoped rule reaches Antigravity only inlined (B1), so
   skills keep inlining their rules. The folder name equals `name` (pre-publish checklist).
4. **Rules.** Each rule uses the scaffold rule spec under `plugins/<pack>/rules/<id with / as ->.md` (`trigger:
always_on`). A scoped rule is skipped by the same `skipReason` as on the scaffold, with B1 as the reason, because
   the docs' `glob` trigger never attached there. Rules are not merged into `rules/AGENTS.md`: one file per rule keeps
   the 24,000-byte limit per file and the conformance checks unchanged.
5. **Agents.** Each agent uses the scaffold agent spec under `plugins/<pack>/agents/<name>.md`: list-valued `tools`
   from `ANTIGRAVITY_AGENT_TOOL_DIALECT`, and model tiers from `ANTIGRAVITY_MODEL_TIERS`. `inheritMcp` and
   `inheritCustomizations` are not written (their defaults apply), so the spec stays the same on both channels.
6. **Config plugins.**
   - `hooks.json` holds exactly the fragment that `buildAntigravityHookOps(artifact, 'project')` merges into
     `.agents/hooks.json`. The command is a self-contained `node -e` line, so it runs no matter which `cwd` the plugin
     root gives it.
   - `mcp_config.json` holds the server that `buildAntigravityMcpOps` writes: `{ mcpServers: { <key>: <config> } }`.
     It keeps the `inherited` env handling if F1f shows that a plugin's server inherits `agy`'s environment. If it
     does not, the plugin writes `${NAME}` plus one `variables` entry per env name (`name`, `title` = the name), the
     only expansion the docs give a plugin.
   - An artifact whose `skipReason` refuses it gets no plugin.
7. **Manifest.** The fields are `$schema` (`https://antigravity.google/schemas/v1/plugin.json`), `name`, `displayName`,
   `version` (`pkg.version`, passed in as for Claude), `description`, `author` (`{name, url}`, from the configured
   marketplace identity when there is one and sigil's otherwise, the same as `resolveIdentityContact`), `homepage`,
   `license` when known, and `keywords`. No other key is written. `logo` and `suggestedPrompts` are left out: they are
   Marketplace-only, and U7 saw a missing `logo` only as a note. A pack name that starts with `antigravity`, `gemini`,
   `claude` or `cursor` fails the build (pre-publish checklist).
8. **Capabilities.** The Antigravity `plugin` channel gets `skill`, `rule`, `agent`, `hook` and `mcp` as `native`.
   `prompt` and `workflow` are `none` with the scaffold reason, `settings` is `none` ("the manifest schema has no
   settings field", citing Build plugins), and `template` is `TEMPLATE_NOT_EMITTED`. `docs/reference/capabilities.md`
   is regenerated.
9. **Conformance.** `scripts/validate-antigravity-plugins.cjs` runs `agy plugin validate --strict` on every
   `dist/antigravity/plugins/*`. It is wired into `ci:local` after `catalog:build`. It skips with a notice when `agy`
   is not on PATH, in CI too, because CI has no `agy` (and if F1g shows validate needs a sign-in, it skips when signed
   out). Unlike the Claude script, it never fails CI for a missing binary.
10. **Distribution.** The documented routes are `agy plugin install dist/antigravity/plugins/<name>` (user) and copying
    the folder to `.agents/plugins/<name>/` (workspace). Publishing a branch for the GitHub-URL route is release work,
    left to Phase G or later. F1h records whether a URL can point at a subfolder.

Out of this phase: a `marketplace`-style branch for Antigravity, `logo` / `suggestedPrompts`, prompts as
`disable-model-invocation` skills (U1), `rules/AGENTS.md` aggregation, and the `agy plugin import` route.

## Probe rules (steps 1 and 10)

- Record `agy --version`. Runs use `agy --model gemini-3.8-flash-low --output-format stream-json --print-timeout 90s`,
  with `-p "…"` last. Each runs in a fresh `git init` repo in the scratchpad, never in this repo.
- Each probe component carries a unique codeword (skill `SKILL-F1`, rule `RULE-F1`, agent `AGENT-F1`). A pass needs the
  codeword in the model's answer, not just a file read.
- Writes need a session-only `--settings '{"permissions":{"allow":["write_file(*)"]}}'`, and shell needs
  `command(*)`. The auto-mode classifier allows only the forms in `.claude/settings.local.json`; on a denial, stop and
  report.
- Clean up after each step: `agy plugin uninstall <name>` for every probe plugin, then confirm that
  `agy plugin list --json` is `[]`. Remove anything left in `~/.gemini/config/plugins/` and
  `~/.gemini/config/import_manifest.json` (U7 saw both left behind). Never touch anything else in `~/.gemini/`.

## Step 1 `[inline: probe measures Antigravity's plugin loader]`: F1 in the ADR

Build the fixture plugin `sigil-probe` by hand, in the decision 2-7 shape: root `plugin.json` (decision 7's keys),
`skills/probe-skill/SKILL.md`, `rules/probe-rule.md` (`trigger: always_on`), `agents/probe-agent.md` (`tools:
[read_file]`, `model: flash`), `hooks.json` (one named `PreToolUse` hook that exits 2 on a `.env` path, the Phase E
shape), and `mcp_config.json` (one stdio server whose command echoes `$PROBE_F1` back as a tool result, with no
`variables`).

| Case | Route / action                                                                                            | Pass                                                  |
| ---- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| F1a  | `agy plugin install <fixture>`; ask for the probe-skill's marker                                          | `SKILL-F1` answered (**the gate**)                    |
| F1b  | the fixture copied to `.agents/plugins/sigil-probe/`, not installed; same question                        | `SKILL-F1` answered                                   |
| F1c  | the installed route; ask for every codeword the rules give                                                | `RULE-F1`                                             |
| F1d  | `agy --agent probe-agent -p "say your marker"`                                                            | `AGENT-F1`                                            |
| F1e  | "create `.env` holding `A=1`" (with the file-tool allow)                                                  | no `.env`, the hook's reason in the stream            |
| F1f  | `PROBE_F1=x agy …`; ask the model to call the probe server's tool                                         | `x` in the result means env is inherited              |
| F1g  | `agy plugin validate --strict <fixture>`, signed in and with `HOME` pointed at an empty folder            | exit 0; record every note and whether sign-in matters |
| F1h  | `agy plugin install https://github.com/makubexD/sigil/tree/master/<any plugin dir>` (dry: then uninstall) | record accepted or refused                            |

If F1a and F1b both fail, record it, stop, and ask the owner whether to cut the phase. If F1a or F1b passes, amend
decisions 3, 5 and 6 from F1c-F1f before step 2 is sent. For F1h, if no plugin folder exists in the repo yet, record
it as "not run" and leave decision 10 as written.

Add a `### Phase F` subsection after `### Phase E` in the ADR's probe log, with one row, F1, and the runs. In D8,
replace the "Claude import" bullet's open question with U7 and F1's answer.

Test: `npx prettier --check docs/decisions/antigravity-target-2026-11.md docs/plan-antigravity-target-f.md`.

## Step 2 `[worker:medium]`: shared pack helpers

Files: `src/targets/shared/plugin-packs.ts` (new), `src/targets/claude-code/plugin-build.ts`,
`test/targets/plugin-packs.test.ts` (new).

- Move `configPluginName` and `getPackArtifacts` from `plugin-build.ts` into `plugin-packs.ts`, together with their
  doc comments, unchanged. `plugin-build.ts` re-exports both (`export { configPluginName, getPackArtifacts } from
'../shared/plugin-packs'`) so no other import changes.
- Move `computeSharedAgentIds` from `plugin-assemble.ts` into `plugin-packs.ts` too, exported, and import it back in
  `plugin-assemble.ts`. That is a fourth file, but a one-line change.
- Tests in `plugin-packs.test.ts`:
  - `configPluginName({id: 'shared/protect-config', kind: 'hook'})` → `hook-protect-config`.
  - `getPackArtifacts` with an explicit list minus `pluginExclude` keeps the list order and drops the excluded id.
  - `getPackArtifacts` by `languages` returns only the matching-language artifacts.
  - `computeSharedAgentIds` returns a skill's agent that is not among the pack's agents, adds it to the install set,
    and leaves out an excluded id.

Test: `npm run build && node --test test-compiled/test/targets/plugin-packs.test.js && npm test`, all green with no
Claude output change (`dist/` is gitignored: copy `dist/claude` aside before, `npm run catalog:build`, then
`diff -r` shows nothing).

## Step 3 `[worker:medium]`: plugin-variant emit specs

Files: `src/targets/antigravity/spec/skill.ts`, `spec/rule.ts`, `spec/agent.ts` (`spec/index.ts` lists the three new
specs).

- Each existing spec gets `variant: 'scaffold'`. Then add `ANTIGRAVITY_PLUGIN_SKILL_SPEC`, `…_RULE_SPEC` and
  `…_AGENT_SPEC`, each `{ ...scaffoldSpec, variant: 'plugin', outputPath }`:
  - skill: `plugins/${ctx.packName}/skills/${name}/SKILL.md`;
  - rule: `plugins/${ctx.packName}/rules/${id with / → -}.md`;
  - agent: `plugins/${ctx.packName}/agents/${name}.md`.
- `outputPath` throws a `SigilError` when `ctx.packName` is undefined. Everything else (frontmatter, body, limits,
  `skipReason`, docs, lexicon) is shared by the spread.
- `ANTIGRAVITY_EMIT_SPECS` holds all six. `deriveContracts` and the conformance rules take care of the new specs on
  their own. If `provider-kind-coverage` or `declared-but-unemitted` complains, report it; don't silence it.

Test: `npm run build && node dist-cli/cli.js sync --check && npm test`. Existing scaffold output is unchanged:
`test/targets/antigravity*.test.ts` pass untouched.

## Step 4 `[worker:medium]`: the manifest

Files: `src/targets/antigravity/plugin-manifest.ts` (new), `test/targets/antigravity-plugin-manifest.test.ts` (new).

`antigravityPluginJson(pack: Pack, opts: { version: string; homepage?: string; marketplace?: MarketplaceIdentity }):
string` builds the decision 7 manifest, `JSON.stringify(…, null, JSON_INDENT) + '\n'`. Key order: `$schema`, `name`,
`displayName`, `version`, `description`, `author`, `homepage`, `license`, `keywords`. A key whose value is `undefined`
is left out. The author follows Claude's `resolveIdentityContact` rule, copied into a small local helper rather than
imported (no cross-target import): with no identity, `{ name: 'Sigil', url: homepage ?? 'https://github.com/makubexD/sigil#readme' }`
and `license: 'MIT'`. A name matching `/^(antigravity|gemini|claude|cursor)(-|$)/` throws a `SigilError` that names the
pack and the checklist rule.

Tests:

- with no identity: the exact object above, keys in that order, `keywords` = the pack's `languages` (`[]` when absent);
- with an identity: the author from `author ?? owner`, its `url` defaulting to the identity's `homepage`, `license`
  only when set;
- every key is in the published schema's property list (hard-code the 15 property names from the docs as the allowed
  set);
- a pack named `claude-tools` → throws; `tools-claude` → fine.

Test: `npm run build && node --test test-compiled/test/targets/antigravity-plugin-manifest.test.js`.

## Step 5 `[worker:medium]`: config plugins

Files: `src/targets/antigravity/plugin-config.ts` (new), `test/targets/antigravity-plugin-config.test.ts` (new).

`buildAntigravityConfigPlugins(catalog, opts): { name: string; files: FileMap }[]`. For each `hook`, then each `mcp`,
artifact that `artifactTargetsPlatform(a, 'antigravity')` allows and `ANTIGRAVITY_CONFIG_KINDS[kind].skipReason`
doesn't refuse:

- the name is `configPluginName(a)`, and `displayName` is the artifact's `title`;
- the description is the catalog description. An MCP artifact also names its env variables (copy the
  `configDescription` wording without the Claude-only sentence: "Requires the environment variable X.");
- `plugins/<name>/plugin.json` comes from `antigravityPluginJson`;
- `plugins/<name>/hooks.json`, or `plugins/<name>/mcp_config.json`, is the value of every op from
  `buildOps(a, 'project')`, merged into `{}` with `applyMerge` (`src/config-merge`) and written with `serialize` plus
  `'\n'`. Never `canonicalize`.
- If step 1 amended decision 6 to `variables`, the MCP plugin's spec text is amended in this step before sending.

Tests:

- `shared/protect-config` → `plugins/hook-protect-config/hooks.json` deep-equals the fragment `add` writes to
  `.agents/hooks.json` (`buildAntigravityHookOps`' merged value); the manifest's `name` is `hook-protect-config`;
- a hook with `platforms: [claude]` gets no plugin;
- a fixture MCP artifact with an identity env entry → `mcp_config.json` equals the scaffold server, and the
  description names the variable;
- an MCP artifact that the skip reason refuses gets no plugin.

Test: `npm run build && node --test test-compiled/test/targets/antigravity-plugin-config.test.js`.

## Step 6 `[worker:medium]`: assemble, compile, capabilities

Files: `src/targets/antigravity/plugin-assemble.ts` (new), `src/targets/antigravity/index.ts`,
`src/targets/antigravity/capabilities.ts`.

- `buildAntigravityPlugins(catalog, options: CompileOptions): FileMap`:
  - for each pack: members = `getPackArtifacts` filtered to `skill`, `rule` and `agent` (decision 2), plus the shared
    agents from `computeSharedAgentIds`;
  - skip a pack with no member that `specFor(…, 'plugin')` would write and no `specSkipReason`;
  - otherwise write `plugins/<pack>/plugin.json` and every member through `emitFile` with
    `ctx = { catalog, installSet, packName }`;
  - the same "two members write one path" `SigilError` as Claude's `writeMemberFiles`;
  - then add `buildAntigravityConfigPlugins`, failing with a `SigilError` on a name already taken (Claude's wording).
- `compile()` returns `buildAntigravityPlugins(catalog, options)`. Update the class and module doc comments: build
  writes plugins, and `add` writes the scaffold.
- `capabilities.ts`: add the decision 8 `plugin` table and update its doc comment.
- Run `npm run build` so `docs/reference/capabilities.md` regenerates, and commit it.
- Grep for readers of `dist/antigravity` (`rg -n "dist/antigravity|'antigravity'" src scripts test`) and report every
  hit that assumed the scaffold layout. Fix test expectations only where they asserted the old build layout.

Test: `npm run build && node dist-cli/cli.js sync --check && npm test && npm run catalog:build && ls dist/antigravity/plugins`.
Expect one folder per non-empty pack plus `hook-protect-config`.

## Step 7 `[worker:medium]`: build tests

Files: `test/targets/antigravity-plugin-build.test.ts` (new).

Over the real catalog and `packs.yaml` (the loader the other target build tests use), with `compile()`:

| Case                  | Expected                                                                                              |
| --------------------- | ----------------------------------------------------------------------------------------------------- |
| layout                | every path starts with `plugins/<name>/`; no `.agents/` path                                          |
| manifest per plugin   | each `plugins/<x>/` has `plugin.json`, whose `name` is `<x>` and whose `version` is `pkg.version`     |
| skill folder          | every `skills/<d>/SKILL.md` has frontmatter `name: <d>`                                               |
| agent tools           | every `agents/*.md` with `tools` holds a YAML list, never a string                                    |
| rule trigger          | every `rules/*.md` has `trigger: always_on`; no catalog rule with a scoped `appliesTo` appears        |
| no prompt or workflow | no file from a `prompt` or `workflow` artifact                                                        |
| excluded              | `shared/author-artifact` (a `pluginExclude` entry) appears in no plugin                               |
| config plugin         | `plugins/hook-protect-config/hooks.json` exists; no pack plugin has `hooks.json` or `mcp_config.json` |
| empty pack            | a fixture pack holding only a hook gets no pack plugin                                                |
| collision             | a fixture pack named `hook-protect-config` → `SigilError` naming the name                             |

Each case must fail for the right reason before step 6's code: check by stashing the `compile()` change and recording
which cases fail.

Test: `npm run build && node --test test-compiled/test/targets/antigravity-plugin-build.test.js`.

## Step 8 `[worker:medium]`: the strict validator in `ci:local`

Files: `scripts/validate-antigravity-plugins.cjs` (new), `package.json`.

- Modelled on `scripts/validate-claude-plugins.cjs`. It runs `agy plugin validate --strict <dir>` for each
  `dist/antigravity/plugins/*`, prints one line per plugin, and exits 1 on any failure, printing that plugin's output.
- When `agy --version` fails, it prints a skip notice and exits 0, even with `CI=true` (decision 9). If F1g showed that
  validate needs a sign-in, it also skips, with that reason, when `agy` reports it is signed out.
- `package.json`: add `"validate:antigravity-plugins": "node scripts/validate-antigravity-plugins.cjs"`, and append
  `&& npm run validate:antigravity-plugins` to `ci:local` right after `validate:claude-plugins`.

Test: `npm run catalog:build && npm run validate:antigravity-plugins` exits 0 here, where `agy` is installed. With
`PATH` lacking `~/.local/bin`, it prints the skip notice and exits 0. A deliberately broken copy of one plugin (extra
manifest key) in a temp `dist` makes it exit 1. Run that last case by pointing the script's env override (add
`SIGIL_ANTIGRAVITY_DIST`) at the temp folder.

## Step 9 `[inline: user-facing copy]`: docs

- `docs/setup/antigravity.md`, a "Plugins" section with:
  - what `sigil build --target antigravity` writes;
  - both install routes (decision 10), and a cleanup line;
  - that a pack plugin carries no hooks and `pluginDependencies` is not expressed, so install `hook-<x>` as well;
  - scoped rules skipped as on the scaffold;
  - the MCP env behaviour from F1f.
- `docs/reference/architecture.md` and `docs/guides/operations.md`: the Antigravity build is now plugin-shaped, and
  `ci:local` runs the strict validator.
- The ADR's capability rows (draft): the plugin column, F1 results.
- Roadmap § Phase F: `(done 2026-11-02)` with a paragraph, and Phase G's line: the GitHub-URL/branch question if F1h
  left it open.
- `npx prettier --write` on every touched doc; `npm run check` green.

## Step 10 `[inline: live check measures Antigravity]`: F2, a sigil-built plugin delivers

From a fresh `npm run catalog:build`, in a scratch repo, following the probe rules:

| Case | Action                                                                                                                    | Pass                                        |
| ---- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| F2a  | `agy plugin install dist/antigravity/plugins/essentials`; ask for a task that skill covers, by name                       | the skill named in the transcript as loaded |
| F2b  | `agy plugin install dist/antigravity/plugins/hook-protect-config`; "create `.env` holding `A=1`" with the file-tool allow | no `.env`, the hook's reason in the stream  |
| F2c  | a pack with an agent (`typescript-starter` or the smallest such pack): `agy --agent <name> -p "say your name"`            | the agent runs (not "unknown agent")        |
| F2d  | `agy plugin validate --strict` on all three                                                                               | exit 0                                      |

Then uninstall each and confirm `agy plugin list --json` is `[]`. Record F2 in the ADR's `### Phase F` subsection.
A failure is a stop: report it with the run's transcript lines, and don't merge.

Test: `npx prettier --check docs/decisions/antigravity-target-2026-11.md`.
