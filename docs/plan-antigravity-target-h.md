# Plan: Antigravity target, Phase H (neutral hook contract)

Phase H of [plan-antigravity-target.md](plan-antigravity-target.md). It fixes V1 and V2 of
[target-neutrality-regression-2026-11.md](decisions/target-neutrality-regression-2026-11.md) for every hook target,
ahead of Phase E (Antigravity hooks). Evidence: the Antigravity ADR's neutrality table and D5/P4
([antigravity-target-2026-11.md](decisions/antigravity-target-2026-11.md)), the Copilot hooks ADR
([copilot-hooks-2026-10.md](decisions/copilot-hooks-2026-10.md)), Codex A4 and Cursor A4. The phase follows
[Rules for every target](reference/architecture.md#rules-for-every-target). Branch `feat/neutral-hooks-h`, one PR.

**Owner sign-off.** The roadmap gates this phase on the owner approving the contract. Approving this plan is that
sign-off: decisions 1-6 are the contract.

## What is wrong today

- `event` and `matcher` are Claude Code's names in the zod schema (`HOOK_EVENTS`, "Claude Code `matcher` field") and in
  all three catalog hooks (`Edit|Write`, `Bash`, `Edit|Write|MultiEdit|NotebookEdit`). Claude, Copilot and Codex copy
  the matcher through; only Cursor translates it, with its own table (`src/targets/cursor/hook-ops.ts`).
- The hook scripts read Claude's stdin (`tool_input.file_path`, `tool_name`, `agent_type`). `protect-config` also
  parses Copilot's raw `apply_patch` string and Codex's `tool_input.command` patch: three provider contracts in one
  catalog file. Antigravity sends `toolCall.name` / `toolCall.args.Path` (P4), which none of them reads.

## Decisions

1. **Neutral events**, kebab-case like the rest of the neutral vocabulary, one table per target:

   | Neutral         | Claude             | Copilot (PascalCase alias) | Codex              | Cursor               |
   | --------------- | ------------------ | -------------------------- | ------------------ | -------------------- |
   | `before-tool`   | `PreToolUse`       | `PreToolUse`               | `PreToolUse`       | `preToolUse`         |
   | `after-tool`    | `PostToolUse`      | `PostToolUse`              | `PostToolUse`      | `postToolUse`        |
   | `prompt-submit` | `UserPromptSubmit` | `UserPromptSubmit`         | `UserPromptSubmit` | `beforeSubmitPrompt` |
   | `session-start` | `SessionStart`     | `SessionStart`             | `SessionStart`     | `sessionStart`       |
   | `stop`          | `Stop`             | `Stop`                     | `Stop`             | `stop`               |
   | `subagent-stop` | `SubagentStop`     | `SubagentStop`             | `SubagentStop`     | `subagentStop`       |
   | `notification`  | `Notification`     | refused (today's reason)   | refused            | refused              |

   Step 1 amendment: the Copilot reference now documents a VS Code compatible (snake_case) input for `Stop` and
   `SubagentStop` (`agentStop / Stop`, `subagentStop / SubagentStop`), so the refusal's premise ("no documented
   PascalCase alias") no longer holds for them. `Notification` still has only one mixed-case payload and stays refused.

   The seven PascalCase names stay accepted as **legacy aliases** (`LEGACY_HOOK_EVENT_ALIASES`, neutral data like
   `LEGACY_TOOL_ALIASES`), so an overlay catalog keeps loading; `legacy-tool-name` fails `sync --check` on one in
   catalog source and `--apply` rewrites it. Cursor's extra keys (`SessionEnd`, `PreCompact`, `SubagentStart`) are not
   in the schema and are dropped from its table. This supersedes Decision 2 of the Copilot hooks ADR ("keep `event` as
   authored").

2. **Neutral matchers:** `*` (every tool), or neutral tool names joined with `|` (`edit`, `shell|edit`). Legacy aliases
   (`Edit`, `Bash`, …) are accepted and flagged like events. Anything else (a regex, `mcp__.*`, an unknown name) is a
   schema error: no catalog hook needs MCP matching, and a provider pattern can't mean the same thing on four targets.
   Each target renders the matcher through its own **hook tool table**, a `names` `ToolDialect` named
   `<P>_HOOK_TOOL_DIALECT`, separate from its agent dialect: Cursor's agent dialect is a read-only flag, and
   Antigravity's hook calls report `write_file` where its agents take `write_to_file` (P4, D1). Starting tables (step 1
   confirms each name against the provider's hooks docs and the probe records):

   | Neutral  | Claude                          | Copilot (PascalCase)    | Codex           | Cursor                  |
   | -------- | ------------------------------- | ----------------------- | --------------- | ----------------------- |
   | `read`   | `Read`                          | `Read`                  | none            | `Read`                  |
   | `search` | `Grep`, `Glob`                  | `Grep`, `Glob`          | none            | `Grep`                  |
   | `edit`   | `Edit`, `Write`, `NotebookEdit` | `Edit`, `Write`         | `Edit`, `Write` | `Write`, `Delete`       |
   | `shell`  | `Bash`, `PowerShell`            | `Bash`                  | `Bash`          | `Shell`                 |
   | `web`    | `WebFetch`, `WebSearch`         | `WebFetch`, `WebSearch` | none            | `WebFetch`, `WebSearch` |
   | `agent`  | `Agent`                         | `Agent`                 | `Agent`         | `Task`                  |
   | `todo`   | `TodoWrite`                     | `TodoWrite`             | `update_plan`   | none                    |

   Step 1 amendment (sources in the ADR): Copilot's "Claude tool name" table maps every runtime tool (`view` → `Read`,
   `grep`/`rg` → `Grep`, `glob` → `Glob`, `web_fetch`/`web_search`, `task` → `Agent`, `update_todo` → `TodoWrite`;
   `powershell` → `Bash`). Claude's tools reference lists `PowerShell` as its own tool and no `MultiEdit`. Codex's tool
   coverage table: `spawn_agent` also matches `Agent`, `update_plan` is a matchable local function tool, `WebSearch`
   is hosted and never reaches a hook, and there is no read or search tool. Cursor's hooks page lists `Delete` among
   the `preToolUse` matchers; it changes a file, so it is `edit`.

   A matcher naming a tool the target's table has no entry for is **refused with its reason** (Cursor's skip-reason
   path, Copilot's and Codex's `SigilError`), never rendered narrower: a guard that matches fewer calls than authored
   looks active and lets the rest through. `*` writes `*` (Cursor: no `matcher` key, as today). Claude's `edit` gains
   `NotebookEdit`, so `protect-config` and `worker-mode-guard` both match notebook writes on Claude.

3. **The input contract (v1).** A hook that reads its input is authored as `script:`, the body of a Node.js function
   that sigil calls with one argument, `input`:

   ```ts
   interface HookInput {
     event: HookEvent; // the neutral event that fired
     tool?: NeutralTool; // tool events only; undefined when the provider's tool has no neutral name
     files: string[]; // every path the call names: path fields, then patch headers; deduped, as sent
     command?: string; // the shell command, only when tool is 'shell'
     agent?: string; // the subagent type, when the provider reports one
     cwd?: string;
   }
   ```

   `input` is `undefined` when stdin is not JSON or not an object; the script decides whether that fails open. The
   script **denies by setting `process.exitCode = 2` and writing the reason to stderr**: every hook target denies on
   exit 2 (Claude; Copilot ADR "Blocking"; Codex A4; Cursor A4; Antigravity P4, against its plugins page, so Phase E's
   regression test keeps checking it). A stdout decision object is a provider contract and is not part of v1.
   `command` / `args` stay for hooks that read no input (a `session-start` notice, say); they get the provider's raw
   stdin, and the step 10 rule fails `sync --check` when one names a provider input field. Exactly one of `script` and
   `command` is set; `args` needs `command`.

   This amends the roadmap's "identity for Claude, Copilot, Codex and Cursor". Those four send Claude-like JSON, but
   the tool names differ (`Edit`, `apply_patch`, `Shell`), and so do the patch carriers. Identity would leave that
   knowledge in catalog scripts, so every target gets a mapping, and the four differ only in data.

4. **One normalizer, one `HookInputDialect` per target** (`src/targets/hook-input.ts`, the `McpDialect` pattern: a new
   target supplies a value, never its own builder):

   ```ts
   interface HookInputDialect {
     readonly toolField: string; // dotted path to the provider tool name: 'tool_name' | 'toolCall.name'
     readonly inputField: string; // dotted path to the tool arguments: 'tool_input' | 'toolCall.args'
     readonly pathFields: readonly string[]; // keys inside the arguments holding one path
     readonly commandField?: string; // key inside the arguments holding the shell command
     readonly patch?: { readonly tools: readonly string[]; readonly field?: string };
     //  ^ provider tools whose arguments carry patch text: in `field`, or the arguments themselves when a string
     readonly agentField?: string; // dotted path to the subagent type
     readonly cwdField?: string;
     readonly toolNames: Readonly<Record<string, NeutralTool>>; // provider tool name → neutral tool
   }
   ```

   `toolNames` is the inverted hook tool table plus the names a provider reports that no matcher writes (Codex
   `apply_patch` → `edit`, `spawn_agent` → `agent`; Copilot `Task` → `agent`). The normalizer `normalizeHookInput(raw, dialect, event)` is one
   self-contained function (no imports, no closure), embedded in the installed script with
   `Function.prototype.toString`, so the unit-tested function is the shipped one. Patch headers are parsed with
   `protect-config`'s current regex (`*** Add File:`, `Update File:`, `Delete File:`, `Move to:`). Antigravity's dialect
   (`toolCall.name`, `toolCall.args`, `Path`/`TargetFile`, `CommandLine`) ships in Phase E.

5. **Script rendering:** the installed command is `node -e <composed>`, where `composed` is the normalizer source, the
   dialect and neutral event as JSON literals, a stdin reader, and `(function (input) { <script> })(normalized)`.
   Claude and Copilot write it in exec form (`command: node`, `args: ['-e', composed]` / `exec` + `args`); Codex and
   Cursor through `nodeEvalCommandLine` (base64, so no shell quoting). Every installed hook's command changes, so
   `sigil status` shows them outdated and `sigil update` replaces them (`replaceMerge`); the CHANGELOG says so.

6. **Scope:** Claude, Copilot, Codex and Cursor, scaffold and the Claude plugin (`hookFragment` is shared). No
   Antigravity hook rendering (Phase E). Hook kind support rows don't change.

## Step 1 `[inline: judgment, confirming tables against official docs]`: settle the tables, write the ADR

Check every name in decisions 1 and 2 against the provider's hooks reference (Claude
`code.claude.com/docs/en/hooks`, Copilot hooks docs, Codex hooks docs, Cursor hooks and third-party-hooks docs), the
doc refs already in `src/targets/*/doc-refs.ts`, and the probe rows (Copilot ADR, Codex A4, Cursor A4/Phase C run 1).
Codex's shell tool name and Copilot's PascalCase `Read` are the two least certain; a name no source supports becomes
"none". Amend decisions 1 and 2 here with what changed.

