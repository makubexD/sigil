# Plan: Cursor target, Phase D (MCP in `.cursor/mcp.json`)

Roadmap: [plan-cursor-target.md](plan-cursor-target.md) § Phase D. Probe results:
[cursor-target-2026-11.md](decisions/cursor-target-2026-11.md) (A6, § MCP: approval in print mode). Branch
`feat/cursor-mcp`, one PR.

## Sources (re-read 2026-11-01)

- [Cursor MCP](https://cursor.com/docs/context/mcp) (`CURSOR_MCP_DOC`): `.cursor/mcp.json` (project) and
  `~/.cursor/mcp.json` (global), `{"mcpServers": {...}}`. Stdio fields: `type` (the field table marks it required,
  value `"stdio"`, while every example leaves it out), `command`, `args`, `env`, `envFile`. Remote: `url`, `headers`,
  `auth`, with no `type` in any example; the transport (streamable HTTP or SSE) isn't declared. Interpolation in
  `command`, `args`, `env`, `url`, `headers`: `${env:NAME}`, `${userHome}`, `${workspaceFolder}`, …
- [Cursor CLI MCP](https://cursor.com/docs/cli/mcp): the CLI reads the same files with the editor's precedence (project →
  global → nested, parent directories discovered). `agent mcp enable <id>` approves a server; `--approve-mcps` approves
  all of them for one run.
- [Cursor third-party hooks](https://cursor.com/docs/reference/third-party-hooks): covers Claude Code hooks only. No
  page says whether Cursor reads Claude Code's `.mcp.json`. It reads Claude's skills (A3) and not its hooks (A5), so
  step 1 measures it.
- A6: `${env:NAME}` in `env` is expanded. Print mode needs `--approve-mcps` to load a project server and `--force` to
  call it.

## Design

Two seams today are hand-rolled per target, and adding Cursor's MCP to either one means another branch:

1. **MCP server entries.** `portableMcpServer` (Claude, Copilot, the Claude plugin) hard-codes one env syntax and copies
   the authored server. Codex has its own builder. Cursor needs a third variant: a different env syntax, `type` added
   on stdio, `type` dropped on remote.
2. **Config-kind dispatch.** Each target writes `kind === 'hook' || kind === 'mcp'` in `configScopes`,
   `scaffoldConfig`, `configSkipReason` and its destination resolver (`codex/index.ts`, `codex/config.ts`,
   `cursor/index.ts`, `cursor/config.ts`), and keeps a separate `CONFIG_KIND_SECTIONS` record. `hook-target-render`
   checks only hooks, so an MCP server a target can't render would slip past `sync --check`.

The fix is data in both places:

- **`McpDialect`** (`src/targets/mcp-dialect.ts`): what a target's MCP file expects, given as data: `serversKey`,
  `envSyntax`, `interpolatedFields` (where a `{sigil:env:…}` token may appear), `stdioType` (`'stdio'` to write it,
  `undefined` to leave it out), and `remoteType` (`'keep'` / `'drop'`). One `renderMcpServer(artifact, dialect)`
  returns `{ name, config }` or `{ skip: reason }`. It transforms the authored object in place: `description` is
  dropped, the `type` policy applied, tokens expanded. Key order is kept, so the portable dialect's output stays
  byte-identical (step 2 pins that). `PORTABLE_MCP_DIALECT` becomes the portable file's value, and `portable-mcp.ts`
  keeps its exports as thin wrappers. A new target with a JSON MCP file supplies one constant, not a builder. Codex
  stays on its own builder: it forwards variables by name (`env_vars`) and renames `headers`, which is different
  behavior, not a different value.
- **`ConfigKindTable`** (`src/targets/config-kind-table.ts`): `Partial<Record<ConfigKind, ConfigKindWriter>>`. Each
  writer holds `section`, per-scope `destinations` (a missing scope is refused with the table's own message),
  `buildOps(artifact, scope)` and an optional `skipReason(artifact)`. Shared helpers derive `configScopes`,
  `scaffoldConfig`, `configSkipReason` and the destination lookup from the table. A target opts in with
  `readonly configKinds` on `Target`. A test checks that every table's keys equal the target's `native` config kinds
  in `capabilities.ts`, so the table and the capability row can't drift apart. Cursor and Codex adopt it. Claude and
  Copilot stay as they are: three scopes, a `local` key path inside `~/.claude.json`, and shared-file rules. Moving them
  is a separate change.
- **`config-target-render`** replaces `hook-target-render`. It covers every config kind a target delivers natively and
  declares a `skipReason` for, so an MCP server Cursor can't render fails `--check` exactly as a hook does.

## Decisions (owner to confirm in review)

1. **Cursor's dialect:** `serversKey: 'mcpServers'`, `envSyntax: ${env:NAME}`, `interpolatedFields: command, args,
env, url, headers`, `stdioType: 'stdio'`, `remoteType: 'drop'`. Step 1 may change `stdioType`, `remoteType` or
   `interpolatedFields`; each change is one value.
2. **Every catalog server renders on Cursor** with that dialect. If step 1 shows `args` isn't interpolated, `args`
   leaves `interpolatedFields`, `shared/ado` skips on Cursor with a reason, and `config-target-render` forces
   `platforms:` on it. Nothing else changes.
3. **`shared/ado` gets `cursor` in `platforms`** (it already excludes Codex). Making Codex skip instead of throw, which
   would let `ado` drop `platforms`, stays the separate change noted in Phase C.
4. **Scopes:** `project` → `.cursor/mcp.json` (root `project`), `user` → `.cursor/mcp.json` (root `home`, so
   `ensureHomeBackup` applies), `local` refused, as for hooks.
5. **No `mcpEnvCaveat`** (Cursor expands what sigil writes). The after-install hint and the setup page cover approval:
   `agent mcp enable <name>`, plus `--approve-mcps` and `--force` in print mode.

Out of this phase: `envFile`, `auth` and the `${workspaceFolder}` family as catalog tokens. Also: moving Claude and
Copilot onto `ConfigKindTable`, Codex's MCP onto `McpDialect`, catalog `mcp` prose that names only Claude Code and
Copilot, and a PATH warning for an MCP `command`.

## Regression guards (every step)

`npm test` green with no change to existing expectations outside the files a step names. In particular:
`test/targets/portable-mcp.test.ts`, `mcp-env.test.ts`, `codex-mcp.test.ts`, `codex-hooks.test.ts`,
`cursor-hooks.test.ts`, `copilot-mcp-cli.test.ts`, and `test/fixtures/output-snapshot/build.json` (the snapshot changes
only in step 7, for the capability row).

## Step 1 `[inline: probe measures Cursor's own MCP loader]`: `.mcp.json`, `type`, and `args` interpolation

A throwaway git repo in the scratchpad (`mkrepo.sh`, as in Phases A and C), never this repo. The Linux CLI (`agent`,
signed in) is measured. Record prompts, `agent --version` and output in a new `### Phase D probes` subsection of the
ADR's probe log. The server is A6's `probe` (`server.js`, one `probe_env` tool). Runs 1 and 2 use only `agent mcp
list`, which makes no agent request.

- **Run 1, `.mcp.json`.** Only a root `.mcp.json` (`mcpServers.probe`, no `.cursor/`). Then add `.cursor/mcp.json`
  with the same server under the same name, and again under `probe2`. Record what `agent mcp list` shows each time.
- **Run 2, `type`.** `.cursor/mcp.json` with `probe` as `{"type":"stdio", …}`, `probe-bare` without `type`, a remote
  `jam` (`{"url":"https://mcp.jam.dev/mcp"}`) and `jam-typed` (`{"type":"http", …}`). Record each entry's status. A
  remote that asks for sign-in counts as loaded; a config error doesn't.
- **Run 3, `args`, owner runs by hand** (it needs `--force`, which the classifier refused in A6). `probe`'s `args` gains
  `"${env:SIGIL_PROBE}"` and `server.js` returns `process.argv[2]`: `SIGIL_PROBE=delta-42 agent -p --trust
--approve-mcps --force "Call probe_env and answer with its result only."`

| Result                                          | Change                                                                                |
| ----------------------------------------------- | ------------------------------------------------------------------------------------- |
| Run 1: Cursor ignores `.mcp.json`               | None. The setup page says Claude's `.mcp.json` isn't read                             |
| Run 1: reads `.mcp.json`, one entry per name    | Step 7 adds an `alsoLoads` `mcp` row for `claude`/`copilot`, `readerWins` per the run |
| Run 1: reads both, same name listed twice       | Stop and ask: the double load needs a design call                                     |
| Run 2: `type: "stdio"` fails, bare loads        | Cursor's `stdioType` becomes `undefined`                                              |
| Run 2: remote without `type` fails, typed loads | Cursor's `remoteType` becomes `'keep'`                                                |
| Run 3: `delta-42`                               | Decision 2 holds                                                                      |
| Run 3: literal `${env:SIGIL_PROBE}`             | `args` leaves Cursor's `interpolatedFields` (Decision 2's fallback)                   |

Update the A6 row and § MCP with what changed. Commit: `docs(cursor): Phase D probes`.

Test: `npx prettier --check docs/decisions/cursor-target-2026-11.md`.

## Step 2 `[worker:medium]`: pin today's portable MCP output

Files: `test/targets/portable-mcp.test.ts`, new `test/fixtures/portable-mcp-golden.json`.

A characterization test, written before any refactor. For every catalog `mcp` artifact, record the exact `serialize()`
text of the fragment from: Claude `scaffoldConfig` at `project`, `local` and `user`; Copilot at `project` and `user`;
and the Claude plugin's `.mcp.json` entry (`plugin-config.ts`). Store it in the golden file, keyed by
`<target>/<scope>/<id>`, and assert equality. An environment variable `UPDATE_GOLDEN=1` rewrites the file.
Document it in the test's header comment.

| Case                                   | Expected                                           |
| -------------------------------------- | -------------------------------------------------- |
| Current code                           | Passes                                             |
| Change one character of a golden entry | Fails naming that key (check by hand, then revert) |
| Catalog gains an `mcp` artifact        | Fails with "missing golden entry <key>"            |

Test: `npm test -- test/targets/portable-mcp.test.ts`, then `npm test`.

## Step 3 `[worker:high: shared seam three targets write through, key order must stay byte-identical]`: `McpDialect`

Files: new `src/targets/mcp-dialect.ts`, `src/targets/portable-mcp.ts`, new `test/targets/mcp-dialect.test.ts`.

- `mcp-dialect.ts`: `McpField = 'command' | 'args' | 'env' | 'url' | 'headers'`; `interface McpDialect { serversKey;
envSyntax; interpolatedFields: readonly McpField[]; stdioType?: 'stdio'; remoteType: 'keep' | 'drop' }`;
  `renderMcpServer(artifact, dialect): { name: string; config: Record<string, unknown> } | { skip: string }`.
  - Name: `fm.name ?? basenameOfId(id)`. Remove `description`.
  - Stdio is the server that has `command`; remote is the one that has `url`.
  - A `{sigil:env:…}` token (`envTokenNames`) in a field outside `interpolatedFields` returns `{ skip }`, naming the
    token and the field.
  - `stdioType: 'stdio'` puts `type: 'stdio'` first on a stdio server; on a remote server, `remoteType: 'drop'`
    removes `type`. Every other key stays in authored order.
  - `expandEnvTokens(config, dialect.envSyntax)`; a malformed token still throws (it's an authoring error, not a
    target gap).
  - `mcpServerOp(artifact, dialect, dest)`: the object-spread op on `dialect.serversKey`, `section` = the key. It
    throws if `renderMcpServer` returned `skip` (callers check `skipReason` first, as for hooks).
- `portable-mcp.ts`: `PORTABLE_MCP_DIALECT = { serversKey: 'mcpServers', envSyntax: PORTABLE_MCP_ENV_SYNTAX,
interpolatedFields: all five, stdioType: undefined, remoteType: 'keep' }`. `portableMcpServer` and `portableMcpOp`
  keep their signatures and call the dialect functions. `PORTABLE_MCP_SERVERS_KEY` stays exported.

| Case (`mcp-dialect.test.ts`, fixture artifacts)                       | Expected                                                                      |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Portable dialect, every catalog server                                | Equal to `portableMcpServer`'s output before the change (step 2 golden green) |
| `stdioType: 'stdio'`, stdio server `{command, args}`                  | Keys `type, command, args`, `type` = `stdio`                                  |
| `stdioType: 'stdio'`, server already authored with `type`             | One `type` key, value `stdio`, first                                          |
| `remoteType: 'drop'`, `{type: 'http', url, headers}`                  | Keys `url, headers`                                                           |
| `remoteType: 'keep'`                                                  | `type` kept in place                                                          |
| `interpolatedFields` without `args`, token in `args`                  | `{ skip }` naming the token and `args`                                        |
| Token in `headers` value `Bearer {sigil:env:T}`, `${env:NAME}` syntax | `Bearer ${env:T}`                                                             |
| `{sigil:env:bad-name}`                                                | Throws the shared malformed-token error                                       |
| `server.description` present                                          | Not in config                                                                 |
| `mcpServerOp` on a skipped server                                     | Throws                                                                        |

Test: `npm test -- test/targets/mcp-dialect.test.ts test/targets/portable-mcp.test.ts`, then `npm test` (step 2's
golden unchanged).

## Step 4 `[worker:medium]`: `ConfigKindTable` and its helpers

Files: new `src/targets/config-kind-table.ts`, `src/types.ts`, new `test/targets/config-kind-table.test.ts`.

- `interface ConfigKindWriter { section: string; destinations: Partial<Record<ConfigScope, { file: string; root:
ConfigRoot; display: string }>>; buildOps(artifact, scope): ConfigMergeOp[]; skipReason?(artifact): string |
undefined }`; `type ConfigKindTable = Partial<Record<ConfigKind, ConfigKindWriter>>`. `display` is the scope's text
  in a refusal, e.g. `.cursor/hooks.json, git-committed`, `~/.cursor/hooks.json, all projects`,
  `$CODEX_HOME/hooks.json, default ~/.codex/hooks.json`. It is data, so step 5 keeps today's messages word for word.
- Helpers, each taking the table and the target's display name:
  - `destinationFor(table, kind, scope, targetName)`: an unknown kind throws `SigilError` listing the table's kinds. A
    missing scope throws `<Target> has no personal per-project <kind> file — install at '<scope>' scope (<display>)`,
    with each scope that exists joined by `or` in precedence order.
  - `configScopesFrom(table, scopeInfos, kinds, projectDir)`: one destination per requested kind the table has, with
    `section` from the writer and `fullPath` from `resolveConfigRoot`.
  - `scaffoldConfigFrom(table, artifact, options)`: scope = `options.scope ?? fm.defaultScope ?? 'project'`, then
    `buildOps`.
  - `configSkipReasonFrom(table, artifact)`: `table[kind]?.skipReason?.(artifact)`.
- `types.ts`: `readonly configKinds?: ConfigKindTable` on `Target`, documented as the opt-in source for the four
  methods.

| Case                                                        | Expected                                   |
| ----------------------------------------------------------- | ------------------------------------------ |
| Two-kind fixture table, `configScopes(['hook','mcp'])`      | Each scope lists both, with their sections |
| `configScopes(['settings'])`                                | No destinations                            |
| `destinationFor` unknown kind                               | Throws, listing the table's kinds          |
| `destinationFor` `local` on a project/user table            | Throws, naming both files                  |
| `scaffoldConfigFrom` with no scope and `defaultScope: user` | Uses `user`                                |
| `configSkipReasonFrom` on a kind without `skipReason`       | `undefined`                                |

Test: `npm test -- test/targets/config-kind-table.test.ts`, then `npm test`.

## Step 5 `[worker:medium]`: Cursor and Codex adopt the table (no behavior change)

Files: `src/targets/cursor/{config,index}.ts`, `src/targets/codex/{config,index}.ts`, `test/targets/capabilities.test.ts`.

- `cursor/config.ts` exports `CURSOR_CONFIG_KINDS: ConfigKindTable` with the `hook` writer (Phase C's destinations,
  `buildCursorHookOps`, `cursorHookSkipReason`). `resolveCursorConfigDestination` delegates to `destinationFor`.
- `codex/config.ts` exports `CODEX_CONFIG_KINDS` with `hook` and `mcp` (existing builders, `section` from today's
  `CONFIG_KIND_SECTIONS`, which goes away). `resolveCodexConfigDestination` delegates.
- Both `index.ts`: `readonly configKinds = …`; `configScopes`, `scaffoldConfig`, `configSkipReason` (Cursor) call the
  helpers. No `kind ===` branch remains in either file.
- `capabilities.test.ts`: for every registered target with `configKinds`, its keys equal the config kinds (`hook`,
  `mcp`, `settings`) that are `native` on its `scaffold` channel.

| Case                                                               | Expected                                             |
| ------------------------------------------------------------------ | ---------------------------------------------------- |
| `cursor-hooks.test.ts`, `codex-hooks.test.ts`, `codex-mcp.test.ts` | Pass unchanged; error messages identical             |
| New cross-check, current tree                                      | Passes for Cursor (`hook`) and Codex (`hook`, `mcp`) |
| Cross-check with a table key removed (by hand)                     | Fails naming the target and kind                     |

Test: `npm test`.

## Step 6 `[worker:medium]`: `config-target-render` replaces `hook-target-render`

Files: `src/commands/sync/conformance/rules/hook-target-render.ts` (renamed `config-target-render.ts`),
`src/commands/sync/conformance/registry.ts`, `test/commands/sync-conformance.test.ts`.

- Loop over every config-kind artifact. For each target where that kind is `native` on `scaffold` and
  `configSkipReason` exists, a defined reason is an error. Rule id `config-target-render`; the detail names the kind
  ("mcp 'shared/x' ships to target …"). The fix text stays the same: `platforms:` or change the artifact.
- Update the module comment, and any doc that names the old id (`grep -rn hook-target-render src test docs`; the
  closed plan files stay as written).

| Case                                                    | Expected                                   |
| ------------------------------------------------------- | ------------------------------------------ |
| Existing hook cases                                     | Same findings under `config-target-render` |
| A stub target whose `configSkipReason` refuses an `mcp` | Error for that server and target           |
| Same, with `platforms:` excluding the target            | No finding                                 |
| Current catalog                                         | `sync --check` clean                       |

Test: `npm test -- test/commands/sync-conformance.test.ts`, `npm run build && node dist-cli/cli.js sync --check`.

## Step 7 `[worker:medium]`: Cursor MCP

Files: new `src/targets/cursor/mcp-ops.ts`, `src/targets/cursor/{config,index,capabilities,aggregate-docs}.ts`,
`catalog/shared/mcps/ado.mcp.md`, new `test/targets/cursor-mcp.test.ts`; regenerated `docs/reference/capabilities.md`
and the output snapshot.

- `mcp-ops.ts`: `CURSOR_MCP_DIALECT` per Decision 1 (as amended by step 1), with a comment citing `CURSOR_MCP_DOC`
  § STDIO server configuration and § Config interpolation, and A6. `buildCursorMcpOps(artifact, scope)` =
  `[mcpServerOp(artifact, CURSOR_MCP_DIALECT, destinationFor(CURSOR_CONFIG_KINDS, 'mcp', scope))]`;
  `cursorMcpSkipReason(artifact)` = the dialect's skip.
- `CURSOR_CONFIG_KINDS` gains `mcp`: `section: 'mcpServers'`, Decision 4's destinations, the two functions above.
- `capabilities.ts`: `mcp: { mode: 'native' }`. `aggregate-docs.ts`: a `.cursor/mcp.json / ~/.cursor/mcp.json` entry
  citing `CURSOR_MCP_DOC`. `index.ts`: `afterInstallHint` adds `A project MCP server needs approval
(agent mcp enable <name>).`; scope descriptions name both files; module comments lose "MCP comes later". Add the
  `alsoLoads` row if step 1 run 1 calls for it.
- `ado.mcp.md`: `platforms: [claude, copilot, cursor]` (unless Decision 2's fallback applied).
- `npm run build`, then commit the regenerated files.

| Case                                      | Expected                                                             |
| ----------------------------------------- | -------------------------------------------------------------------- |
| `shared/filesystem`, project              | `.cursor/mcp.json`, root `project`, `{type:'stdio', command, args}`  |
| `shared/filesystem`, user                 | Same file, root `home`                                               |
| `shared/filesystem`, local                | Throws naming `.cursor/mcp.json`                                     |
| `shared/maku-jam`                         | `{ url }`                                                            |
| `shared/ado`                              | `${env:ADO_ORG}` in `args`, `${env:ADO_MCP_PERSONAL_TOKEN}` in `env` |
| `configSkipReason` on every catalog `mcp` | `undefined` (or `ado`'s reason under the fallback)                   |
| `configScopes(['hook','mcp'])`            | Both scopes list both, sections `hooks` / `mcpServers`               |
| Step 5's cross-check                      | Passes with `mcp` native and in the table                            |
| Step 2's golden                           | Unchanged                                                            |

Test: `npm test`, `npm run build && git diff --exit-code docs/reference/capabilities.md`,
`node dist-cli/cli.js sync --check`.

## Step 8 `[worker:medium]`: end-to-end install, update, uninstall

Files: `test/targets/cursor-mcp.test.ts` (a new `describe` block), using the helpers `cursor-hooks.test.ts` uses for its
end-to-end block (temp project, temp `HOME`).

| Case                                                                   | Expected                                                                                                     |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `add --target cursor shared/filesystem`, no `.cursor/mcp.json`         | File holds only `mcpServers.filesystem`                                                                      |
| Same, over a user file with a `mine` server and a top-level user key   | `mine` and the key kept in order; `filesystem` added                                                         |
| `add` again                                                            | File unchanged                                                                                               |
| `update` after the catalog server's `args` change                      | Entry replaced, `mine` untouched                                                                             |
| User deletes `filesystem`, then `update`                               | Drift `missing`, restored without `--force`                                                                  |
| User edits `filesystem.args`, `update` without / with `--force`        | `modified`, not written / restored                                                                           |
| `uninstall` with `mine` present                                        | Only `filesystem` removed                                                                                    |
| `uninstall` of a sigil-only file                                       | File removed                                                                                                 |
| `--scope user` over `~/.cursor/mcp.json` with a user server            | One `.sigil.bak` before the first write, none after                                                          |
| `--scope user`, no prior file                                          | No `.sigil.bak`                                                                                              |
| `--scope local`                                                        | Error naming `.cursor/mcp.json`, nothing written                                                             |
| Project with `claude` and `cursor` both installing `shared/filesystem` | `.mcp.json` and `.cursor/mcp.json` each hold one entry; uninstalling one target leaves the other file intact |

Test: `npm test -- test/targets/cursor-mcp.test.ts`, then `npm test`.

## Step 9 `[inline: user-facing copy]`: docs

- `docs/setup/cursor.md`: an `## MCP servers` section covering the file per scope, `${env:NAME}`, approval with
  `agent mcp enable`, `--approve-mcps` and `--force` in print mode, and step 1 run 1's `.mcp.json` result.
- `docs/reference/config-kinds.md`: the Cursor line in the intro, a Cursor `mcp` scope table, and the env-syntax
  paragraph.
- `docs/reference/architecture.md` § Extension model: `McpDialect` and `ConfigKindTable` as the way a target adds MCP
  and config kinds.
- `CLAUDE.md` invariants: one line each. A target's MCP entry comes from an `McpDialect`. A target with `configKinds`
  dispatches config only through the table. `config-target-render` replaces the hook-only wording.
- `docs/reference/spec.md` MCP destinations, `README.md` if it lists per-target kinds, and `CHANGELOG.md`
  (Unreleased).
- The `McpSchema` `defaultScope` comment in `src/schema/index.ts` (then `npm run build`), and the ADR's § 3 and § 6 rows
  for MCP.

Test: `npm run ci:local`.

## Step 10 `[inline: live check measures Cursor]`: a sigil-installed server runs

In a throwaway repo: `sigil add --target cursor shared/filesystem shared/maku-jam`, then `agent mcp enable` each one,
and `agent mcp list` shows both. The owner runs one `agent -p --trust --approve-mcps --force` call of a filesystem
tool. Record it in the ADR probe log and close its § MCP section.

Test: the call returns the tool's result; `npx prettier --check docs/decisions/cursor-target-2026-11.md`.
