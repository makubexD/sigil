# Plan: Antigravity target, Phase C (MCP)

Phase C of [plan-antigravity-target.md](plan-antigravity-target.md). Evidence:
[antigravity-target-2026-11.md](decisions/antigravity-target-2026-11.md) (D6, probe P5, and C1 below). The phase
follows [Rules for every target](reference/architecture.md#rules-for-every-target). Branch `feat/antigravity-target-c`,
one PR.

Model: the Cursor target's MCP phase ([plan-cursor-target-d.md](plan-cursor-target-d.md), steps 7-10), which built the
two seams this phase plugs into: `McpDialect` (`src/targets/mcp-dialect.ts`) and `ConfigKindTable`
(`src/targets/config-kind-table.ts`). Antigravity differs in one place. Its workspace and user MCP files expand no
environment references (P5: the server got the literal `${PROBE_SECRET}`), but the server inherits `agy`'s environment
(`INHERITED=[golf-77]`). So an env entry that only passes a variable through under its own name is not needed at all,
and any other token can't be carried.

## Decisions (settled from the docs and the probes)

1. **A new neutral dialect value, `envSyntax: 'inherited'`, not an Antigravity branch.** It means "this file expands
   no references, and the server inherits the client's environment". `renderMcpServer` then drops every identity
   entry from `env` (key `K`, value exactly `{sigil:env:K}`), drops `env` itself when that empties it, and skips the
   server if any token is left anywhere, with a reason that says only an identity env entry is carried. Antigravity's
   dialect sets `interpolatedFields: []`, so the existing field check produces the skip for the leftovers. The next
   target with the same behavior supplies the same value.
2. **Antigravity's dialect:** `serversKey: 'mcpServers'`, `envSyntax: 'inherited'`, `interpolatedFields: []`,
   `stdioType` unset (the documented stdio entry is `command` + `args` + `env` + `cwd`, with no `type`),
   `remoteType: 'drop'` (the documented remote entry is `serverUrl` or `url` + `headers`, Streamable HTTP only, with no
   `type`). Step 1 may change `stdioType` or `remoteType`; each change is one value. The catalog's `url` is kept,
   since the docs accept it beside `serverUrl` (D6).
3. **What ships.** `shared/filesystem`, `shared/context-mode` and `shared/maku-jam` render (no tokens).
   `shared/ado` passes its organization as `{sigil:env:ADO_ORG}` in `args`, so it can't render on Antigravity; it
   already lists `platforms: [claude, copilot, cursor]`, so nothing ships it there and `config-target-render` stays
   green. Its `ADO_MCP_PERSONAL_TOKEN` env entry is an identity entry and would be dropped.
4. **Scopes:** `project` → `.agents/mcp_config.json` (root `project`), `user` → `.gemini/config/mcp_config.json` (root
   `home`, so `ensureHomeBackup` takes the `.sigil.bak`), `local` refused, as for Cursor. Neither file overrides the
   other: on a shared key, whichever server is already running keeps it (D6, the Settings page). The scope
   descriptions say so, and the setup page warns against installing one server at both scopes.
5. **No file overlap with another target.** No other target writes `.agents/mcp_config.json` or the `~/.gemini` file,
   and Antigravity reads no other target's MCP file (P6 for `.claude/`; C1 run 4 for `.mcp.json`). So no
   `sharesSkillFilesWith`-style refusal and no `alsoLoads` row.
6. **Approval is the setup page's job.** An MCP tool with no permission rule runs in Ask mode, soft-denied in print
   mode, and the rule is `mcp(<server>/<tool>)`, `mcp(<server>/*)` or `mcp(*)` (D6). The after-install hint names it in
   one sentence; the setup page gives the `--settings` allow form P5 used.

Out of this phase: the plugin `mcp_config.json` with `variables` (Phase F), `cwd`, `disabled`, `enabledTools`,
`disabledTools` and `timeoutSeconds` as catalog fields, and Codex's MCP moving onto `McpDialect`.

## Regression guards (every step)

`npm test` green with no change to existing expectations outside the files a step names. In particular:
`test/targets/mcp-dialect.test.ts` (existing cases), `portable-mcp.test.ts` and its golden
`test/fixtures/portable-mcp-golden.json`, `cursor-mcp.test.ts`, `codex-mcp.test.ts`, `mcp-env.test.ts`, and
`test/fixtures/output-snapshot/build.json` (it changes only in step 4, for the capability row, if at all).

Probes and live checks run in a throwaway `git init` repo under the scratchpad. Never write to `~/.gemini/` beyond what
`agy` itself writes; the user MCP file there already holds the owner's content.

## Step 1 `[inline: probe measures Antigravity's own MCP loader]`: C1 in the ADR

On the current `agy` (record `agy --version`), with `agy --model gemini-3.8-flash-low --output-format stream-json` and
a `--settings` allow rule `mcp(*)` (print mode soft-denies Ask), a tiny stdio probe server (a Node script answering
`tools/list` and one `tools/call` that returns its argv and one env var) and `.agents/mcp_config.json` holding:

- Run 1: the probe server as `{command, args}` with no `type`. Expected: the tool is called (`call_mcp_tool`).
- Run 2: the same entry with `type: "stdio"` first. Records whether a `type` on stdio is accepted, ignored or rejected.
- Run 3: a remote entry `{type: "http", url: "https://mcp.jam.dev/mcp"}`, then the same without `type`. Records which
  one `agy` loads or lists (an auth prompt or error after the load still counts as loaded; a config error does not).
- Run 4: the probe server only in a root `.mcp.json`, no `mcp_config.json`. Expected: not loaded (Decision 5).
- Run 5: Decision 1's premise again: the probe server with no `env`, `PROBE_ID=c1-ok` exported to `agy`. Expected:
  the tool returns `c1-ok`.

Add a `### Phase C` subsection after `### Phase B` in the ADR's probe log, with one row, C1, and the runs. If run 2 or
3 contradicts Decision 2, amend Decision 2 here and step 3's values before step 3 is sent. In the ADR's `## Decision`,
name the dialect values as settled by C1.

Test: `npx prettier --check docs/decisions/antigravity-target-2026-11.md docs/plan-antigravity-target-c.md`.

## Step 2 `[worker:medium]`: `envSyntax: 'inherited'` in `McpDialect`

Files: `src/targets/mcp-dialect.ts`, `test/targets/mcp-dialect.test.ts`.

- `McpDialect.envSyntax` becomes `EnvSyntax | 'inherited'`. Doc comment: "`'inherited'`: the file expands no
  references, and the server inherits the client's environment. An identity `env` entry (`NAME: {sigil:env:NAME}`) is
  dropped, since the server already sees `NAME`; any other token skips the server."
- New private `dropIdentityEnv(authored)`: when `authored.env` is a plain object, return a copy of `authored` whose
  `env` omits every key `K` whose value is exactly the string `{sigil:env:K}`, other keys in authored order; when that
  leaves `env` empty, omit `env`. Any other `authored` is returned unchanged.
- `renderMcpServer`: when `dialect.envSyntax === 'inherited'`, apply `dropIdentityEnv` before `skipReason`. After the
  type policy, call `expandEnvTokens` only when `envSyntax` is not `'inherited'` (no token is left to expand).
- `skipReason`: when `dialect.envSyntax === 'inherited'`, the message is
  `${names} in ${field} is not carried by this target: it expands no environment references, and only an identity env entry (NAME: {sigil:env:NAME}) is passed through the inherited environment`.
  Otherwise the message is unchanged.
- No other file changes; `PORTABLE_MCP_DIALECT` and `CURSOR_MCP_DIALECT` are untouched.

New cases in `mcp-dialect.test.ts`, with a local dialect
`{ serversKey: 'mcpServers', envSyntax: 'inherited', interpolatedFields: [], remoteType: 'drop' }`:

| Case                                                                         | Expected                                                                       |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `{command: 'x'}`                                                             | `{name, config: {command: 'x'}}`                                               |
| `{command: 'x', env: {A: '{sigil:env:A}'}}`                                  | `config` is `{command: 'x'}` (no `env` key)                                    |
| `{command: 'x', env: {A: '{sigil:env:A}', B: 'lit'}}`                        | `config.env` is `{B: 'lit'}`                                                   |
| `{command: 'x', env: {B: 'lit', A: '{sigil:env:A}', C: 'v'}}`                | `Object.keys(config.env)` is `['B', 'C']`                                      |
| `{command: 'x', env: {A: '{sigil:env:B}'}}`                                  | `{skip}` naming `{sigil:env:B}`, `env` and "identity env entry"                |
| `{command: 'x', env: {A: 'Bearer {sigil:env:A}'}}`                           | `{skip}` naming `{sigil:env:A}` and `env`                                      |
| `{command: 'x', args: ['{sigil:env:ORG}']}`                                  | `{skip}` naming `{sigil:env:ORG}` and `args`                                   |
| `{type: 'http', url: 'u', headers: {Authorization: 'Bearer {sigil:env:T}'}}` | `{skip}` naming `headers`                                                      |
| `{type: 'http', url: 'u'}`                                                   | `config` is `{url: 'u'}`                                                       |
| `mcpServerOp` on a skipped server                                            | Throws `SigilError` with the skip text                                         |
| A malformed token `{sigil:env:1BAD}` in `env` under an identity-looking key  | Not an identity entry; `{skip}` (no throw, since nothing is expanded)          |
| Every existing case in the file                                              | Unchanged (the portable and Cursor dialects render and skip exactly as before) |

Test: `npm test -- test/targets/mcp-dialect.test.ts`, then `npm test`.

## Step 3 `[worker:medium]`: Antigravity's dialect and config table

Files: new `src/targets/antigravity/mcp-ops.ts`, new `src/targets/antigravity/config.ts`,
`src/targets/antigravity/doc-refs.ts`, new `test/targets/antigravity-mcp.test.ts`.

- `doc-refs.ts`: `ANTIGRAVITY_MCP_DOC` = `https://antigravity.google/docs/mcp#mcp-configuration-structure`, title
  `Antigravity — MCP`, `verifiedOn` today, covers: "`.agents/mcp_config.json` and `~/.gemini/config/mcp_config.json`,
  an `mcpServers` map; stdio `command` + `args` + `env` + `cwd`, remote `serverUrl` or `url` + `headers`; no env
  syntax documented for these files (P5: none expanded)". `ANTIGRAVITY_SETTINGS_DOC` =
  `https://antigravity.google/docs/settings#other-configuration-files`, covers: "on a key in both MCP files, the
  server already running keeps it".
- `mcp-ops.ts`, modelled on `src/targets/cursor/mcp-ops.ts`: `ANTIGRAVITY_MCP_DIALECT` per Decision 2 (as amended by
  step 1), with a module comment citing `ANTIGRAVITY_MCP_DOC` and P5 / C1; `antigravityMcpSkipReason(artifact)` and
  `buildAntigravityMcpOps(artifact, scope)`, the same shape as Cursor's.
- `config.ts`, modelled on `src/targets/cursor/config.ts` with only the `mcp` row: `ANTIGRAVITY_CONFIG_KINDS` with
  `section: 'mcpServers'`, Decision 4's destinations (displays `.agents/mcp_config.json, git-committed` and
  `~/.gemini/config/mcp_config.json, all projects`), the two functions behind arrow wrappers (same import-cycle note
  as Cursor's), and `resolveAntigravityConfigDestination`.
- Not wired into the target yet: step 4 does that, so `capabilities.test.ts` stays green here.

Unit cases in `antigravity-mcp.test.ts` (load the real catalog as `cursor-mcp.test.ts` does):

| Case                                                        | Expected                                                                         |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `buildAntigravityMcpOps(shared/filesystem, 'project')`      | One op: `.agents/mcp_config.json`, root `project`, `{command, args}`, no `type`  |
| Same, `'user'`                                              | `.gemini/config/mcp_config.json`, root `home`                                    |
| Same, `'local'`                                             | Throws, naming both supported scopes' files                                      |
| `shared/context-mode`                                       | `{command: 'context-mode'}`                                                      |
| `shared/maku-jam`                                           | `{url: 'https://mcp.jam.dev/mcp'}` (no `type`, unless step 1 amended Decision 2) |
| `antigravityMcpSkipReason(shared/ado)`                      | Names `{sigil:env:ADO_ORG}` and `args`                                           |
| `antigravityMcpSkipReason` on filesystem, context-mode, jam | `undefined`                                                                      |
| Op `strategy` / `section`                                   | `{mcpServers: 'object-spread'}` / `mcpServers`                                   |

Test: `npm test -- test/targets/antigravity-mcp.test.ts`, then `npm test`.

## Step 4 `[worker:medium]`: wire MCP into the Antigravity target

Files: `src/targets/antigravity/{index,capabilities}.ts`, new `src/targets/antigravity/aggregate-docs.ts`,
`test/targets/antigravity-mcp.test.ts`; regenerated `docs/reference/capabilities.md` and, if it changes, the output
snapshot.

- `capabilities.ts`: `mcp: { mode: 'native' }`; the module comment says MCP servers merge into
  `.agents/mcp_config.json` / `~/.gemini/config/mcp_config.json`.
- `aggregate-docs.ts`: `ANTIGRAVITY_AGGREGATE_DOCS` with one entry,
  `antigravity .agents/mcp_config.json / ~/.gemini/config/mcp_config.json aggregate`, citing `ANTIGRAVITY_MCP_DOC`.
- `index.ts`, modelled on `src/targets/cursor/index.ts`: `ANTIGRAVITY_CONFIG_SCOPES` (project precedence 1, shared,
  blast radius `project`, `project — .agents/mcp_config.json, git-committed`; user precedence 2, not shared,
  `all-projects`, `user — ~/.gemini/config/mcp_config.json, all projects`), `aggregateDocs`, `configKinds`,
  `configScopes`, `scaffoldConfig`, `configSkipReason`. A doc comment on `configScopes` states Decision 4's "neither
  file overrides the other". `installHint` stays; `afterInstallHint` appends:
  ` An MCP tool runs only after approval or an allow rule such as mcp(<server>/*).` Update the module comment.
- `npm run build`, then commit the regenerated files.

New cases in `antigravity-mcp.test.ts`:

| Case                                                              | Expected                                                             |
| ----------------------------------------------------------------- | -------------------------------------------------------------------- |
| `getTarget('antigravity').configSkipReason(shared/ado)`           | The step 3 reason                                                    |
| `configSkipReason` on the other three catalog servers             | `undefined`                                                          |
| `configScopes(['mcp'], dir)`                                      | `project` then `user`, section `mcpServers`, the two display strings |
| `scaffoldConfig('shared/filesystem', catalog, {scope: 'user'})`   | Step 3's user op                                                     |
| `capabilities.test.ts` table/native cross-check                   | Passes with `mcp` native and in the table                            |
| `sync --check` (`config-target-render`, `provider-kind-coverage`) | Clean                                                                |

Test: `npm test`, `npm run build && git diff --exit-code docs/reference/capabilities.md`,
`node dist-cli/cli.js sync --check`.

## Step 5 `[worker:medium]`: end-to-end install, update, uninstall

Files: `test/targets/antigravity-mcp.test.ts` (a new `describe` block), using the helpers `cursor-mcp.test.ts` uses for
its end-to-end block (temp project, temp `HOME`).

| Case                                                                        | Expected                                                                                                |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `add --target antigravity shared/filesystem`, no `.agents/mcp_config.json`  | File holds only `mcpServers.filesystem`                                                                 |
| Same, over a file with a `mine` server and a top-level user key             | `mine` and the key kept in order; `filesystem` added                                                    |
| `add` again                                                                 | File unchanged                                                                                          |
| `update` after the catalog server's `args` change                           | Entry replaced, `mine` untouched                                                                        |
| User deletes `filesystem`, then `update`                                    | Drift `missing`, restored without `--force`                                                             |
| User edits `filesystem.args`, `update` without / with `--force`             | `modified`, not written / restored                                                                      |
| `uninstall` with `mine` present                                             | Only `filesystem` removed                                                                               |
| `uninstall` of a sigil-only file                                            | File removed                                                                                            |
| `--scope user` over `~/.gemini/config/mcp_config.json` with a user server   | One `.sigil.bak` before the first write, none after; other files in `~/.gemini/` untouched              |
| `--scope user`, no prior file                                               | File created with its parent folders, no `.sigil.bak`                                                   |
| `--scope local`                                                             | Error naming the supported files, nothing written                                                       |
| `add --target antigravity shared/ado` (a fixture copy without `platforms`)  | Skipped with the step 3 reason, nothing written                                                         |
| Project with `cursor` and `antigravity` both installing `shared/filesystem` | `.cursor/mcp.json` and `.agents/mcp_config.json` each hold one entry; uninstalling one leaves the other |
| Project with `codex` skills and `antigravity` MCP                           | `add` accepts both (MCP is not a shared skill file)                                                     |

Test: `npm test -- test/targets/antigravity-mcp.test.ts`, then `npm test`.

## Step 6 `[inline: user-facing copy]`: docs

- `docs/setup/antigravity.md`: an `## MCP servers` section: the file per scope, no env syntax (an identity env entry
  works because the server inherits `agy`'s environment, anything else is skipped with its reason), Decision 4's
  "don't install one server at both scopes", and approval (Ask mode, the `mcp(<server>/*)` rule, the `--settings`
  allow form for print mode). Drop MCP from the "not built yet" line.
- `docs/reference/config-kinds.md`: the Antigravity line in the intro, an Antigravity `mcp` scope table, and the
  `'inherited'` env paragraph.
- `docs/reference/architecture.md` § Extension model: `envSyntax: 'inherited'` as a dialect value.
- `docs/reference/spec.md` MCP destinations, `README.md` if it lists per-target kinds, `CHANGELOG.md` (Unreleased).
- The `McpSchema` `defaultScope` comment in `src/schema/index.ts` if it lists targets (then `npm run build`), and the
  ADR's § 3 and § 6 rows for MCP.

Test: `npm run ci:local`.

## Step 7 `[inline: live check measures Antigravity]`: a sigil-installed server runs

In a throwaway repo: `sigil add --target antigravity shared/filesystem` at project scope, then one
`agy --settings '{"permissions":{"allow":["mcp(filesystem/*)"]}}' --model … -p "…"` call that lists the repo through
the filesystem server. Then `sigil uninstall` and check `.agents/mcp_config.json` is gone. User scope is not live-checked:
the owner's `~/.gemini/config/mcp_config.json` stays untouched, and step 5 covers that path with a temp `HOME`.
Record it in the ADR probe log, mark Phase C done in the roadmap, and update the project memory.

Test: the call returns the server's listing; `npx prettier --check docs/decisions/antigravity-target-2026-11.md`.