Write `docs/decisions/neutral-hook-contract-2026-11.md`: status accepted, context (V1, V2), decisions 1-6 as amended,
the per-target evidence column, and consequences (installed hooks outdated once; overlay catalogs with regex matchers
fail validation). Add one line under Decision 2 of `copilot-hooks-2026-10.md`: "Superseded by
neutral-hook-contract-2026-11.md".

Test: `npx prettier --check docs/decisions/neutral-hook-contract-2026-11.md docs/decisions/copilot-hooks-2026-10.md docs/plan-antigravity-target-h.md`.

## Step 2 `[worker:medium]`: neutral hook vocabulary

Files: new `src/hook-vocabulary.ts`, new `test/hook-vocabulary.test.ts`.

Platform-neutral module (names no target), modelled on `src/tool-vocabulary.ts`:

- `HOOK_EVENTS = ['before-tool', 'after-tool', 'prompt-submit', 'session-start', 'stop', 'subagent-stop',
'notification'] as const`, `type HookEvent`, `TOOL_HOOK_EVENTS: readonly HookEvent[] = ['before-tool', 'after-tool']`.
- `LEGACY_HOOK_EVENT_ALIASES: Readonly<Record<string, HookEvent>>` (frozen): `PreToolUse`, `PostToolUse`,
  `UserPromptSubmit`, `SessionStart`, `Stop`, `SubagentStop`, `Notification`, in that order.
