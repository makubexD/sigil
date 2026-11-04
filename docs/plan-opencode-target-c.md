# Plan: OpenCode target, Phase C (shared changes)

Part of the [roadmap](plan-opencode-target.md). Three target-layer changes that Phases D and E need. No target uses them
yet, so `dist/` must stay byte-identical, and step 5 proves it. The reasons are in the
[reuse map](decisions/opencode-target-2026-11.md#reuse-map), and the MCP shape in
[D6](decisions/opencode-target-2026-11.md#d6-mcp).

No `catalog/` or zod schema change, and no new symbol in `src/index.ts`. `ConfigRoot` is already exported there, so its new
member is a deliberate widening of a public type. Each code step is RED first: write the tests, see them fail for the
right reason, then implement. There is no `CHANGELOG.md` entry, because nothing here reaches a user.

Decided from the reuse map: the hint in `src/commands/add/read-config.ts:23` stays as it is here. It can only fire for
OpenCode once `opencode.json` has a writer, so Phase E changes it, with a test, in the step that adds that writer.

## Step 1: `McpDialect` type values `[worker:medium]`

`src/targets/mcp-dialect.ts`, `test/targets/mcp-dialect.test.ts`.

- `stdioType?: 'stdio' | 'local'`. In `applyTypePolicy`, any set value goes first and an authored `type` is removed, the
  same as today's `'stdio'` branch.
- `remoteType: 'keep' | 'drop' | { readonly set: string }`. The object form writes `type: <set>` first and removes an
  authored `type`.

Update both doc comments. Existing dialect values don't change.

| Case | Dialect                       | Server                              | Expected config, in key order                     |
| ---- | ----------------------------- | ----------------------------------- | ------------------------------------------------- |
| 1    | `stdioType: 'local'`          | `{ command: 'x' }`                  | `{ type: 'local', command: 'x' }`                 |
| 2    | `stdioType: 'local'`          | `{ command: 'x', type: 'stdio' }`   | `{ type: 'local', command: 'x' }`                 |
| 3    | `stdioType: 'stdio'`          | `{ command: 'x' }`                  | `{ type: 'stdio', command: 'x' }`                 |
| 4    | `remoteType: {set: 'remote'}` | `{ type: 'http', url: 'u' }`        | `{ type: 'remote', url: 'u' }`                    |
| 5    | `remoteType: {set: 'remote'}` | `{ url: 'u' }`                      | `{ type: 'remote', url: 'u' }`                    |
| 6    | `remoteType: {set: 'remote'}` | `{ url: 'u', headers: { A: 'b' } }` | `{ type: 'remote', url: 'u', headers: {A: 'b'} }` |

Test: `npm run build && npm run build:test && node --test test-compiled/targets/mcp-dialect.test.js`.

## Step 2: `McpDialect` field shape `[worker:medium]`

`src/targets/mcp-dialect.ts`, `test/targets/mcp-dialect.test.ts`.

- `envKey?: string`: `env` is written under this key, in the same position.
- `commandForm?: 'array'`: `command` becomes `[command, ...args]`, in `command`'s position, and `args` is removed.
- Both apply in `renderMcpServer` after `applyTypePolicy` and before `expandEnvTokens`, through one small helper.
  `skipReason` keeps checking the authored field names, so `interpolatedFields` keeps its meaning.

Dialect in every case: `envKey: 'environment'`, `commandForm: 'array'`, `stdioType: 'local'`, an env syntax writing
`{env:NAME}`, and all five fields in `interpolatedFields`.

| Case | Server                                                         | Expected config, in key order                                      |
| ---- | -------------------------------------------------------------- | ------------------------------------------------------------------ |
| 1    | `{ command: 'x', args: ['a', 'b'] }`                           | `{ type: 'local', command: ['x', 'a', 'b'] }`                      |
| 2    | `{ command: 'x' }`                                             | `{ type: 'local', command: ['x'] }`                                |
| 3    | `{ command: 'x', args: [] }`                                   | `{ type: 'local', command: ['x'] }`                                |
| 4    | `{ env: { A: '{sigil:env:A}' }, command: 'x' }`                | `{ type: 'local', environment: { A: '{env:A}' }, command: ['x'] }` |
| 5    | `{ command: '{sigil:env:C}', args: ['{sigil:env:D}'] }`        | `{ type: 'local', command: ['{env:C}', '{env:D}'] }`               |
| 6    | Dialect without `commandForm`, `{ command: 'x', args: ['a'] }` | `{ type: 'local', command: 'x', args: ['a'] }`                     |
| 7    | Dialect without `envKey`, `{ command: 'x', env: { A: 'b' } }`  | `env` stays under `env`                                            |
| 8    | `interpolatedFields` without `args`, `args: ['{sigil:env:D}']` | `{ skip }` naming `args`, the authored name                        |

Test: same command as step 1.

## Step 3: `bodyTransform` receives the artifact `[worker:medium]`

`src/targets/spec-types.ts`, `src/targets/emit.ts`, `test/targets/emit-files.test.ts`.

The type becomes `(body: string, artifact: ResolvedArtifact) => string`, and `emit.ts:103` passes the artifact. Update the
doc comment: a position needs the artifact's `args:`. Existing transforms take one parameter and stay unchanged; check that
none has a second optional parameter that would now receive the artifact.

| Case | Do                                                       | Expected                          |
| ---- | -------------------------------------------------------- | --------------------------------- |
| 1    | A spec whose transform appends `artifact.id` to the body | The emitted file holds the id     |
| 2    | A spec with no `bodyTransform`                           | Body unchanged                    |
| 3    | `resolvedBody` set on the artifact                       | The transform gets `resolvedBody` |

Test: `npx tsc --noEmit -p tsconfig.build.json`, then the same command for `test-compiled/targets/emit-files.test.js`.

## Step 4: `opencode-home` config root `[worker:medium]`

`src/types.ts`, `src/config-utils.ts`, `docs/reference/config-kinds.md`, and a new `test/config-root.test.ts`.

- Add `opencode-home` to `ConfigRoot`, with its line in the doc comment at `src/types.ts:179`.
- `resolveOpenCodeHome()` beside `resolveCodexHome()`: `path.join(path.resolve($XDG_CONFIG_HOME), 'opencode')`, else
  `~/.config/opencode`. An empty value counts as unset, as for its siblings.
- A `case` in `resolveConfigRoot`, a line in its doc comment, and an entry in `isHomeScopedRoot`.
- `config-kinds.md`: the same row or mention `codex-home` has.

Each case sets and restores the variable itself.

| Case | `XDG_CONFIG_HOME` | Call                                      | Expected                              |
| ---- | ----------------- | ----------------------------------------- | ------------------------------------- |
| 1    | unset             | `resolveConfigRoot('opencode-home', dir)` | `<homedir>/.config/opencode`          |
| 2    | `/tmp/x`          | same                                      | `path.resolve('/tmp/x')` + `opencode` |
| 3    | empty             | same                                      | `<homedir>/.config/opencode`          |
| 4    | any               | `isHomeScopedRoot('opencode-home')`       | `true`                                |
| 5    | any               | `resolveConfigRoot('project', dir)`       | `dir`, proving no fallthrough changed |

Test: `npx tsc --noEmit -p tsconfig.build.json`, then the same command for `test-compiled/config-root.test.js`.

## Step 5: Prove no output changed `[inline: verification, not a code change]`

Build `master` in a scratchpad worktree, symlinking `node_modules`, and this branch, with `npm run build` and
`npm run catalog:build` in each. Remove the worktree after.

Test, each printing nothing:

```bash
diff -r <worktree>/dist dist
git status --short schema docs/reference/capabilities.md docs/reference/artifacts.md
```

A difference here is a failed phase, not a thing to regenerate.

## Step 6: Delete finished plans `[inline: tiny, the roadmap's close-out]`

`git rm docs/plan-opencode-target-a.md docs/plan-opencode-target-b.md`. First point any link at them elsewhere: the
[V2 run](decisions/opencode-target-2026-11.md#v2-run) already holds B's results.

Test: this prints nothing.

```bash
grep -rln 'plan-opencode-target-[ab]\.md' docs README.md CHANGELOG.md
```
