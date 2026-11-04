# Plan: OpenCode target, Phase E (MCP, user scope, re-run)

Part of the [roadmap](plan-opencode-target.md). This adds the `mcp` kind to `src/targets/opencode/` through an `McpDialect`
value and a `ConfigKindTable` entry, in project and user scope, plus a `probe:opencode` script that re-runs the loader
probes on one command. The reasons are in [D6](decisions/opencode-target-2026-11.md#d6-mcp),
[D7](decisions/opencode-target-2026-11.md#d7-settings-and-permissions), the
[reuse map](decisions/opencode-target-2026-11.md#reuse-map) and the [V2 run](decisions/opencode-target-2026-11.md#v2-run).
Phase C already added the dialect fields and the `opencode-home` root, so no shared `McpDialect` change is needed.

No zod schema change, and no new symbol in `src/index.ts`. Each code step is RED first. Every OpenCode claim cites the docs
through a `DocRef`. Live runs follow D0: `env -i`, a scratch `HOME`, no `XDG_*` variables, never `~/.config/opencode/`, and
never an Anthropic or Claude connection. Nothing in this phase calls a model: no `opencode run`.

Decided in this plan:

- **Destinations.** Project: `.opencode/opencode.json` (`root: project`), so sigil never opens a root `opencode.json[c]`.
  User: `opencode.json` under `opencode-home`, next to any `opencode.jsonc`, which sigil leaves alone. A key set in both goes
  to the `.jsonc`, and the setup page says so. `local` is refused: OpenCode has no personal per-project config file.
- **No `.jsonc` support and no `jsonc-parser` dependency**, per D7.
- **`shared/ado` joins OpenCode (step 5). This is the one `catalog/` edit in the roadmap's OpenCode work, and it departs from
  the roadmap's "no phase changes `catalog/`".** The roadmap counts 4 MCP servers, but `ado` lists `platforms: [claude,
copilot, cursor]`, so only 3 would ship. The ADR's 4 needs the edit, and Cursor's MCP commit (`cdd5ac3`) made the same one.
  OpenCode expands the whole file (D6), so `ado`'s token in `args` renders. It is also the only catalog server with env
  tokens, so without it the caveat in step 2 would never fire on shipped content. No neutral concept changes. To keep the
  roadmap's rule instead, delete step 5 and record 3 of 4 in the roadmap.
- **The "not valid JSON" hint stays target-free.** The ADR asked for a target-aware word, but `src/commands/` is neutral and the
  text is true of every JSON destination, so one helper covers `add` and `update` with no new `Target` field (step 4).
- **`mcpEnvCaveat` applies though OpenCode does expand references.** The field's doc says otherwise today, so step 2 widens
  it: a reader whose expansion has a trap. An unset variable becomes an empty string with no error, and a value holding `"`
  breaks the file (D6). Step 6 tests both.
- **`$schema` needs no code.** OpenCode 1 may insert it, drift compares only sigil's keys, and an uninstall that leaves only
  `$schema` keeps the file. Step 3 tests this.
- **A catalog agent still can't reach these servers.** Its allow-list denies MCP tools (D3), so only a primary agent uses them,
  and the setup page keeps saying so. No agent spec changes here.

## Step 1: Dialect and config table `[worker:medium]`

New `src/targets/opencode/mcp-ops.ts` and `src/targets/opencode/config.ts`, a new `OPENCODE_MCP_DOC` and
`OPENCODE_CONFIG_DOC` in `src/targets/opencode/doc-refs.ts`, and new `test/targets/opencode-mcp.test.ts`. Model all three on
`src/targets/cursor/mcp-ops.ts`, `src/targets/cursor/config.ts` and the first three `describe` blocks of
`test/targets/cursor-mcp.test.ts`, including the arrow wrappers that keep the import cycle safe. Don't touch
`src/targets/opencode/index.ts` or `capabilities.ts`, and don't add a `resolve…Destination` helper, since nothing calls one.

```ts
export const OPENCODE_MCP_DIALECT: McpDialect = {
  serversKey: 'mcp',
  envSyntax: { format: name => '{env:' + name + '}' },
  interpolatedFields: ['command', 'args', 'env', 'url', 'headers'],
  envKey: 'environment',
  commandForm: 'array',
  stdioType: 'local',
  remoteType: { set: 'remote' },
};
```

`OPENCODE_CONFIG_KINDS` has one entry, `mcp`, with `section: 'mcp'`:

- `project`: `file: '.opencode/opencode.json'`, `root: 'project'`, `display: '.opencode/opencode.json, git-committed'`.
- `user`: `file: 'opencode.json'`, `root: 'opencode-home'`,
  `display: '$XDG_CONFIG_HOME/opencode/opencode.json, default ~/.config/opencode/opencode.json'`.

Exports: `OPENCODE_MCP_DIALECT`, `buildOpenCodeMcpOps(artifact, scope)`, `openCodeMcpSkipReason(artifact)` and
`OPENCODE_CONFIG_KINDS`. The target name in `destinationFor` is `'OpenCode'`.

Doc refs, `verifiedOn: '2026-11-04'`: `OPENCODE_MCP_DOC` is `https://opencode.ai/docs/mcp-servers/` (the `mcp` map; `local`
with a `command` array and `environment`; `remote` with `url` and `headers`). `OPENCODE_CONFIG_DOC` is
`https://opencode.ai/docs/config/` (`{env:NAME}`, an unset variable becoming empty, `opencode.json` layers and precedence).

Test cases, with no catalog edit, so `ado`'s cases use a fixture artifact object rather than the catalog:

| Case                                      | Expected                                                                                              |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `shared/filesystem`, project              | `op.file` `.opencode/opencode.json`, `op.root` `project`, `op.strategy` `{ mcp: 'object-spread' }`    |
| `shared/filesystem`, user                 | `op.file` `opencode.json`, `op.root` `opencode-home`                                                  |
| `local` scope                             | Throws `SigilError` matching `/\.opencode\/opencode\.json/`                                           |
| `shared/filesystem` server                | Deep-equals, keys in order: `type: 'local'`, `command: ['npx', '-y', '<pinned pkg>', '.']`, no `args` |
| `shared/context-mode` server (no `args`)  | `{ type: 'local', command: ['context-mode'] }`                                                        |
| `shared/maku-jam` server (`type: http`)   | `{ type: 'remote', url: 'https://mcp.jam.dev/mcp' }`, one `type` key                                  |
| Fixture stdio, env and token in `args`    | `environment: { TOKEN: '{env:TOKEN}' }`, no `env` key, `command` holding `{env:ORG}`                  |
| Fixture remote, token in `headers`        | `headers: { Authorization: 'Bearer {env:TOKEN}' }`                                                    |
| `openCodeMcpSkipReason`, each catalog mcp | `undefined`                                                                                           |
| No literal `{sigil:env:` in any op        | `JSON.stringify(op.fragment)` doesn't match                                                           |

Read the pinned package from the catalog artifact's `server.args`, so a version bump doesn't break the test.

Test: `npm run build && npm run build:test && node --test test-compiled/targets/opencode-mcp.test.js`. Later steps' "`opencode-mcp`
test file" means this command.

## Step 2: Wire MCP into the target `[worker:medium]`

`src/targets/opencode/index.ts`, `src/targets/opencode/capabilities.ts`, `src/types.ts` (one doc comment), and
`test/targets/opencode.test.ts`, plus regenerated `docs/reference/capabilities.md` from `npm run build`. Model the wiring on
`src/targets/cursor/index.ts`.

- `capabilities.ts`: `mcp: { mode: 'native' }`. In the module comment, replace the Phase E sentence with the MCP delivery, and
  drop any "MCP comes later" wording. Same for the `index.ts` module comment.
- `index.ts`: `readonly configKinds: ConfigKindTable = OPENCODE_CONFIG_KINDS`, `configScopes`, `scaffoldConfig` and
  `configSkipReason` through `configScopesFrom`, `scaffoldConfigFrom` and `configSkipReasonFrom`, with this scope list:

  ```ts
  const OPENCODE_CONFIG_SCOPES = [
    {
      value: 'project' as ConfigScope,
      precedence: 1,
      shared: true,
      blastRadius: 'project' as const,
      description: 'project — .opencode/opencode.json, git-committed',
    },
    {
      value: 'user' as ConfigScope,
      precedence: 2,
      shared: false,
      blastRadius: 'all-projects' as const,
      description: 'user — ~/.config/opencode/opencode.json, all projects',
    },
  ];
  ```

- `index.ts`, the new field:

  ```ts
  /**
   * OpenCode replaces each reference with the variable's raw value when it reads the file: an
   * unset variable becomes an empty string with no error, and a value holding `"` breaks the file.
   */
  readonly mcpEnvCaveat =
    'OpenCode reads each one when it starts: an unset variable becomes an empty string with no ' +
    'error, and a value holding a double quote stops OpenCode from loading the file. Export ' +
    'them first. Do not write a secret into the file instead: .opencode/opencode.json is usually ' +
    'committed.';
  ```

- `afterInstallHint`: add `MCP servers in .opencode/opencode.json load in the next session.` before the `Do not also install`
  sentence.
- `src/types.ts:475-478`, the `mcpEnvCaveat` doc: `What can go wrong with environment-variable references in this target's MCP
file: a known reader that doesn't expand them, or an expansion with a trap. \`add\` prints it when an installed server uses
  \`{sigil:env:NAME}\`.`
- `test/targets/opencode.test.ts:165`: the skip test stops expecting `mcp`, and is renamed `should skip hook, settings and
workflow ids, each with its reason`.

New cases in `test/targets/opencode-mcp.test.ts`, modeled on `describe('Cursor MCP config scopes')`:

| Case                                              | Expected                                                                                 |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `configScopes(['mcp'], dir)`                      | `project` then `user`, with `.opencode/opencode.json` and `<xdg>/opencode/opencode.json` |
| `configScopes(['hook', 'settings'], dir)`         | Both scopes with empty `destinations`                                                    |
| `supportsKind`-style lookup for `mcp`, `scaffold` | Native                                                                                   |
| `hook`, `settings` capability                     | Still `none`, with the reasons unchanged                                                 |
| `scaffoldConfig` on a hook artifact               | Throws `/supports only the 'mcp' config kind/`                                           |
| `compile` on the full catalog                     | No key under `.opencode/opencode.json`: MCP is `add`-only, as on Cursor                  |

Test: the `opencode-mcp` and `opencode` test files, then `git diff --stat docs/reference/capabilities.md` shows one row and its
footnote changed.

## Step 3: End-to-end install behavior `[worker:medium]`

`test/targets/opencode-mcp.test.ts`. Port `describe('Cursor MCP e2e')` from `test/targets/cursor-mcp.test.ts:259`, with
`.opencode/opencode.json` and the `mcp` key, and set `XDG_CONFIG_HOME` in the spawned env for user scope. The code is done
in step 2, so these should pass at once. Check that each would fail against a broken op, by flipping `serversKey` once
locally before committing, and say so in the summary.

| Case | Do                                                               | Expected                                                                                           |
| ---- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 1    | `add shared/filesystem`                                          | The file holds only `mcp.filesystem`                                                               |
| 2    | `add` over a file with `mcp.mine` and a `model` key              | Both kept, in order                                                                                |
| 3    | `add` again                                                      | Byte-identical                                                                                     |
| 4    | `update` after the catalog server changes                        | Entry replaced, `mine` untouched                                                                   |
| 5    | Entry deleted, then `update`                                     | Drift `missing`, restored without `--force`                                                        |
| 6    | Entry edited, then `update`, then `update --force`               | Drift `modified`: kept, then restored                                                              |
| 7    | `uninstall` with `mine` present                                  | Only `filesystem` removed                                                                          |
| 8    | `uninstall` from a sigil-only file                               | The file is removed                                                                                |
| 9    | User scope, `XDG_CONFIG_HOME` set, file holds a user server      | Writes `$XDG_CONFIG_HOME/opencode/opencode.json`, one `.sigil.bak`, none on a second add           |
| 10   | User scope, no prior file                                        | No backup                                                                                          |
| 11   | `--scope local`                                                  | Exits non-zero, names `.opencode/opencode.json`, writes nothing                                    |
| 12   | Root `opencode.jsonc` with a comment, `add` at project and user  | The `.jsonc` is byte-identical; sigil's entry is in `.opencode/opencode.json`                      |
| 13   | User scope, `opencode.jsonc` in the home dir                     | The `.jsonc` is byte-identical; `opencode.json` is created beside it, no backup                    |
| 14   | `$schema` added to the file, `update`, then `uninstall`          | Case 3's bytes aside from `$schema`, no `modified` drift; afterwards the file holds only `$schema` |
| 15   | Fixture server using a `{sigil:env:NAME}` token, `add`           | stderr holds the caveat's `an unset variable becomes an empty string`                              |
| 16   | `add --target opencode shared/filesystem` with `--target claude` | Each file gets one entry; uninstalling one target leaves the other file intact                     |

Test: `opencode-mcp` test file.

## Step 4: The `.json` comment hint `[worker:medium]`

`src/config-merge/file-format.ts`, `src/config-merge/index.ts`, `src/commands/add/read-config.ts`,
`src/commands/update-config-io.ts`, and new cases in `test/commands/home-backup.test.ts` or a new
`test/commands/config-parse-hint.test.ts`.

OpenCode parses `.json` as JSONC, so a hand-commented `opencode.json` works there and fails sigil's parse. Add to
`file-format.ts`, exported through `index.ts`:

```ts
/** Why a config file fails to parse, as one sentence ending in a period. */
export function configParseProblem(fullPath: string): string {
  const name = configFormatName(fullPath);
  if (name !== 'JSON') return `is not valid ${name}.`;
  return "is not valid JSON. sigil can't keep comments or trailing commas in a .json file: remove them, or move your settings to a .jsonc file if your tool reads one.";
}
```

The two messages become `${fullPath} exists but ${configParseProblem(fullPath)} Fix it first.` and
`${cfFile} exists but ${configParseProblem(fullPath)} Skipped.`, and neither module imports `configFormatName` any more. Remove
it from `index.ts` if nothing else uses it, and unexport it if `file-format.ts` is the only reader. Update any test asserting
the old text; `not valid JSON` remains a substring, so most keep passing.

| Case                                                                       | Expected                                                                                    |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `configParseProblem('a/opencode.json')`                                    | Holds `comments or trailing commas`                                                         |
| `configParseProblem('a/config.toml')`                                      | Exactly `is not valid TOML.`                                                                |
| `add --target opencode` over a `.opencode/opencode.json` holding `// note` | Exits non-zero, stderr holds both `not valid JSON` and `.jsonc`; the file is byte-identical |
| `update` when that file gained a comment after install                     | stderr holds `.jsonc` and `Skipped.`; the file is byte-identical                            |

Test: the new test file, plus `test/commands/update-config-move.test.ts`.

## Step 5: `shared/ado` on OpenCode `[inline: a one-word catalog edit that departs from the roadmap]`

`catalog/shared/mcps/ado.mcp.md`: `platforms: [claude, copilot, cursor, opencode]`. In
`test/targets/opencode-mcp.test.ts`, add one case: `shared/ado` gives `command` holding `{env:ADO_ORG}` and
`environment: { ADO_MCP_PERSONAL_TOKEN: '{env:ADO_MCP_PERSONAL_TOKEN}' }`.
Then regenerate anything `npm run validate` or the `sync --check` step reports as stale.

Test: `opencode-mcp` test file, `npm run validate`, and `npm run build` leaves no unexpected diff.

## Step 6: `probe:opencode`, V1 loader cases `[worker:medium]`

New `scripts/probe-opencode.mjs`, `scripts/opencode-probe/catalog/shared/mcps/probe-env.mcp.md`,
`scripts/opencode-probe/mcp-server.mjs`, and a `"probe:opencode": "node scripts/probe-opencode.mjs"` line in `package.json`.
Follow `scripts/probe-antigravity.mjs` for the header comment, `parseArgs`, `prepareCatalog`, `run`, `makeRepo`, `selectProbes`,
`cleanup` and the `OK` / `CHANGED` / `ERROR` report. Flags: `--only <id,...>`, `--dry-run`, `--keep`. Without `opencode` on
PATH it prints a skip notice and exits 0. It isn't part of `npm test`, `check` or `ci:local`. It never runs `opencode run`.

Isolation, on every spawned `opencode` and `sigil`: `env` is exactly `{ HOME: <run>/home, PATH: <dirname of execPath>:/usr/bin:/bin,
TMPDIR: <run>/tmp }` plus the probe's own variables, stdin closed, a 60-second timeout. Each probe gets a fresh `git init` repo
with one commit.

`mcp-server.mjs` is a wrapper: it appends `TOKEN=<process.env.PROBE_TOKEN>` to the file named in `process.argv[2]`, then does
`await import('../antigravity-probe/mcp-server.mjs')`. `probe-env.mcp.md`:

```yaml
id: shared/probe-env
kind: mcp
title: Probe Environment MCP Server
description: Records PROBE_TOKEN so the OpenCode probe can read what the server received.
server:
  command: node
  args: ['__PROBE_SERVER__', '__PROBE_OUT__']
  env:
    PROBE_TOKEN: '{sigil:env:PROBE_HOST_TOKEN}'
```

`prepareCatalog` replaces both placeholders, and `__PROBE_OUT__` is `<run>/token.txt`. `sigil add` runs with `--catalog-dir` and
`--yes`.

| Id             | Setup                                                                 | Check                                                                              | Expect |
| -------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------ |
| `O-skill`      | `add shared/feature`                                                  | `opencode debug skill` lists `feature`                                             | pass   |
| `O-agent`      | `add shared/code-reviewer`                                            | `opencode agent list` shows `code-reviewer (subagent)`                             | pass   |
| `O-perm`       | Same                                                                  | `opencode debug agent code-reviewer`: `*` deny, then `read` `*` allow, `*.env` ask | pass   |
| `O-mcp`        | `add shared/probe-env`, `PROBE_HOST_TOKEN=tangerine`                  | `opencode mcp list` shows `connected`, `token.txt` holds `TOKEN=tangerine`         | pass   |
| `O-mcp-unset`  | Same, variable unset                                                  | `connected`, `token.txt` holds `TOKEN=` with nothing after it                      | pass   |
| `O-mcp-quote`  | Same, `PROBE_HOST_TOKEN='a"b'`                                        | `mcp list` exits non-zero or prints a config error, and never `connected`          | pass   |
| `O-mcp-remote` | `add shared/maku-jam`                                                 | `opencode debug config`: `mcp['maku-jam'].type` is `remote`, `url` matches         | pass   |
| `O-mcp-user`   | `add shared/probe-env --scope user`, variable set                     | Written under `<run>/home/.config/opencode/`, and `mcp list` shows `connected`     | pass   |
| `O-jsonc`      | Root `opencode.jsonc` with a comment and a server, then `O-mcp`'s add | `.jsonc` byte-identical, and `mcp list` shows both servers                         | pass   |

Don't run `npm run probe:opencode` against a live OpenCode as your acceptance if it can't be reached; run `--dry-run`, and the
main session runs it live in step 8.

Test: `node scripts/probe-opencode.mjs --dry-run` lists all nine, and `PATH=/usr/bin:/bin node scripts/probe-opencode.mjs` prints
the skip notice and exits 0. Then `npx eslint scripts/probe-opencode.mjs scripts/opencode-probe/mcp-server.mjs`.

## Step 7: `probe:opencode`, the `serve` route `[worker:high: two CLIs with undocumented routes, and the retry behavior is only known from the ADR's run notes]`

`scripts/probe-opencode.mjs`.

The route that V1's `/command` and everything on V2 need. Add a `--v2 <path>` flag naming a `@opencode/cli` binary, and a
`serveClient(bin, repo, env)` helper that starts `opencode serve` (with `--standalone` on V2), reads the printed password, and
talks basic auth with the user `opencode`. Setup notes are in the ADR's [V2 run](decisions/opencode-target-2026-11.md#v2-run)
and [Sigil output run](decisions/opencode-target-2026-11.md#sigil-output-run). Follow these exactly:

- Fixtures need a commit (step 6 gives one), then create a session, then poll each second for a project entry and for a filled
  list, up to 15 seconds. A single read 4 seconds in came back empty, so never one read.
- V1 lists at `/command`. V2 lists at `/api/skill`, `/api/command`, `/api/agent`, `/api/mcp`.
- Kill the server in a `finally`, and report `ERROR` rather than hanging if it prints no password within 15 seconds.

New probes: `O-command` runs on V1: `add shared/author-artifact`, and `/command` lists `shared-author-artifact`. With `--v2`, these
run on the V2 binary too: `O2-skill`, `O2-agent`, `O2-perm`, `O2-command`, `O2-mcp`, `O2-mcp-unset`. They use the matching V1
probe's setup, and read the `/api/*` route in place of `debug` and `list`. Without `--v2` they are skipped by name. `O2-mcp`
expects the status `connected` and the same `token.txt`.

Install the V2 binary outside the repo for testing: `npm i --prefix <scratch> @opencode/cli@2.2.5`, then the path
`<scratch>/node_modules/@opencode/cli-linux-x64/bin/opencode`.

Test: `node scripts/probe-opencode.mjs --dry-run --v2 <path>` lists all sixteen, `node scripts/probe-opencode.mjs --only O-command,O2-mcp --v2 <path>`
ends `OK` on both, and `npx eslint scripts/probe-opencode.mjs`.

## Step 8: Run it live and record the result `[inline: a live run, whose result the ADR's claims rest on]`

`docs/decisions/opencode-target-2026-11.md`, and any fixture or expectation the run corrects.

Run `npm run probe:opencode -- --v2 <path>` with `opencode-ai` 1.19.4 and `@opencode/cli` 2.2.5. Add a `### Sigil MCP run`
section after [Sigil output run](decisions/opencode-target-2026-11.md#sigil-output-run), with versions, date and one row per
probe. `CHANGED` on `O-mcp-quote` means D6's claim is wrong: correct D6 and the caveat in step 2's text. Any other `CHANGED`
is a stop. Add a note to the Reuse map's `read-config.ts` row that step 4 chose a target-free hint, and to the capability rows
that `shared/ado` ships.

Test: the probe exits 0, and a listing of `~/.config/opencode/` taken before and after the run is identical.

## Step 9: Docs `[inline: user-facing copy]`

`docs/setup/opencode.md`, `README.md:239`, `docs/index.md:81`, `docs/reference/config-kinds.md`, `CHANGELOG.md`, and the
roadmap's figures.

- **`docs/setup/opencode.md`:** a `## MCP servers` section on the pattern of `docs/setup/antigravity.md:37-48`: the two commands, the
  files, the `.sigil.bak`, `--scope local` refused, `.jsonc` left alone with a key set in both going to the `.jsonc`, comments in
  a `.json` refused, `{env:NAME}` with its two traps, and that a server is the primary agent's only. Remove the `MCP servers | Not
yet` row. Keep the "allow-list denies MCP tools" bullet, updated now that servers ship. Add what `.opencode/` gains on V1
  (`.gitignore`), and how to run `npm run probe:opencode`.
- **`README.md:239`:** drop "MCP servers are not yet delivered, and", and add MCP to the list of what `add` writes.
- **`docs/index.md:81`:** "MCP servers through `add`" in place of "MCP not yet".
- **`docs/reference/config-kinds.md`:** an OpenCode sentence after line 18, a row or sentence in the MCP fields table, and the env
  paragraph after line 96 on `{env:NAME}` and the caveat.
- **`CHANGELOG.md`:** under `[Unreleased]`, in the `opencode` entry: MCP servers in `.opencode/opencode.json` or the user
  `opencode.json`, and the `.json` comment hint.
- **`docs/plan-opencode-target.md`:** under Phase E, the 4-of-4 note that `shared/ado` was opened in this phase, and amend "No
  phase changes `catalog/`" in the Summary.

Test: `npm run format:check`, and `grep -rn -i 'not yet delivered\|MCP not yet' README.md docs/index.md docs/setup/opencode.md`
prints nothing.
