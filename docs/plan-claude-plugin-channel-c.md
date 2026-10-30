# Plan: hooks and MCP as opt-in plugins (Phase C of `plan-claude-plugin-channel.md`)

Branch: `feat/plugin-hooks-mcp`. One PR.

## Spike results (2026-10-30, Claude Code 2.1.314)

Each probe ran as `claude -p --plugin-dir` in a throwaway project with `--setting-sources project,local`, and the
hook probes used the real catalog commands. MCP probes used a local mock server that records its argv, env and cwd.

| #   | Question                                           | Result                                                                                                                                                                                                                                                                                                 |
| --- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Exec-form `node -e` in `hooks/hooks.json`; exit 2? | Works. `protect-config` blocked `.env` (exit 2, file absent) and allowed `.env.example`. The control without the plugin wrote `.env`.                                                                                                                                                                  |
| 2   | `${ADO_ORG}` in a plugin `.mcp.json`, set          | Expanded in `args` and `env`.                                                                                                                                                                                                                                                                          |
| 2   | Same, unset                                        | The server still starts, with the literal text `${ADO_ORG}` as its argument and `${ADO_MCP_PERSONAL_TOKEN}` as its token. `mcp list` says Connected and showed no warning, although the docs promise one. A project `.mcp.json` behaves the same at startup, so a plugin is no worse than `sigil add`. |
| 3   | `reviewer-bash-guard` against a plugin agent       | Blocks. `agent_type` is `probe-agents:cs-code-reviewer`, and the guard allowed `git status --short` from the same agent. The control without the guard created the file.                                                                                                                               |
| 4   | Same hook from a plugin and from settings          | Runs twice. Settings files dedupe among themselves (project + local ran once). Same `command` with different `args` stays two hooks, so sigil's `node` hooks do not swallow each other.                                                                                                                |
| 4   | Same MCP server name, different endpoint           | Both run, so the tools appear twice (`mcp__ado__…` and `mcp__plugin_<plugin>_ado__…`).                                                                                                                                                                                                                 |
| 4   | Same endpoint, different name                      | The plugin server is dropped and the project server wins. A `sigil add` copy of the same artifact is this case once its values expand alike.                                                                                                                                                           |

Extra checks, added because the catalog depends on them:

- **`shared/filesystem` passes `"."`.** A plugin server's cwd is the session directory, not the plugin folder, and
  `CLAUDE_PROJECT_DIR` matches it, so `.` means the same thing as it does from `sigil add`.
- **`dependencies`:** a bare name loads when the dependency is present. When missing, the dependent plugin is disabled
  with `Dependency "hook-log" is not installed`.
- **Error text:** a blocked hook returns its whole command to the model (1.6K for `protect-config`, 7.4K for
  `reviewer-bash-guard`). A settings hook does the same (1.5K measured), so this is not new to plugins. Out of scope.
- **`claude plugin validate --strict` passes** for both shapes with `author` and `license`, which sigil's manifests
  carry. README and icon findings are directory advice and do not fail it.

Not covered:

- `/plugin install` from a marketplace, including auto-install of a dependency, because `marketplace add` writes to
  the user's settings. `--plugin-dir` does not exercise it. Step 9 records it for the owner's clean-machine check.
- An interactive session. Everything ran under `-p`.
- The shipped reviewer agents' own refusal: `dotnet-tooling:cs-code-reviewer` declined the test command, so the guard
  was tested with a same-named spike agent. The guard reads only `agent_type`.
- User-scope and local-scope MCP duplicates, and the real ADO server against a literal `${ADO_ORG}`.

## Decisions

1. **One generated plugin per artifact**, `hook-<basename>` and `mcp-<basename>`, never listed in `packs.yaml`. Seven
   today: `hook-protect-config`, `hook-reviewer-bash-guard`, `hook-worker-mode-guard`, `mcp-ado`, `mcp-context-mode`,
   `mcp-filesystem`, `mcp-maku-jam`. The marketplace goes from 14 plugins to 21. An artifact whose `platforms` excludes
   `claude` gets none. A generated name equal to a pack name fails the build.
2. **Pack plugins never carry `hook` or `mcp`.** `WRITABLE_PLUGIN_KINDS` gains both, and a new `PACK_PLUGIN_KINDS` holds
   what a pack plugin writes. `pluginMembersByKind` and `hasPluginMembers` read the new set. Starters are unchanged, and
   a test pins that.
3. **`deepseek-worker` depends on `hook-worker-mode-guard`** through a new optional `pluginDependencies` pack field
   holding catalog ids. Each id must be listed in that pack's `artifacts` and be a `hook` or `mcp`, and emits a bare
   name, which resolves in the same marketplace. Starters declare none, which keeps them opt-in.
