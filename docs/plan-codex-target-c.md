# Plan: Codex target, Phase C (hooks)

Roadmap: [plan-codex-target](plan-codex-target.md). Probe results:
[codex-target-2026-10](decisions/codex-target-2026-10.md).

## Step 1 `[worker:medium]`: `protect-config` reads Codex's patch

Files: `catalog/shared/hooks/protect-config.hook.md`, `test/catalog/protect-config-hook.test.ts`,
`test/fixtures/output-snapshot/`.

In the hook's script, read a patch from `tool_input.command` too:

```js
const patch = typeof ti === 'string' ? ti : ti.command;
files = typeof patch === 'string' ? patchFiles(patch) : [ti.file_path ?? ti.path];
```

Test cases, in the existing `apply_patch` table style:

| `tool_input`                                                    | Expected |
| --------------------------------------------------------------- | -------- |
| `{ command: "*** Begin Patch\n*** Add File: .env\n+X=1\n..." }` | exit 2   |
| `{ command: "...*** Update File: config/.env.local\n..." }`     | exit 2   |
| `{ command: "...*** Delete File: id_rsa\n..." }`                | exit 2   |
| `{ command: "...*** Add File: src/a.ts\n..." }`                 | exit 0   |
| `{ command: 42 }`                                               | exit 0   |
| `{ file_path: ".env" }`, string patch naming `.env`             | exit 2   |

Test: RED first on the first three, then `npm run snapshot:update` and `npm test`.

## Step 2 `[worker:medium]`: the `codex-home` root

Files: `src/types.ts`, `src/config-utils.ts`, `test/commands/home-backup.test.ts`.

Add `'codex-home'` to `ConfigRoot`, documented like `copilot-home`. `resolveCodexHome()` returns `path.resolve($CODEX_HOME)`,
default `~/.codex`; wire it into `resolveConfigRoot` and `isHomeScopedRoot`.

Test cases: `CODEX_HOME` set resolves there; unset resolves to `~/.codex`; `isHomeScopedRoot('codex-home')` is true; a
first write to a user-owned file there takes one `.sigil.bak`.

Test: `npm test`.

## Step 3 `[worker:medium]`: hook ops and capability

Files: new `src/targets/codex/{config,hook-ops,aggregate-docs}.ts`, `src/targets/codex/{index,capabilities,doc-refs,metadata}.ts`,
new `test/targets/codex-hooks.test.ts`.

- `config.ts`, `resolveCodexConfigDestination('hook', scope)`: `project` → `.codex/hooks.json`, root `project`; `user` →
  `hooks.json`, root `codex-home`; `local` → `SigilError`: Codex has no personal per-project hook file, use `project` or
  `user`.
- `hook-ops.ts`, `buildCodexHookOps(artifact, scope)`: fragment
  `{ hooks: { [event]: [{ matcher, hooks: [entry] }] } }` with matcher default `'*'`, strategy
  `{ hooks: 'array-append' }`, like `src/targets/claude-code/config-scaffold.ts`. `entry` is `{ type: 'command', command,
commandWindows?, timeout? }`.
- `refuse` an event outside Codex's documented set (`PreToolUse`, `PermissionRequest`, `PostToolUse`, `PreCompact`,
  `PostCompact`, `UserPromptSubmit`, `SubagentStart`, `SubagentStop`, `Stop`, `Interrupt`, `SessionStart`, `SessionEnd`)
  with a `SigilError`, as Copilot's `refuseUnaliasedEvent` does.
- `posixCommandLine(command, args)`: joins words, leaving `/^[\w@%+=:,./-]+$/` bare and single-quoting the rest
  (`'` becomes `'\''`). No `args` means `command` as written.
- `windowsCommandLine(command, args)`: with no `args`, undefined (so Codex uses `command`). For `node` with exactly
  `['-e', script]`: `node -e "eval(Buffer.from('<base64 of script>','base64').toString())"`. Otherwise words matching
  `/^[\w@+=:,./\\-]+$/` are joined with spaces, and anything else throws a `SigilError` that the hook can't be expressed
  for `cmd.exe`, because a hook that can't start lets every call through.
- `CodexTarget`: `scaffoldConfig` and `configScopes` (Project and User), `hook: { mode: 'native' }`. `CODEX_HOOKS_DOC`
  (`https://learn.chatgpt.com/docs/hooks`) in `doc-refs.ts` and `CODEX_AGGREGATE_DOCS`. `afterInstallHint` adds: review
  hooks with `/hooks`, because Codex skips a hook until then.

Test cases:

| Input                                         | Expected                                                                        |
| --------------------------------------------- | ------------------------------------------------------------------------------- |
| `shared/protect-config`, project scope        | `.codex/hooks.json`, `hooks.PreToolUse[0].matcher` `Edit\|Write`, no `args` key |
| Its `command`, run with `sh -c`, `.env` patch | exit 2                                                                          |
| Its `command`, run with `sh -c`, `a.ts` patch | exit 0                                                                          |
| Its `commandWindows`, run with `sh -c`        | same two exit codes (the string has no shell-specific part)                     |
| user scope, `CODEX_HOME` set                  | `hooks.json`, root `codex-home`                                                 |
| local scope                                   | throws, naming project and user                                                 |
| event `Notification`                          | throws                                                                          |
| `args: ['a"b']` with a non-node command       | throws for `cmd.exe`                                                            |
| `posixCommandLine('x', ["it's", 'a b'])`      | `x 'it'\''s' 'a b'`                                                             |
| Re-`add`, then uninstall, with a user's hook  | one sigil entry; user's hook stays                                              |

Test: `npm test`.

## Step 4 `[inline: user-facing copy]`: docs and live check

`protect-config` body (Codex's trust review, `commandWindows` untested), `docs/setup/codex.md`, `docs/reference/config-kinds.md`,
README, `CHANGELOG.md`, `capabilities.md`, the decision record. Also the plugin route from Phase G, with the warning not
to install `hook-*` plugins.

Test: `npm run ci:local`, then against the mock, `sigil add shared/protect-config --target codex` must deny an
`apply_patch` to `.env` and allow a control file.