- `normalizeHookEvent(name: string): { event: HookEvent; legacy: boolean } | undefined` (own keys only, like
  `legacyAliasOf`).
- `parseHookMatcher(matcher: string | undefined): { kind: 'all' } | { kind: 'tools'; tools: NeutralTool[]; legacy:
string[]; unknown: string[] }`: `undefined`, `''` and `'*'` are `all`; otherwise split on `|`, trim each part, and
  run `normalizeTools`.

| Case                                             | Expected                                                  |
| ------------------------------------------------ | --------------------------------------------------------- |
| `normalizeHookEvent('before-tool')`              | `{ event: 'before-tool', legacy: false }`                 |
| `normalizeHookEvent('PreToolUse')`               | `{ event: 'before-tool', legacy: true }`                  |
| `normalizeHookEvent('preToolUse')`, `'toString'` | `undefined`                                               |
| Every legacy alias                               | Maps to the decision 1 row                                |
| `parseHookMatcher(undefined)`, `'*'`, `''`       | `{ kind: 'all' }`                                         |
| `parseHookMatcher('edit')`                       | tools `['edit']`, no legacy, no unknown                   |
| `parseHookMatcher('Edit\|Write\|MultiEdit')`     | tools `['edit']`, legacy `['Edit', 'Write', 'MultiEdit']` |
| `parseHookMatcher('shell \| edit')`              | tools `['shell', 'edit']`                                 |
| `parseHookMatcher('mcp__.*')`                    | unknown `['mcp__.*']`                                     |

