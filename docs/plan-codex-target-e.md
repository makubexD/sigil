# Plan: Codex target, Phase E (MCP in `config.toml`)

Roadmap: [plan-codex-target](plan-codex-target.md). Probe A7: `${NAME}` isn't expanded, and `env_vars` forwards by name.

Spike result: go. `smol-toml` 1.9.1 has no runtime dependencies. It re-serializes without comments, so it only reads and
renders one table, and sigil splices that table's text into the file.

A table with the same name as a catalog server is replaced, as `object-spread` does in JSON. This changes the roadmap's
"reported as a conflict": every other config file behaves this way, and a user file gets its backup first.

## Step 1 `[worker:high]`: the TOML format

Files: `package.json`, `package-lock.json`, new `src/config-merge/toml-file.ts`, `src/config-merge/file-format.ts`,
`src/commands/add/execute-config.ts`, `src/commands/update-config-io.ts`, `src/commands/uninstall-config.ts`, new
`test/config-merge/toml-file.test.ts`.

- `file-format.ts` dispatches on a `.toml` path. `parseConfig` uses `smol-toml`'s `parse`. Add
  `isEmptiedConfig(fullPath, merged, text)`: JSON when `merged` has no keys; TOML when `text` is blank too, so a file
  still holding a user's comment is kept.
- `renderToml(before = '', merged)`:
  1. Parse `before`. A difference outside `mcp_servers` throws: sigil owns nothing else.
  2. For each server removed or changed, cut its block: from its `[mcp_servers.<key>` or `[mcp_servers."<key>"` header,
     through its sub-tables, up to the next other header, leaving comment and blank lines directly above that header.
  3. Append each added or changed server as `stringify({ mcp_servers: { [key]: config } })`, after a blank line.
  4. Drop a bare `[mcp_servers]` header left with nothing under it.
  5. Parse the result and `deepEqual` it to `merged`, treating an empty `mcp_servers` as absent. A mismatch throws a
     `SigilError` saying the file couldn't be edited safely and nothing was written.
- The three writers read the file's text once and pass it as `before`. Uninstall uses `isEmptiedConfig`.

Test cases:

| Case                                                                | Expected                                                |
| ------------------------------------------------------------------- | ------------------------------------------------------- |
| Add a server to a file with comments and `model`                    | Every original line kept, byte for byte; table appended |
| Add to no file                                                      | Only the table                                          |
| Replace a server with an `env` sub-table                            | Old block and sub-table gone, others untouched          |
| Remove one of two servers                                           | Other server and comment above it stay                  |
| Remove the only server from a sigil-only file                       | Blank; `isEmptiedConfig` true                           |
| Remove the only server, a user comment remains                      | Comment kept; `isEmptiedConfig` false                   |
| Quoted header `[mcp_servers."a"]`                                   | Found and replaced                                      |
| User wrote `mcp_servers = { a = { command = "x" } }`, replacing `a` | Throws; nothing written                                 |
| `merged` changes `model`                                            | Throws                                                  |
| Invalid TOML                                                        | `parseConfig` throws                                    |

Test: `npm test`, with no snapshot change.

## Step 2 `[worker:high]`: MCP ops and capability

Files: `src/targets/codex/{config,mcp-ops,index,capabilities,doc-refs,aggregate-docs}.ts`,
`catalog/shared/mcps/ado.mcp.md`, new `test/targets/codex-mcp.test.ts`.

- `resolveCodexConfigDestination('mcp', scope)`: `project` → `.codex/config.toml`, root `project`; `user` → `config.toml`,
  root `codex-home`; `local` refused like hooks.
- `buildCodexMcpOps(artifact, scope)`: fragment `{ mcp_servers: { [name]: config } }`, strategy
  `{ mcp_servers: 'object-spread' }`, section `mcp_servers`, name as in `portableMcpServer`.
- Stdio config: `command`, `args`, `env`, `cwd` as authored. An `env` value that is exactly `{sigil:env:KEY}` for its own
  key moves to `env_vars`. Any other `{sigil:env:…}` token, anywhere, throws a `SigilError` naming the token: Codex
  doesn't expand variables.
- Remote config: `url`; static `headers` → `http_headers`; a token in a header throws. Drop `type`. A type Codex doesn't
  document throws. Read `StdioServerSchema` and `RemoteServerSchema` for the full field list, and refuse a field you can't
  map.
- `shared/ado` gets `platforms: [claude, copilot]`, because it needs a token in `args`.
- `mcp: { mode: 'native' }`, `CODEX_MCP_DOC` (`https://learn.chatgpt.com/docs/extend/mcp`) in `CODEX_AGGREGATE_DOCS`;
  `configScopes` covers both kinds; `scaffoldConfig` routes `mcp`.

Test cases:

| Input                                                                      | Expected                                           |
| -------------------------------------------------------------------------- | -------------------------------------------------- |
| `shared/filesystem`, project                                               | `.codex/config.toml`, `command`, `args`, no `type` |
| `shared/maku-jam`                                                          | `url` only                                         |
| `env: { TOKEN: '{sigil:env:TOKEN}' }`                                      | `env_vars: ['TOKEN']`, no `env`                    |
| `env: { A: '{sigil:env:B}' }`                                              | Throws, naming `B`                                 |
| `args: ['{sigil:env:ORG}']`                                                | Throws                                             |
| `shared/ado` selected for `codex`                                          | Skipped by `platforms`                             |
| `add`, `update`, drift restore, `uninstall` over a commented `config.toml` | Only sigil's table changes                         |
| user scope first write over a user file                                    | One `.sigil.bak`                                   |
| local scope                                                                | Throws                                             |

Test: `npm test`.

## Step 3 `[inline: user-facing copy]`: docs and live check

`docs/setup/codex.md`, `docs/reference/config-kinds.md`, `spec.md`, README, `CHANGELOG.md`, `CLAUDE.md` (the `serialize()`
invariant gains the TOML writer), ADR § 3 and § 6, close-out.

Test: `npm run ci:local`, then real Codex against the mock starts a catalog server from a commented `config.toml`.
