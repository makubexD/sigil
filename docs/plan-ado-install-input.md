# Plan: `shared/ado` on azcli, with install-time variables

`shared/ado` can't authenticate today. It sets `ADO_MCP_PERSONAL_TOKEN`, but `--authentication pat` in `@azure-devops/mcp` 2.10.0
reads a base64 `PERSONAL_ACCESS_TOKEN` (`dist/auth.js:134-146`). The owner authenticates with the Azure CLI, so the entry moves to
`azcli` with no `env` block. That leaves the organization as the only variable part. It's a required positional argument and no
environment variable reads it, so sigil has to write the real value at install. This plan adds that as a neutral catalog concept,
then opens `ado` to all six targets, OpenCode included.

Target shape, on every target and in that target's dialect:

```json
"ado": {
  "command": "npx",
  "args": ["-y", "@azure-devops/mcp@2.10.0", "<org>", "--authentication", "azcli", "-d", "core", "work", "work-items"]
}
```

Standing procedure: RED first, every step's own test command, `npm run ci:local` in the finish. Every code step keeps all six targets'
output unchanged until step 12 changes the catalog. Test files use `contoso`; the owner's real org never goes in this repo.

## Decided in this plan

Each of these is settled from the docs and the code, per the repo's target rules. None needs an owner decision.

- **The concept is a variable, `{sigil:var:NAME}`, declared under `vars:` on an `mcp` artifact.** Unlike `{sigil:env:NAME}`, which each
  target writes as a reference read at run time, a var is replaced by a literal value before any target sees the artifact. The env token
  in `args` was rejected already: Codex and Antigravity can't carry it, and VS Code Copilot Chat passes it through as text
  (`docs/reference/config-kinds.md`).
- **A var isn't for secrets, and the schema doc comment says so.** The value lands in plain text in the config file and the manifest, and
  both can be committed.
- **Substitution happens once, outside the targets.** A new `scaffoldConfigOps` wraps `target.scaffoldConfig` and hands it a catalog copy
  whose artifact has literal values, so no target, dialect or Codex's TOML writer changes. `configSkipReason` keeps reading the raw
  artifact. No token survives: the wrapper throws if `{sigil:var:` appears in a returned op.
- **Value rule, fixed in code:** `^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$`. The value reaches a command line and files with their own
  expansion syntax, so a leading `-` (option injection) and `$`, `{`, `/`, spaces and quotes are refused. It's enforced on flags, prompts
  and **recorded values**, because `src/commands/update-config.ts` treats the manifest as committed and editable. A recorded value that fails
  counts as missing. A catalog-supplied regex was rejected: third-party catalogs would run their own pattern against user input.
- **Resolution order:** `--var NAME=value`, then the value recorded for this id and target, then the value recorded for this id on
  another target, then a prompt in a terminal. Otherwise `add` fails before writing anything, naming the flag to pass. `--yes` never
  prompts. `--dry-run` never prompts: a missing value previews as `<NAME>`, and nothing is written or recorded.
- **`add --var` with a changed value reinstalls.** An id whose flag value differs from the recorded one is not up to date.
- **An unknown `--var NAME` is an error** on `add` and `update`, so a typo isn't silently dropped. A malformed flag is an error too.
- **`update` takes `--var` and never prompts.** It keeps its flow simple: a missing value prints
  `kept as installed: needs ADO_ORG; re-run with --var ADO_ORG=<value>` through the existing `skipReason` path, and the entry stays
  outdated. `status` and `outdated` report it as stale rather than hiding it.