Test: `npm test -- test/hook-vocabulary.test.ts`, then `npm test`.

## Step 3 `[worker:medium]`: the hook schema

Files: `src/schema/index.ts`, regenerated `schema/*.schema.json` (`npm run build`), `test/schema/hook.test.ts` (new).

- `event: z.enum([...HOOK_EVENTS, ...Object.keys(LEGACY_HOOK_EVENT_ALIASES)])`; drop the local `HOOK_EVENTS`. Doc
  comment: "The neutral lifecycle event (src/hook-vocabulary.ts); each hook target maps it. The PascalCase names are
  legacy aliases."
- `matcher`: optional, default `'*'`, with a field-level `superRefine` that adds an issue when
  `parseHookMatcher(value)` has `unknown` entries: "`<name>` is not a neutral tool name: a matcher is `*` or neutral
  tools (read, search, edit, shell, web, agent, todo) joined with |". Doc comment: neutral, mapped per target.
- New `script: z.string().min(1).optional()` with decision 3's contract in its doc comment; `command` becomes optional.
  Object-level `superRefine`: exactly one of `script` and `command` (message names both fields); `args` without
  `command` is an error. If `src/schema/emit.ts` cannot emit the object-level refinement, put that check in
  `src/validate/schema-checks.ts` (`checkSchema`) instead, and say so in the summary.
- Update the `defaultScope` / `command` doc comments that say "Claude Code" to neutral wording.

| Case                                                   | Expected                          |
| ------------------------------------------------------ | --------------------------------- |
| `event: before-tool`, `matcher: edit`, `script: '…'`   | Parses                            |
| `event: PreToolUse`, `matcher: Edit\|Write`, `command` | Parses (legacy)                   |
| `matcher: 'mcp__.*'`                                   | Fails, message names it           |
| `matcher` absent                                       | Parses, `'*'`                     |
| Both `script` and `command`                            | Fails                             |
| Neither                                                | Fails                             |
| `script` with `args`                                   | Fails                             |
| `event: 'preToolUse'`                                  | Fails                             |
| Every current catalog hook                             | Still parses (`npm run validate`) |

Test: `npm test -- test/schema/hook.test.ts`, `npm run validate`, then `npm test`.

## Step 4 `[worker:medium]`: input normalizer and script composer

Files: new `src/targets/hook-input.ts`, new `test/targets/hook-input.test.ts`.