4. **Keep `{sigil:env:NAME}` and `PORTABLE_MCP_ENV_SYNTAX`; no `userConfig`.** Set variables work and unset ones behave
   as `sigil add` does. Because nothing warns the user, a generated MCP plugin's description names the variables it
   needs, derived with `envTokenNames`.
5. **Duplicates are documented, not guarded** (ADR Phase 2b owns the guard). Running a blocking hook twice is harmless,
   because all three hooks are deterministic checks. `consuming.md` says what happens.
6. **`consuming.md` says a plugin update can change a hook command with no review step**, unlike `sigil update`.

## Steps

### Step 1 `[worker:medium]`: RED tests

File: `test/targets/plugin-config.test.ts` (new). Compile the bundled catalog with the real packs, copying the approach
in `test/targets/plugin-prompts.test.ts`.

| #   | Case                         | Expected                                                                                                              | Before step 4 |
| --- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------- |
| 1   | hook plugin holds only hooks | keys under `plugins/hook-protect-config/` are exactly `.claude-plugin/plugin.json` and `hooks/hooks.json`             | fails         |
| 2   | hook shape                   | parsed `hooks.json` deep-equals the `fragment` of `buildHookConfigOps` for `shared/protect-config`                    | fails         |
| 3   | MCP plugin holds only config | keys under `plugins/mcp-ado/` are exactly `.claude-plugin/plugin.json` and `.mcp.json`                                | fails         |
| 4   | env syntax                   | `plugins/mcp-ado/.mcp.json` contains `${ADO_ORG}` and `${ADO_MCP_PERSONAL_TOKEN}`, and no `{sigil:env:`               | fails         |
| 5   | description names variables  | `mcp-ado`'s `plugin.json` description contains both variable names; `mcp-filesystem`'s equals the catalog description | fails         |
| 6   | all seven are listed         | `marketplace.json` names include the seven plugins of decision 1, each with `source: ./plugins/<name>`                | fails         |
| 7   | packs stay free of config    | no key under any pack's `plugins/<pack>/` ends in `hooks/hooks.json` or `.mcp.json`                                   | passes        |
| 8   | `essentials` is unchanged    | the keys under `plugins/essentials/` are exactly `plugin.json` and `skills/explain-diff/SKILL.md`                     | passes        |
| 9   | version is written           | `plugins/hook-protect-config/.claude-plugin/plugin.json` has the `version` passed to `compile`                        | fails         |
| 10  | `platforms` is honored       | a cloned catalog with `platforms: [copilot]` on `shared/filesystem` produces no `plugins/mcp-filesystem/` key         | passes        |
| 11  | name collision               | compiling with an extra pack named `hook-protect-config` throws `SigilError` naming that plugin                       | fails         |

Test: `npm run build && npm run build:test && node --test test-compiled/targets/plugin-config.test.js`.
Expected: the "fails" rows fail on their assertions, not on setup. Commit the tests with step 4.

### Step 2 `[worker:medium]`: split the kind sets

File: `src/targets/claude-code/plugin-assemble.ts`.

- Add `PACK_PLUGIN_KINDS` (`skill`, `agent`, `workflow`, `prompt`) with a comment saying config kinds get their own
  plugins. Leave `WRITABLE_PLUGIN_KINDS` as it is until step 4.
- `pluginMembersByKind` returns members only for kinds in both `native` and `PACK_PLUGIN_KINDS`. `hasPluginMembers`
  iterates `PACK_PLUGIN_KINDS`.
- Export `buildPluginJson`.

Test: `npm test`. Expected: no behavior change, every existing test green.

### Step 3 `[worker:medium]`: the hook fragment

File: `src/targets/claude-code/config-scaffold.ts`.

Extract `hookFragment(fm)`, returning `{ hooks: { [event]: [{ matcher, hooks: [buildHookEntry(fm)] }] } }`, and call it
from `buildHookConfigOps`. Export it.

Test: `npm test`. Expected: every existing test green.

### Step 4 `[worker:medium]`: generate the config plugins

Files: `src/targets/claude-code/plugin-config.ts` (new), `src/targets/claude-code/target-helpers.ts`,
`src/targets/claude-code/index.ts`, `src/targets/claude-code/capabilities.ts`, `src/targets/claude-code/aggregate-docs.ts`,
`src/targets/claude-code/plugin-assemble.ts`, `src/targets/claude-code/plugin-build.ts`. This is one concern across seven files because the capability flip,
the `WRITABLE_PLUGIN_KINDS` change and the writer only pass tests together.