- **The Claude plugin uses `userConfig`.** A plugin has no install step, so `mcp-ado` declares `userConfig.ADO_ORG` in `plugin.json` and
  writes `${user_config.ADO_ORG}` in `.mcp.json`. The
  [plugin manifest reference](https://code.claude.com/docs/en/plugins-reference#user-configuration) documents the prompt on enable, the
  substitution in MCP config, and the required `type`, `title` and `description`, so `vars:` needs `title` and `description`. The other
  plugin channels ship no MCP. `ci:local`'s `claude plugin validate --strict` checks the result.
- **`vars` isn't exported from `src/index.ts`.** No public API change.

## Known limits, stated in the docs step

- Installing for two targets that share `.mcp.json` with different values leaves the first target's fragment `modified`. Use one value,
  or `update --force`.
- `azcli` needs `az` on `PATH` and `az login`. `config-kinds.md` says Copilot CLI passes a local server only `PATH`, so `az` may not find
  its login there. This machine has no `az`, so that and a real tool call stay unproven until the owner runs them.
- Existing `ado` installs need `update --var ADO_ORG=<org>` once. This is a breaking change, and `CHANGELOG.md` says so.

## Step 1: The var module `[worker:medium]`

New `src/mcp-vars.ts` and `test/mcp-vars.test.ts`. Reuse `isEnvName` from `src/targets/env-reference.ts` and model the walkers on its
`envTokenNames` and `expandEnvTokens`.

```ts
export type VarValues = Readonly<Record<string, string>>;
export const VAR_VALUE_RULE: string; // one sentence for error messages and the prompt's validate
export function isVarValue(value: string): boolean;
export function varTokenNames(value: unknown): string[]; // distinct, first-seen, any depth
export function substituteVars<T>(value: T, lookup: (name: string) => string): T; // any depth; other values pass
export function declaredVarNames(artifact: Pick<Artifact, 'frontmatter'>): string[]; // keys of frontmatter.vars, [] when absent
export function missingVars(artifact: Pick<Artifact, 'frontmatter'>, values: VarValues): string[];
export function usableVars(recorded: VarValues | undefined): VarValues; // drops values failing isVarValue
export function parseVarFlags(raw: readonly string[]): VarValues; // throws SigilError
```

| Case                                                                                | Expected                                        |
| ----------------------------------------------------------------------------------- | ----------------------------------------------- |
| `isVarValue` on `contoso`, `a.b_c-d`, `0org`, 128 characters                        | `true`                                          |
| `isVarValue` on `''`, `-x`, `--help`, `a b`, `a/b`, `${X}`, `{x}`, `a"b`, 129 chars | `false`                                         |
| `varTokenNames` on nested arrays and objects with a repeat                          | Each name once, first-seen order                |
| `substituteVars` on `['-y', 'x{sigil:var:A}y', { k: '{sigil:var:B}' }]`             | Both replaced, array and object shape kept      |
| `substituteVars` leaves `{sigil:env:A}`                                             | Unchanged                                       |
| `substituteVars` of `{sigil:var:1BAD}`                                              | Throws `SigilError` naming the token            |
| `missingVars` with one of two declared values                                       | The other name                                  |
| `missingVars` with no `vars:`                                                       | `[]`                                            |
| `usableVars({ A: 'ok', B: '-x' })`                                                  | `{ A: 'ok' }`                                   |
| `usableVars(undefined)`                                                             | `{}`                                            |
| `parseVarFlags(['A=x', 'B=y'])`                                                     | `{ A: 'x', B: 'y' }`                            |
| `parseVarFlags(['A'])`, `['=x']`, `['1A=x']`                                        | Throws `SigilError` showing `--var NAME=value`  |
| `parseVarFlags(['A=-x'])`                                                           | Throws `SigilError` containing `VAR_VALUE_RULE` |
| `parseVarFlags(['A=x', 'A=y'])`                                                     | Throws `SigilError` naming the repeated `A`     |

Test: `npm run build && npm run build:test && node --test test-compiled/mcp-vars.test.js`. Later steps' "`mcp-vars` test file" means this
command.

## Step 2: Schema and catalog check `[worker:medium]`

`src/schema/index.ts`, new `src/validate/var-checks.ts`, `src/validate/index.ts` (one call and one numbered line in its header comment),
new `test/validate/var-checks.test.ts`, plus `schema/mcp.schema.json` from `npm run build`. Model the check on
`src/validate/deprecated-checks.ts`.

On `McpSchema`, with a doc comment that says a var is a literal written at install and never a secret:

```ts
vars: z
  .record(
    z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/),
    z.strictObject({ title: z.string().min(1), description: z.string().min(1) }),
  )
  .optional(),
```

`checkVarDeclarations(ctx, artifact)` runs on `mcp` artifacts, as errors:

| Case                                    | Expected                             |
| --------------------------------------- | ------------------------------------ |
| Declared and used in `args`             | No error                             |
| `{sigil:var:X}` in `server`, no `vars:` | Error naming `X` and the artifact id |
| `vars.X` declared, no token in `server` | Error naming `X`                     |
| Both a used and an unused declaration   | One error, for the unused one        |
| `vars.X` without `title`                | Schema error                         |
| `vars.X` with an unknown key            | Schema error                         |
| `vars` key `1X`                         | Schema error                         |
| A non-`mcp` artifact                    | Check doesn't run                    |
| The real catalog                        | `npm run validate` passes            |

Test: `npm run build && npm run build:test && node --test test-compiled/validate/var-checks.test.js && npm run validate`.

## Step 3: `scaffoldConfigOps` `[worker:medium]`

New `src/config-ops.ts` and `test/config-ops.test.ts`. No caller changes yet.

```ts
export async function scaffoldConfigOps(
  target: Target,
  id: string,
  resolved: ResolvedCatalog,
  options: Parameters<NonNullable<Target['scaffoldConfig']>>[2],
  vars: VarValues,
): Promise<ConfigMergeOp[]>;
```

With no `vars:` on the artifact it delegates unchanged, passing the same `resolved`. Otherwise it throws `SigilError` naming the missing
vars, or builds `{ ...resolved, byId: new Map(resolved.byId).set(id, withLiteralServer) }` and delegates, never mutating the input
(`requireValidCatalog` hands out clones, but a test artifact may be shared). Afterwards it throws if `JSON.stringify` of any op contains
`{sigil:var:`.

Check first that all six `scaffoldConfig` paths read the artifact through `byId`. If one reads `resolved.artifacts`, replace it in that
array too.

| Case                                                                         | Expected                                                    |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Fixture with `{sigil:var:ORG}` in `args`, each of six targets, project scope | The op holds `contoso` and no `{sigil:`                     |
| Codex fixture                                                                | The TOML-bound fragment's `args` hold `contoso`             |
| Fixture with `env: { T: '{sigil:env:T}' }` and a var                         | The var is literal; the env token takes the target's syntax |
| Missing var                                                                  | Rejects with `SigilError` naming it                         |
| No `vars:`                                                                   | Deep-equals `target.scaffoldConfig(...)`                    |
| Input `resolved` after a call                                                | The artifact still holds `{sigil:var:ORG}`                  |
| A fake target returning an op that still holds a token                       | Rejects with `SigilError`                                   |

Test: `npm run build && npm run build:test && node --test test-compiled/config-ops.test.js`.

## Step 4: Manifest records the values `[worker:medium]`

`src/manifest/types.ts`, `src/manifest/mutate-config.ts`, `src/manifest/config-fragments.ts`, and `test/manifest.test.ts`.

- `ManifestEntry.vars?: Record<string, string>`, with a comment: names and values of install variables, re-checked on read because the
  manifest is editable.
- `UpsertConfigEntryOptions.vars?`. When omitted, an existing entry's record stays. A new or refreshed entry with an empty record has no
  key, so manifests without vars stay byte-identical. No `MANIFEST_VERSION` change: the field is optional.
- `recordedVars(manifest, id, targetName): VarValues`: `usableVars` of the entry for this id and target, over `usableVars` of any other
  target's entry for this id. Export it through `src/manifest/index.ts`.

| Case                                           | Expected                                |
| ---------------------------------------------- | --------------------------------------- |
| Upsert a new entry with `vars`                 | Entry holds them                        |
| Upsert a new entry without `vars`              | No `vars` key                           |
| Re-upsert with no `vars` option                | Earlier record stays                    |
| Re-upsert with new `vars`                      | Replaced                                |
| `recordedVars`, own entry and another target's | Own value wins; the other fills the gap |
| `recordedVars`, a recorded `-x`                | Left out                                |
| `recordedVars`, nothing recorded               | `{}`                                    |
| Save then load                                 | `vars` round-trips                      |

Test: `npm run build && npm run build:test && node --test test-compiled/manifest.test.js`.

## Step 5: Freshness and update read recorded values `[worker:medium]`

`src/freshness.ts`, `src/commands/update-groups.ts`, `src/commands/update.ts` (the `vars` option only), and
`test/commands/update-vars.test.ts`. Use a fixture catalog with `vars:`, as `test/commands/` already does for `--catalog-dir`.

- `catalogConfigOps` gains a `vars: VarValues` parameter and calls `scaffoldConfigOps`. Keep its per-scope `.catch`.
- `checkConfigEntry`: compute `missingVars(artifact, usableVars(entry.vars))` first. If any is missing, return `{ stale: true, unmovable: [] }`.
- `UpdateOptions.vars?: VarValues` and, in `updateConfigOutcome`, `values = { ...usableVars(entry.vars), ...opts.vars }`. With a missing
  var, pass `freshOps = []` and `skipReason` `needs NAME; re-run with --var NAME=<value>`, joined with `, ` for several.
- When `wrote && !opts.dryRun`, set `entry.vars` to the artifact's declared names from `values`, leaving the key off if empty.

| Case                                                             | Expected                                                        |
| ---------------------------------------------------------------- | --------------------------------------------------------------- |
| Installed with `contoso`, catalog arg changed, `update`          | File has the new arg and still `contoso`; `vars` kept           |
| Installed with `contoso`, nothing changed, `update`              | No write, no `✓` line, same result as today                     |
| Fragment deleted by hand, `update`                               | Restored with `contoso`, no `--force`                           |
| Entry recorded before vars, catalog now declares one, no `--var` | `⊘`, `kept as installed: needs ADO_ORG`, file untouched, exit 0 |
| Same entry through `staleEntries`                                | Reported stale                                                  |
| Same entry, `vars: { ADO_ORG: 'contoso' }` option                | Old `env` gone, value written, `vars` recorded                  |
| `vars` option changes `contoso` to `fabrikam`                    | Replaced, not stacked                                           |
| Same, `dryRun: true`                                             | File and manifest unchanged                                     |
| Recorded `-x` in a hand-edited manifest                          | Treated as missing, file untouched                              |

Test: `npm run build && npm run build:test && node --test test-compiled/commands/update-vars.test.js`, then the existing update test files
(`test-compiled/commands/update*.test.js`).

## Step 6: `update --var` `[worker:medium]`

`src/cli.ts`, `src/commands/update.ts`, `test/commands/update-vars.test.ts`.

Add a repeatable `--var <NAME=value>` to `update`: an accumulating parser (`(v, acc) => [...acc, v]`, default `[]`), not Commander's variadic
form, which would swallow `[ids...]`. In `runUpdate`,
`parseVarFlags` it, then throw `SigilError` for a name no selected entry's artifact declares. Pass the parsed record through
`UpdateOptions.vars`. Keep `src/cli.ts`'s lazy imports: `parseVarFlags` is called from the command module.

| Case                                                 | Expected                                |
| ---------------------------------------------------- | --------------------------------------- |
| `update --var ADO_ORG=contoso` through the built CLI | Written, exit 0                         |
| `update shared/fixture --var A=x --var B=y`          | Id kept as a selector; both applied     |
| `update --var TYPO=x`                                | Exit 1, names `TYPO`, nothing written   |
| `update --var ADO_ORG=-x`                            | Exit 1, the value rule, nothing written |

Test: the `update-vars` test file from step 5.

## Step 7: `add` resolves the values `[worker:medium]`

New `src/commands/add/resolve-vars.ts`, `test/commands/add-resolve-vars.test.ts`. No caller yet.

```ts
export async function resolveAddVars(input: {
  artifacts: readonly ResolvedArtifact[]; // the config ids to write
  flags: VarValues;
  recorded: (id: string) => VarValues;
  dryRun: boolean;
  yes: boolean;
  interactive: boolean; // isInteractiveTTY() from the caller
  ask: (spec: { name: string; title: string; description: string }) => Promise<string | symbol>;
}): Promise<VarValues | 'cancelled'>;
```

Order as in "Decided". A flag naming no selected artifact's var throws. Two artifacts sharing a name share one prompt. The result holds
a value for every declared name, or `<NAME>` under `dryRun`. A cancelled `ask` (`isCancel`) returns `'cancelled'`. Export a default `ask`
built on `text` from `src/wizard/prompts.ts`, with `message` from `title`, `placeholder` from `description`, and `validate` returning
`VAR_VALUE_RULE` when `isVarValue` fails.

| Case                              | Expected                                                                       |
| --------------------------------- | ------------------------------------------------------------------------------ |
| Flag given                        | Used; `ask` not called                                                         |
| Flag and recorded differ          | Flag wins                                                                      |
| Recorded only                     | Used; `ask` not called                                                         |
| Nothing, interactive              | `ask` called once, answer used                                                 |
| Nothing, `yes: true`, interactive | Throws `SigilError` whose hint holds `--var ADO_ORG=<value>`; `ask` not called |
| Nothing, not interactive          | Same                                                                           |
| Nothing, `dryRun`, interactive    | `<ADO_ORG>`; `ask` not called                                                  |
| Two artifacts, same name          | `ask` called once                                                              |
| `ask` cancelled                   | `'cancelled'`                                                                  |
| Flag naming nothing selected      | Throws, naming it                                                              |
| Artifacts with no `vars:`         | `{}`; `ask` not called                                                         |

Test: `npm run build && npm run build:test && node --test test-compiled/commands/add-resolve-vars.test.js`.

## Step 8: `add` plans with the values `[worker:medium]`

`src/cli.ts`, `src/commands/add/index.ts`, `src/commands/add/plan.ts`, `src/commands/add/plan-ids.ts`, `test/commands/add-vars.test.ts`. This
is one more file than usual because each change is a line or two around one value.

- `--var` on `add`, the same accumulating option as step 6. `AddOpts.vars: string[]`.
- `buildAddPlan`, between `resolveAndPartitionIds` and `runScaffoldPhase`: `parseVarFlags`, then `resolveAddVars` over the `mcp` artifacts in
  `configIds`. `'cancelled'` returns `null`, as a cancelled wizard does. `AddPlan.vars: VarValues`.
- Parse the flags early enough that a malformed one fails before any skip line prints.
- `plan-ids.ts`: `installedAtScope` calls `scaffoldConfigOps` with the flags over `recordedVars`, and returns `false` on a missing var.
  `upToDateAtScope` also drops an id whose flag value differs from the recorded one.

| Case                                             | Expected                                           |
| ------------------------------------------------ | -------------------------------------------------- |
| `add` fixture var artifact, `--yes`, no flag     | Exit 1 with the `--var` hint; no file, no manifest |
| Same with `--var A=contoso` and a dry run        | Preview only, no prompt                            |
| Installed with `contoso`, `add` again, no flag   | `already up to date`, no prompt                    |
| Installed with `contoso`, `add --var A=fabrikam` | Id stays in `configIds`                            |
| Installed with `contoso`, `add --var A=contoso`  | `already up to date`                               |
| `add --var TYPO=x`                               | Exit 1, names `TYPO`                               |
| A catalog with no vars                           | Plan as today, `vars` `{}`                         |

Test: `npm run build && npm run build:test && node --test test-compiled/commands/add-vars.test.js`, then `test-compiled/commands/add*.test.js`.

## Step 9: `add` writes and records the values `[worker:medium]`

`src/commands/add/execute-config.ts`, `src/commands/add/render.ts`, `test/commands/add-vars.test.ts`.

- `scaffoldAndApplyConfig` calls `scaffoldConfigOps(target, id, resolved, plan.scaffoldOpts, plan.vars)`, and `recordConfigEntry` passes only
  the artifact's declared names as `vars`.
- `printConfigMergePreview` uses it too. Its `.catch` stays.

| Case                                                        | Expected                                                        |
| ----------------------------------------------------------- | --------------------------------------------------------------- |
| `add` with `--var A=contoso`, each of six targets           | The file holds `contoso`, no `{sigil:`; the manifest records it |
| Second artifact without vars in one `add`                   | No `vars` key on it                                             |
| `add --target copilot` after `add --target claude`, no flag | No prompt; the same value                                       |
| `add --var A=fabrikam` over `contoso`                       | Replaced, one server entry                                      |
| Dry run                                                     | Lists the merge; writes nothing                                 |
| `uninstall`                                                 | Removes the fragment and the entry's `vars`                     |

Test: the `add-vars` test file from step 8.

## Step 10: The Claude plugin writes `userConfig` `[worker:medium]`

`src/targets/claude-code/plugin-config.ts`, `src/targets/claude-code/plugin-assemble.ts`, `test/targets/plugin-config.test.ts`.

- `configFileContent`: for an `mcp` artifact, `substituteVars` the server first with `name => '${user_config.' + name + '}'`, on a copy
  passed to `portableMcpServer`.
- `buildPluginJson` gains an optional `userConfig` on its options, written last in the manifest when present. `buildOneConfigPlugin` builds it
  from `frontmatter.vars`: `{ NAME: { type: 'string', title, description, required: true } }`. Pack plugins pass none.
- `configDescription` stays: it lists env tokens only, and the prompt covers vars.

| Case                                   | Expected                                      |
| -------------------------------------- | --------------------------------------------- |
| Fixture var server, `.mcp.json`        | `args` hold `${user_config.ORG}`              |
| Same, `plugin.json`                    | `userConfig.ORG` deep-equals the object above |
| Server with no `vars:`                 | No `userConfig` key; bytes as before          |
| Pack plugin                            | No `userConfig` key                           |
| `{sigil:` in any generated plugin file | None                                          |

Test: `npm run build && npm run build:test && node --test test-compiled/targets/plugin-config.test.js`.

## Step 11: Move env-token tests to fixtures `[worker:medium]`

`test/targets/mcp-env.test.ts`, `test/targets/antigravity-mcp.test.ts`, `test/targets/codex-mcp.test.ts`, `test/targets/cursor-mcp.test.ts`,
`test/targets/plugin-config.test.ts`. Split into two commits if the worker's diff is hard to review.

After step 12 no catalog server uses `{sigil:env:}`, but the token stays supported. Each test that reads the real `shared/ado` for its env
behavior, or for Codex's and Antigravity's skip, moves to an inline fixture carrying today's `args` and `env`, with its assertion unchanged.
Tests that only need any MCP artifact (`test/wizard/add.test.ts`, `test/commands/status-next-steps.test.ts`, `test/errors.test.ts`) stay.

No assertion is weakened, and the catalog doesn't change, so all five files pass before and after.

Test: the five `test-compiled/targets/*.test.js` files by name.

## Step 12: Move `shared/ado` `[worker:medium]`

`catalog/shared/mcps/ado.mcp.md`, `test/fixtures/portable-mcp-golden.json`, `test/fixtures/output-snapshot/build.json`, and any file
`node dist-cli/cli.js sync --check` or `npm run build` asks for. Don't change `{sigil:env:}` code.

```yaml
vars:
  ADO_ORG:
    title: 'Azure DevOps organization'
    description: 'The <org> in dev.azure.com/<org>'
server:
  command: 'npx'
  args:
    - '-y'
    - '@azure-devops/mcp@2.10.0'
    - '{sigil:var:ADO_ORG}'
    - '--authentication'
    - 'azcli'
    - '-d'
    - 'core'
    - 'work'
    - 'work-items'
```

Remove `env:` and the `platforms:` line, keeping the commented `platforms` hint. Rewrite the `details` slot: sigil asks for the organization
at install or takes `--var ADO_ORG=<org>`; the server authenticates through the Azure CLI, so `az` on `PATH` and `az login` come first; a plugin
install asks on enable.

Add to `test/targets/` a new `ado-mcp.test.ts`:

| Case                                                    | Expected                                                              |
| ------------------------------------------------------- | --------------------------------------------------------------------- |
| Each of six targets, `scaffoldConfigOps` with `contoso` | `args` or array `command` hold the pinned package, `contoso`, `azcli` |
| Each target's `configSkipReason`                        | `undefined`                                                           |
| No `env`, `environment` or `env_vars` key               | Absent on all six                                                     |
| No `PERSONAL` or `pat` in any fragment                  | None                                                                  |
| OpenCode, project                                       | `.opencode/opencode.json`, `command` an array, `type: 'local'`        |
| A real `sigil build` of every target                    | No output file contains `{sigil:var:`                                 |

Test: `npm run build && npm run validate && npm run catalog:build && npm run build:test && node --test test-compiled/targets/ado-mcp.test.js`.

## Step 13: Docs `[inline: user-facing copy]`

`docs/reference/config-kinds.md` (the concept, the value rule, the resolution order, and the "as `shared/ado` does" sentence at line 93),
`docs/reference/spec.md` (`vars:` and the token), `docs/guides/consuming.md:544-545`, `docs/setup/{cursor,codex,opencode}.md`, `docs/reference/artifacts.md`
if its row changes, `.claude/rules/repo-vocabulary.md` plus its one line in `CLAUDE.md` (an install variable is literal, declared, and never a
secret), `CHANGELOG.md` (Added and a Breaking line), and `README.md` if it lists `add` flags. Include the three known limits.
`catalog/languages/csharp/rules/cs-security.rule.md:29` only uses the variable's name as an example, so it stays.

Test: `npm run format:check`, `npm run check-doc-comments`, and `node dist-cli/cli.js sync --check`.

## Step 14: Live check `[inline: live runs against real tools]`

In a scratch project, run the built CLI for all six targets with `--var ADO_ORG=contoso`, then read each written file. Start the rendered
command once and send an MCP `initialize` and `tools/list` over stdin, with no `az` on this machine, and record what the server does.
Run `npm run probe:opencode -- --v2 <path>`, with the V2 binary under `~/.cache/sigil-opencode-v2/`, to confirm that nothing regressed, and kill any stray `opencode serve` afterwards.

Add the results to the `shared/ado` notes in `docs/reference/config-kinds.md`. Leave a real `az login` tool call marked as unproven for the owner to
run with their org. That org never goes in this repo.

Test: each of the six files parses and holds `contoso`, and the probe exits 0.