- `HookInputDialect` exactly as decision 4.
- `normalizeHookInput(raw: string, dialect: HookInputDialect, event: HookEvent): HookInput | undefined`, self-contained
  (no imports, no reference to anything outside its body, including helper functions: define them inside). Steps:
  parse JSON (non-object → `undefined`); read the tool name at `toolField` and map it through `toolNames`; read the
  arguments at `inputField`; `files` = each `pathFields` value that is a non-empty string, then the patch headers when
  the provider tool is in `patch.tools` (text in `patch.field` of the arguments, or the arguments themselves when a
  string), deduped in order; `command` from `commandField` only when the tool is `shell`; `agent` / `cwd` from their
  paths when strings. `HookInput` is exported as a type.
- `composeHookScript(script: string, dialect: HookInputDialect, event: HookEvent): string`: decision 5's composed
  source. Reads stdin with `process.stdin.on('data' / 'end')`, no sync read.
- Module comment: decisions 3-5 and the toString rule (the function must stay self-contained; the composed-script
  test is the guard).

Cases, with a test dialect shaped like Claude's (`tool_name`, `tool_input`, `file_path`/`path`/`notebook_path`,
`command`, patch tools `['apply_patch']` with field `command`, `agent_type`, `cwd`) and one like Antigravity's
(`toolCall.name`, `toolCall.args`, `Path`/`TargetFile`, `CommandLine`):

| Case                                                                                                                                                   | Expected                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------- |
| `{tool_name:'Write', tool_input:{file_path:'/r/.env'}}`                                                                                                | `tool: 'edit'`, `files: ['/r/.env']`         |
| `{tool_name:'Bash', tool_input:{command:'ls'}, agent_type:'x:code-reviewer'}`                                                                          | `tool: 'shell'`, `command: 'ls'`, `agent`    |
| `apply_patch` with two `*** Update File:` headers in `command`                                                                                         | Both paths in `files`, no `command`          |
| `tool_input` a raw patch string, tool in `patch.tools`                                                                                                 | Its header paths                             |
| Unknown tool name                                                                                                                                      | `tool` undefined, `files` still read         |
| `'not json'`, `'42'`, `'null'`                                                                                                                         | `undefined`                                  |
| Antigravity-shaped `{toolCall:{name:'write_file', args:{Path:'/r/.env'}}}`                                                                             | `files: ['/r/.env']`                         |
| Composed script, spawned with `process.execPath -e`, body `if (input.files.includes('/r/.env')) { process.stderr.write('no'); process.exitCode = 2; }` | Exit 2 and `no` for `.env`; exit 0 otherwise |
| Composed script fed `'not json'`, body `if (input === undefined) process.exitCode = 3`                                                                 | Exit 3                                       |
| `normalizeHookInput.toString()` evaluated alone with `new Function`                                                                                    | Same result as the imported function         |

Test: `npm test -- test/targets/hook-input.test.ts`, then `npm test`.

## Step 5 `[worker:medium]`: matcher and event rendering helper

Files: new `src/targets/hook-render.ts`, new `test/targets/hook-render.test.ts`.

- `renderHookMatcher(dialect: ToolDialect, matcher: string | undefined): { kind: 'all' } | { kind: 'names'; matcher:
string } | { kind: 'missing'; tools: NeutralTool[] }`: `parseHookMatcher`, then `renderTools(dialect, tools)`; names
  joined with `|` in render order; any `missing` → `missing`. Throws on a `read-only-flag` dialect.
- `hookEventFor(table: ReadonlyMap<HookEvent, string>, event: string): string | undefined`: `normalizeHookEvent`, then
  the table.
- `hookCommand(fm): { kind: 'script'; script: string } | { kind: 'command'; command: string; args?: string[] }`: reads
  the frontmatter once, so no target re-reads `script` / `command`.

| Case                                                  | Expected                              |
| ----------------------------------------------------- | ------------------------------------- |
| Claude-like table, `'edit'`                           | `Edit\|Write\|NotebookEdit`           |
| `'Edit\|Write'` (legacy)                              | Same as `'edit'`                      |
| `'shell\|edit'`                                       | `Bash\|Edit\|Write\|NotebookEdit`     |
| `'*'`, `undefined`                                    | `{ kind: 'all' }`                     |
| A table with `web: undefined`, `'web'`                | `{ kind: 'missing', tools: ['web'] }` |
| `hookEventFor(table, 'PreToolUse')` / `'before-tool'` | The same target name                  |
| `hookEventFor(table, 'notification')` with no row     | `undefined`                           |