- `plugin-build.ts` gets `configPluginName(artifact)` (decision 1's naming). It lives there because `plugin-assemble.ts`
  needs it in step 6, and `plugin-config.ts` already imports `plugin-assemble.ts`, so the name cannot sit in the new file.
- `plugin-config.ts`: `buildConfigPlugins(catalog, options)` returns `{ files, entry }` for each `hook` and `mcp`
  artifact whose `platforms` allows `claude`. It builds a synthetic `Pack` (`name` from `configPluginName`, `displayName` from
  `title`, `description`, no `languages`) and reuses `buildPluginJson`. `hooks/hooks.json` is `hookFragment`;
  `.mcp.json` is `{ mcpServers: { [name]: config } }` from `portableMcpServer`. Both end in a newline and use
  `JSON_INDENT`. For an `mcp` with `envTokenNames(server)`, append ` Requires the environment variables A and B.` to
  the description.
- `index.ts:123`: after the pack loop, add the config plugins. Throw `SigilError` when a generated name equals a pack
  name.
- `capabilities.ts`: `hook` and `mcp` become `{ mode: 'native' }` on the plugin channel. Delete `NOT_YET_PACKAGED`.
- `plugin-assemble.ts`: add `hook` and `mcp` to `WRITABLE_PLUGIN_KINDS`.
- `aggregate-docs.ts`: add `claude plugin hooks/hooks.json aggregate` (`CLAUDE_HOOKS_DOC`) and
  `claude plugin .mcp.json aggregate` (`CLAUDE_MCP_DOC`).

Test: `npm run build && npm test && node dist-cli/cli.js sync --check`. Expected: all of step 1 passes, and
`docs/reference/capabilities.md` regenerated and committed. If `test/targets/capabilities.test.ts` pins the old rows,
update those rows only.

### Step 5 `[worker:medium]`: RED tests for `pluginDependencies`

File: `test/packs-config.test.ts`, `test/targets/plugin-config.test.ts`.

| #   | Case                  | Expected                                                                                            | Before step 6 |
| --- | --------------------- | --------------------------------------------------------------------------------------------------- | ------------- |
| 1   | accepted              | a pack listing `shared/worker-mode-guard` in `artifacts` and `pluginDependencies` parses            | fails         |
| 2   | must be a pack member | an id missing from the pack's `artifacts` is rejected, and the message names `pluginDependencies`   | fails         |
| 3   | emitted               | `plugins/deepseek-worker/.claude-plugin/plugin.json` has `dependencies: ["hook-worker-mode-guard"]` | fails         |
| 4   | starters stay opt-in  | no other pack's `plugin.json` has a `dependencies` key                                              | passes        |
| 5   | wrong kind            | a dependency on a skill id throws `SigilError` at compile, naming the id                            | fails         |
| 6   | none on generated     | a generated plugin's `plugin.json` has no `dependencies` key                                        | passes        |

Test: as step 1, on both files. Commit with step 6.

### Step 6 `[worker:medium]`: `pluginDependencies`

Files: `src/packs-config.ts`, `src/types.ts`, `src/targets/claude-code/plugin-assemble.ts`, `packs.yaml`.

Add the optional field with a refine beside the `pluginExclude` one. Both manifest builders write `dependencies` only
when non-empty, using `configPluginName` from `plugin-build.ts`. Kind is checked
at compile, since `parsePacksConfig` has no catalog. `packs.yaml`: `pluginDependencies: [shared/worker-mode-guard]` on
`deepseek-worker`.

Test: `npm run build && npm test`. Expected: step 5 passes.

### Step 7 `[inline: user-facing copy]`: docs

`packs.yaml` descriptions (remove "plugins can't carry hooks yet", and say what each route delivers for `essentials`
and the starters), `docs/guides/consuming.md` (generated plugins, env variables needed, duplicates, no review step on
plugin update), `CHANGELOG.md`.

### Step 8 `[inline: record decision]`: ADR note

Add the spike table and decisions 1-6 to `docs/decisions/distribution-channels-2026-09.md`, so they survive this plan's
deletion. Correct the roadmap's "What is true today" lines that Phase C changes.

### Step 9 `[inline: probe]`: the built plugins, then CI

- `npm run ci:local`.
- Rerun probes 1-3 against `dist/claude/plugins/` instead of the spike plugins, with allowlisted tools, to prove the
  generated files behave as the hand-built ones did.
- Add to the PR description, for the owner after the next release: `/plugin marketplace add`,
  `/plugin install deepseek-worker@sigil` installs `hook-worker-mode-guard`, and `/plugin install hook-protect-config@sigil`
  blocks `.env` in an interactive session.

## Close-out

`workflow-report .`, `/agent-skills:review`, delete this plan after merge. Cutting a release after this phase stays the
owner's call.