Test: `npm test -- test/targets/hook-render.test.ts`, then `npm test`.

## Step 6 `[worker:medium]`: Claude hooks on the contract

Files: `src/targets/claude-code/config-scaffold.ts`, new `src/targets/claude-code/hook-dialect.ts`,
`test/targets/claude-code.test.ts` (or the Claude hook test that covers `hookFragment`); regenerated
`test/fixtures/output-snapshot/build.json` (`npm run snapshot:update`: the Claude plugin's `hooks.json` gains
`NotebookEdit`). Steps 7-9 and 11 regenerate it the same way when their output changes.

- `hook-dialect.ts`: `CLAUDE_HOOK_TOOL_DIALECT` (decision 2's Claude column as amended), `CLAUDE_HOOK_EVENTS`
  (decision 1), `CLAUDE_HOOK_INPUT` (`tool_name`, `tool_input`, `file_path`/`path`/`notebook_path`, `command`, no
  patch, `agent_type`, `cwd`, `toolNames` = inverted table), each with its doc citation.
- `hookFragment`: event through `hookEventFor` (no row → `SigilError`), matcher through `renderHookMatcher` (`all` →
  `'*'`; `missing` → `SigilError` naming the tools), and a `script` hook as `{type: 'command', command: 'node', args:
['-e', composeHookScript(script, CLAUDE_HOOK_INPUT, event)]}`. A `command` hook is unchanged.

| Case                                                      | Expected                                                                       |
| --------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Fixture `before-tool` / `edit` / `script`                 | `PreToolUse`, matcher `Edit\|Write\|NotebookEdit`, exec form                   |
| Fixture `PreToolUse` / `Edit\|Write` / `command` + `args` | Same event and matcher, command and args unchanged                             |
| Every current catalog hook                                | Renders (event and matcher as before, `Edit\|Write` hooks gain `NotebookEdit`) |
| The rendered script spawned with a Claude `.env` write    | Exit 2                                                                         |

Test: `npm test -- test/targets/claude-code.test.ts`, then `npm test`.

## Step 7 `[worker:medium]`: Copilot hooks on the contract

Files: `src/targets/copilot/hook-ops.ts`, new `src/targets/copilot/hook-dialect.ts`, `test/targets/copilot-hooks.test.ts`.

As step 6, with decision 1's and 2's Copilot columns. `COPILOT_HOOK_INPUT`: as Claude's, plus `patch: { tools: [every
provider name the table maps to edit, plus 'apply_patch'] }` with no `field` (the raw string case). The unaliased-event
refusal keeps its message, keyed by the neutral event, now for `notification` only. Script hooks render
`exec: 'node'`, `args: ['-e', composed]`. A matcher with a missing tool throws `SigilError` with the `platforms` hint.

| Case                                                              | Expected                                             |
| ----------------------------------------------------------------- | ---------------------------------------------------- |
| `before-tool` / `edit` / `script`                                 | `PreToolUse`, matcher `Edit\|Write`, `exec` + `args` |
| `stop`, `subagent-stop`                                           | `Stop`, `SubagentStop`                               |
| `notification`                                                    | Refused, message names `notification`                |
| A table with a missing tool (test dialect), its matcher           | Refused, names the tool                              |
| Rendered script, Copilot raw `apply_patch` string touching `.env` | Exit 2                                               |
| Existing cases in the file                                        | Still pass, legacy inputs                            |

Test: `npm test -- test/targets/copilot-hooks.test.ts`, then `npm test`.

## Step 8 `[worker:medium]`: Codex hooks on the contract

Files: `src/targets/codex/hook-ops.ts`, new `src/targets/codex/hook-dialect.ts`, `test/targets/codex-hooks.test.ts`.

As step 6: `CODEX_HOOK_TOOL_DIALECT`, `CODEX_HOOK_EVENTS` (a map that replaces today's set; the refusal lists the
neutral events it maps), `CODEX_HOOK_INPUT` (`patch: { tools: ['apply_patch'], field: 'command' }`, `toolNames` adds
`apply_patch` → `edit`). Script hooks go through `nodeEvalCommandLine('node', ['-e', composed])`. A matcher with a
missing tool throws `SigilError`.

| Case                                                         | Expected                                      |
| ------------------------------------------------------------ | --------------------------------------------- |
| `before-tool` / `edit` / `script`                            | `PreToolUse`, `Edit\|Write`, base64 `node -e` |
| `notification`                                               | Refused                                       |
| `matcher: read`                                              | Refused, names `read`                         |
| Rendered command through `sh -c`, A4 `apply_patch` on `.env` | Exit 2                                        |
| Existing cases in the file                                   | Still pass                                    |

Test: `npm test -- test/targets/codex-hooks.test.ts`, then `npm test`.

## Step 9 `[worker:medium]`: Cursor hooks on the contract

Files: `src/targets/cursor/hook-ops.ts`, new `src/targets/cursor/hook-dialect.ts`, `test/targets/cursor-hooks.test.ts`.

`CURSOR_HOOK_TOOL_DIALECT` and `CURSOR_HOOK_EVENTS` replace `CURSOR_TOOL_NAMES` and the old event map;
`matcherSkipReason` uses `renderHookMatcher` (`missing` → today's reason text, naming the neutral tool);
`CURSOR_HOOK_INPUT` like Claude's without `agentField`. `powershellSkipReason` applies only to `command` hooks; a
script hook always renders through `nodeEvalCommandLine`.

| Case                                                   | Expected                             |
| ------------------------------------------------------ | ------------------------------------ |
| `before-tool` / `shell\|edit`                          | `preToolUse`, `Shell\|Write\|Delete` |
| `matcher: todo`                                        | Skip reason names `todo`             |
| `notification`                                         | Skip reason                          |
| Rendered command through `sh -c`, A4 payload on `.env` | Exit 2                               |
| Existing cases in the file                             | Still pass                           |

Test: `npm test -- test/targets/cursor-hooks.test.ts`, then `npm test`.

## Step 10 `[worker:medium]`: conformance rules

Files: `src/commands/sync/conformance/rules/legacy-tool-name.ts`, new
`src/commands/sync/conformance/rules/hook-provider-input.ts` (registered where the other rules are), and their tests.

- `legacy-tool-name`: also reports a hook's legacy `event` and the legacy names in its `matcher`, and `--apply`
  rewrites them (event to its neutral name; matcher to the deduped neutral tools joined with `|`).
- `hook-provider-input`: fails when a catalog hook's `script`, `command` or `args` contains a provider input field.
  The literals are derived from every registered `HookInputDialect` (`toolField`, `inputField`, `agentField`, their
  first path segment, `pathFields` and `commandField` when longer than 4 characters), never hand-listed, as
  `provider-term-leak` derives its literals. Detail names the literal and says to read `input` from a `script` hook.

| Case                                       | Expected                                                       |
| ------------------------------------------ | -------------------------------------------------------------- |
| Fixture hook `event: PreToolUse`           | Finding; `--apply` writes `before-tool`                        |
| Fixture `matcher: Edit\|Write\|MultiEdit`  | Finding; `--apply` writes `edit`                               |
| Fixture `script` reading `input.files`     | No finding                                                     |
| Fixture `script` reading `tool_input`      | `hook-provider-input` finding                                  |
| Fixture `command` + `args` with `toolCall` | Finding                                                        |
| The current catalog                        | Both rules fire on all three hooks (they are fixed in step 11) |

Test: `npm test -- test/commands/sync` (the rule tests), then `npm test`. `sigil sync --check` failing on the catalog is
expected until step 11; say so in the commit.

## Step 11 `[worker:high: three security-relevant scripts rewritten against a new contract; a wrong condition silently stops a guard]`: the catalog hooks

Files: `catalog/shared/hooks/protect-config.hook.md`, `reviewer-bash-guard.hook.md`, `worker-mode-guard.hook.md`.

Each moves to `event: before-tool`, a neutral matcher (`edit`, `shell`, `edit`) and `script:` holding only the logic,
reading `input`:

- `protect-config`: `if (!input) return;` then `input.files.flatMap(candidates).find(isProtected)`; `patchFiles` and
  every `tool_input` reference go. Same deny output. Body prose: "reads the files the call names (sigil's hook input)"
  instead of the `tool_input` / Copilot / Codex shapes; the "Not covered" list keeps its per-agent notes (they are
  install facts, not input shapes).
- `reviewer-bash-guard`: `input.tool !== 'shell'` and `input.agent` replace `tool_name !== 'Bash'` and `agent_type`;
  the command comes from `input.command`.
- `worker-mode-guard`: the flag-file early exit stays first; the file is `input.files[0]`; matcher `edit` (Claude
  renders `Edit|Write|NotebookEdit`; `MultiEdit` is gone from Claude Code).

Descriptions keep their meaning; replace "Edit/Write tool calls" with "file edits" and "Bash commands" with "shell
commands".

Test: `npm run validate`, `node dist-cli/cli.js sync --check` (after `npm run build`), `npm test`.

## Step 12 `[worker:medium]`: the deny regression tests and snapshots

Files: `test/catalog/protect-config-hook.test.ts`, `test/catalog/reviewer-bash-guard-hook.test.ts`, new
`test/hooks/deny-contract.test.ts`; regenerated `test/fixtures/output-snapshot/build.json` if it
still differs (`npm run snapshot:update`).

- `protect-config-hook.test.ts`: keep every path case, but install through each hook target (Claude, Copilot, Codex,
  Cursor) and feed that target's payload shape (Claude/Cursor `tool_input.file_path`, Copilot raw patch, Codex
  `apply_patch` `command`). The matcher case expects `Edit|Write|NotebookEdit` on Claude.
- `reviewer-bash-guard-hook.test.ts`: payloads unchanged; it now runs the composed script.
- `deny-contract.test.ts`: for each hook target, render `shared/protect-config` with `scaffoldConfig`, run the command
  exactly as that agent does (Claude and Copilot exec form, Codex and Cursor the command line through `sh -c`), and
  assert: a `.env` write exits 2 with the reason on stderr; `src/index.ts` exits 0; `'not json'` exits 0.

Test: `npm test`.

## Step 13 `[worker:medium]`: docs

Files: `docs/reference/config-kinds.md` (hook section), `docs/guides/authoring.md` (hook section), `docs/reference/
architecture.md` (Rules for every target: a hook target supplies a hook tool table, an event table and a
`HookInputDialect`), `src/authoring/header-builders.ts` (the `sigil new hook` template: `event: before-tool`,
`matcher: "*"   # neutral tools joined with |`, a `script:` example reading `input`), `CHANGELOG.md`, `CLAUDE.md`.

- `CLAUDE.md`: one invariant bullet after the tool-vocabulary one: "Hook events and matchers are neutral
  (`src/hook-vocabulary.ts`); a hook that reads its input is a `script:` and gets `input`, built by the target's
  `HookInputDialect` (`src/targets/hook-input.ts`). Never read a provider's stdin field in catalog source;
  `hook-provider-input` fails `--check`."
- `CHANGELOG.md` (Unreleased): neutral hook events and matchers, `script:`, every installed hook outdated once (run
  `sigil update`), regex matchers no longer accepted.
- Regression ADR: V1 and V2 rows `fixed, docs/plan-antigravity-target-h.md`. Roadmap: Phase H "(done <date>)" with a
  short summary, as the other phases have.

Test: `npx prettier --check` on the changed docs, `npm run check`.

## Step 14 `[inline: live check of real agents' behaviour, not mechanical]`: live deny check

In a scratch `git init` repo, for each CLI on PATH among `claude`, `copilot`, `codex` and `cursor-agent`: `sigil add
shared/protect-config --target <t>`, then ask the agent in print mode to write `.env` (`X=1`). Expected: no `.env`, and
the reason in the output. A CLI that is not installed or not signed in is listed as not checked, not passed. Record the
runs in the ADR's consequences. Then `npm run ci:local`.
