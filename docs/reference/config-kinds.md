# Config-kind writes (`mcp` / `hook` / `settings`)

> **Back to:** [README](../../README.md) · [Documentation index](../index.md)

Config kinds merge into user-owned JSON files instead of writing whole files. This is the sole
home for their merge model, provider-declared scope model, and wizard treatment.

## Hook fields

A `kind: hook` artifact (`src/schema/index.ts`, `HookSchema`) becomes one entry under the neutral
event's name in Claude Code's settings (`src/targets/claude-code/config-scaffold.ts`) and in the
Copilot hook file for its scope (scope table below). On Codex it lands in `.codex/hooks.json` or `$CODEX_HOME/hooks.json`,
and an `mcp` artifact in `config.toml` beside them ([setup](../setup/codex.md)). On Cursor it lands in
`.cursor/hooks.json` (project) or `~/.cursor/hooks.json` (user), with its events and tool names written from
the neutral vocabulary; a hook with no equivalent is skipped with its reason, and an `mcp` artifact
lands in `.cursor/mcp.json` or `~/.cursor/mcp.json` ([setup](../setup/cursor.md)). On Antigravity a hook lands in
`.agents/hooks.json` or `~/.gemini/config/hooks.json` under its own hook name, and an `mcp` artifact in
`.agents/mcp_config.json` or `~/.gemini/config/mcp_config.json` ([setup](../setup/antigravity.md)).
OpenCode takes no hook, and an `mcp` artifact lands in `.opencode/opencode.json` or the user `opencode.json`
([setup](../setup/opencode.md)).
Only the TOML writer differs: it splices sigil's tables into your text (`src/config-merge/toml-file.ts`).

| Field          | Meaning                                                                                                                                                      |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `event`        | Neutral lifecycle event (`before-tool`, `after-tool`, `prompt-submit`, `session-start`, `stop`, `subagent-stop`, `notification`); each target writes its own |
| `matcher`      | `*` for every tool, or neutral tool names joined with `\|` (`edit`, `shell\|edit`); defaults to `*`                                                          |
| `script`       | Body of a Node.js function that reads the hook's `input` (see below)                                                                                         |
| `command`      | Shell command to run or, with `args`, the executable to spawn                                                                                                |
| `args`         | Exec form: `command` is spawned with these arguments and no shell                                                                                            |
| `timeout`      | Optional timeout in **seconds** (`z.number().int().positive()`); written as `timeout`, or `timeoutSec` on Copilot                                            |
| `defaultScope` | Recommended install scope: `project` (default), `local`, or `user`. Overridable with `--scope`                                                               |
| `language`     | Optional language scope. Omit for a hook that applies to every language                                                                                      |

**Neutral events and matchers.** A catalog hook names a neutral event and a neutral matcher
(`src/hook-vocabulary.ts`). Each hook target maps both through its own hook tool table. A matcher
naming a tool the target has no entry for is refused with its reason, never rendered narrower.
The old PascalCase events and Claude's tool names still load as legacy aliases; `sigil sync --check`
reports them (`legacy-tool-name`) and `--apply` rewrites them. A regex, an `mcp__…` pattern, or an
unknown name is a schema error. An event a target has no equivalent for is refused the same way: Antigravity
has only `before-tool`, `after-tool`, `session-start` and `stop`, and no hook tool name for `todo`.

**`script:` vs `command`.** A hook that reads its input is a `script:`: the body of a Node.js
function sigil calls with one argument, `input`, holding `event`, `tool`, `files`, `command`, `agent`
and `cwd`. Deny by setting `process.exitCode = 2` and writing the reason to stderr; every hook target
blocks on exit 2. sigil installs a script as `node -e`, so `node` must be on PATH where the hook runs,
and `sigil add` warns when it is missing. `command` (with optional `args`) is for a hook that reads no
input; it gets the provider's raw stdin, and `hook-provider-input` fails `sigil sync --check` when one
names a provider's input field. Exactly one of `script` and `command` is set.

Use exec form for any hook whose exit code matters. On Windows without Git Bash, shell-form hooks
run through PowerShell, which reports exit code 2 (block) as 1 (no block).

VS Code's legacy "Local" hook parser ignores `matcher`, so a `before-tool` hook runs for every tool
there. The composed script re-checks the authored matcher against `input.tool`, so a `script` hook
keeps its meaning; a `command` hook still runs on every tool.

## Settings fields

A `kind: settings` artifact (`SettingsSchema`) merges a fragment into the target's settings JSON.
Claude Code destinations are in the scope table below.

| Field          | Meaning                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------- |
| `permissions`  | `{ allow?, deny?, ask? }` string lists. Merged with `array-union`                           |
| `env`          | String-to-string environment additions. Merged with `object-spread` (incoming wins per key) |
| `model`        | Claude model override. Merged with `object-spread`                                          |
| `statusLine`   | Passed through to `settings.json` as-is. Merged with `object-spread`                        |
| `defaultScope` | Recommended install scope: `project` (default), `local`, or `user`                          |
| `language`     | Optional language scope. Omit for global settings                                           |

## MCP fields

A `kind: mcp` artifact (`McpSchema`) merges one server entry. The server key defaults to the
artifact's `name`, under `mcpServers` on both targets: Copilot writes the portable format VS Code
recommends (`.mcp.json`, or `~/.copilot/mcp-config.json` for the user), which VS Code, its Agent
Host and Copilot CLI all read.

| Field          | Meaning                                                                                                                                                                                                                                                                                                                                                                                            |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `server`       | Either stdio (`command`, optional `args`, optional `env`) or remote (`type: http \| sse`, `url`, optional `headers`)                                                                                                                                                                                                                                                                               |
| `defaultScope` | Recommended install scope. Claude: `project` = `.mcp.json`, `local` = `~/.claude.json` per-project key, `user` = `~/.claude.json`. Copilot: `project` / `local` = `.mcp.json`; `user` = `mcp-config.json` under `$COPILOT_HOME` (default `~/.copilot`). OpenCode: `project` = `.opencode/opencode.json`; `user` = `opencode.json` under `$XDG_CONFIG_HOME/opencode` (default `~/.config/opencode`) |
| `language`     | Optional language scope. Omit for a shared server                                                                                                                                                                                                                                                                                                                                                  |

Reference an environment variable anywhere in `server` with the neutral token `{sigil:env:NAME}`
(`src/targets/env-reference.ts`). Each target writes the syntax of the file it merges into:
`${NAME}` in the portable files: Claude Code documents it for `.mcp.json`, and GitHub's
MCP JSON reference (the format Copilot CLI's MCP page points to) lists it as "Claude Code syntax"
beside `$VAR` and `${VAR:-default}`. Live check F4 (docs/audits/2026-10-06) found Copilot CLI
expands it, but VS Code Copilot Chat 1.125.1 passes `${NAME}` (and `${env:NAME}`) in `.mcp.json`
through as text; only its deprecated `.vscode/mcp.json` expands `${env:NAME}`. sigil keeps writing
the portable file, and `add` prints the target's `mcpEnvCaveat` (data on the target) for every
installed server that reads an environment variable. Copilot CLI passes a local server only `PATH` from the
environment, so a server lists every variable it reads under `env` (as `shared/ado` does).
Cursor's `.cursor/mcp.json` gets `${env:NAME}`, which Cursor documents and expands in `command`,
`args`, `env`, `url` and `headers` (measured in `args` and `env`, `docs/decisions/cursor-target-2026-11.md`
A6 and § Phase D probes), so Cursor has no `mcpEnvCaveat`. Codex forwards a variable by name
(`env_vars`) and refuses any other use of the token ([setup](../setup/codex.md)).
Antigravity's MCP files expand no reference at all, but the server inherits `agy`'s environment
(`docs/decisions/antigravity-target-2026-11.md` P5, C1). Its dialect says so with `envSyntax: 'inherited'`
(`src/targets/mcp-dialect.ts`): an identity `env` entry (`NAME: {sigil:env:NAME}`) is dropped, since the server
already sees `NAME`, `env` goes when that empties it, and any other token skips the server with its reason
([setup](../setup/antigravity.md)).
OpenCode's `opencode.json` gets `{env:NAME}`, which OpenCode replaces with the raw value when it reads the file
([Env vars](https://opencode.ai/docs/config/#env-vars)). An unset variable becomes an empty string with no error, and a value
holding `"` stops the file loading (`docs/decisions/opencode-target-2026-11.md`, Sigil MCP run), so its `mcpEnvCaveat` says so.
Never write one tool's syntax in the catalog. Pin every `npx` package to an exact
version (`@scope/pkg@1.2.3`); a test fails on a floating one.

## Merge strategies

Each config merge op names a strategy per top-level JSON key (`MergeStrategy` in `src/types.ts`,
applied by `applyMerge` in `src/config-merge/apply.ts`):

| Strategy        | Behavior                                                                             | Used for                                                  |
| --------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| `object-spread` | Deep-merge; incoming wins per leaf. Default when a key names no strategy             | Settings `env`, `model`, `statusLine`; MCP server objects |
| `array-union`   | Union with deep-equal dedup. An object-of-arrays (`permissions`) unions each sub-key | Settings `permissions.allow` / `deny` / `ask`             |
| `array-append`  | Concatenate with no dedup                                                            | Hook event arrays (`hooks`)                               |
| `file-marker`   | Set like `object-spread`; uninstall drops it only when nothing else is left          | Copilot hook files' `version`                             |

`array-union` and `array-append` are safe to re-apply (union dedupes, append only concatenates).
`object-spread` assigns leaves, so a user edit of a value sigil wrote is a real overwrite.

## Serialization: `serialize` vs `canonicalize`

Two serializers, never interchangeable:

- **`serialize(obj)`** (`src/config-merge/primitives.ts`) — **order-preserving** (`JSON.stringify`
  with no key sort). Used on the disk-write path: `src/commands/add/execute-config.ts`,
  `src/commands/update-config-io.ts`, and `src/commands/uninstall-config.ts`. Guarantees a
  backup-vs-new diff shows only the keys sigil added, with existing keys staying in their original
  positions.
- **`canonicalize(obj)`** (`src/config-merge/primitives.ts`) — **sorted** (stable key order). Used
  only for deterministic fragment hashing. `sha256` itself is `src/manifest/hash.ts`; the call
  `sha256(canonicalize(fragment))` is in `src/manifest/mutate-config.ts` (also
  `src/commands/update-config-catalog.ts` and `src/install-state-prescaffold.ts`). Never used as
  the disk writer.

## Drift and repair

`sigil status`/`sigil update` classify a live config file's relationship to sigil's recorded
fragment three ways (`classifyConfigDrift`, `src/config-merge/drift.ts`), not as a single
drifted/not-drifted boolean:

- **`intact`** — the live file still contains exactly what sigil contributed. No action.
- **`missing`** — sigil's fragment (or part of it) is entirely absent from the live file.
  Re-merging is purely additive (there is nothing of the user's to clobber), so `sigil update`
  **restores it without `--force`**.
- **`modified`** — a value sigil contributed is present but changed. Overwriting it would discard
  a real user edit, so `sigil update` requires `--force` and otherwise skips with a message
  explaining why.

`array-union`/`array-append` fragments (hooks, permission lists) always classify as `missing`
rather than `modified` when an item can't be found — both strategies are non-destructive to
re-apply, so there's no overwrite risk to gate behind a flag the way there is for `object-spread`'s
leaf assignment; restoring one appends a fresh copy alongside whatever the user has, rather than
refusing. (Rule from audit finding F14: a reinstall once undid a hook fix and the old boolean drift check could not tell a vanished fragment from an edited one — see [`docs/decisions/catalog-usage-audit-2026-08-21.md`](../decisions/catalog-usage-audit-2026-08-21.md).)

What `update` writes always comes from the bundled catalog, never from the manifest.
`.sigil/manifest.json` is committed and anyone can edit it, so its record only says which
fragment is installed where. A restore writes the catalog's current op for that file and root.
A recorded fragment the catalog has no op for is skipped with a note (re-run `sigil add`).

## Re-install and catalog changes replace, never stack

A config fragment sigil already installed is **replaced**, not merged a second time
(`replaceMerge`, `src/config-merge/replace.ts`): the recorded fragment is reversed first (only
values still exactly as sigil wrote them are removed), then the new one is merged. Two writers use
it:

- **`sigil add`** of an artifact that is already installed. Without this, a hook (`array-append`)
  was appended again on every re-install.
- **`sigil update`**, when the catalog's current fragment for a recorded destination differs from
  the recorded one. The manifest records a fragment's file and root, not the scope that chose it,
  so update renders the artifact for every scope and matches on file, root and top-level keys. The
  manifest entry is rewritten with the new fragment. An `object-spread` value the user changed
  still needs `--force`; for array fragments a user-edited copy simply stays beside the new one.

`sigil status` runs the same check, so a config entry reads `outdated` exactly when `sigil update`
would re-merge its fragment. A fragment at a file its provider retired is `outdated` while the
catalog has a replacement destination, which `update` moves it to. When the catalog has none,
`update` cannot move it: it warns and leaves the fragment, and `status` shows the entry as
`up-to-date` with a `retired, no replacement in the catalog` note (`retiredFiles` in `--json`).
`sigil uninstall <id>` removes it.

## `.sigil.bak` home-directory backup

Any write or delete to a home-scoped config file
(`ConfigRoot: 'home' | 'copilot-home' | 'codex-home' | 'opencode-home' | 'vscode-user'`
— files like `~/.claude.json`, `~/.copilot/mcp-config.json` or `~/.cursor/hooks.json`, which affect **every**
project, not just the current one) takes a pristine `.sigil.bak` copy before the first such write to a file that holds
content sigil did not write, via the shared `ensureHomeBackup()` helper (`src/config-utils.ts`); each
caller passes the fragments the manifest records for that file. A file holding only sigil's recorded
entries gets none: the helper reverses every recorded fragment, and an empty result means there is
nothing of the user's to protect. This applies uniformly across all three
config-JSON writers — `sigil add`, `sigil update`, and `sigil uninstall`
(`commands/add/execute-config.ts`, `commands/update-config-io.ts`, `commands/uninstall-config.ts`;
rule from audit finding F23: the first backup guarantee covered only `add`, so every home-directory writer must take it — see [`docs/decisions/catalog-benchmark-audit-2026-08-22.md`](../decisions/catalog-benchmark-audit-2026-08-22.md)).
The backup is written once, pristine; a
second write to the same file in the same session keeps the existing backup and just warns that
it's still there. Once the user adds content to a file sigil created, the next sigil write backs it
up — that copy includes sigil's entries too, so it is the first copy with user content, not a
pre-sigil original. Invalid JSON is always backed up. Project-scoped config files
(`.claude/settings.json`, `.mcp.json`) are protected
by git instead — no `.bak` is written for them.

On every later run, when the backup already exists, the writer keeps that pristine copy and prints
`⚠  Existing backup kept → <bak>  (compare before committing)`. The first write prints
`⚠  Backup saved → <bak>` and a reminder that the file affects every project.

## Wizard: config kinds are first-class, never language-gated

- **`Pick specific items` → specific kind (primary path):** config kinds appear as top-level kind
  entries in the kind sub-menu (MCPs · Hooks · Settings, each with counts). Selecting one opens a
  flat picker that skips language and deps steps entirely — goes straight to overwrite → scope.
- **`Pick specific items` → All types (cross-kind path):** config kinds appear under a dedicated
  `"Config — agnostic"` group at the top of the grouped picker, above all language groups, when
  they name no language. A language's own config artifact (`csharp/cs-allow-dev-tools`) sits in
  that language's group and follows the language filter like any artifact of that language.

`partitionConfigKinds()` (`src/select/grouping.ts`) is the pure helper that splits
`{ config, rest }`. Callers are `src/wizard/steps/add/cross-kind-picker.ts` and
`src/wizard/steps/add/language.ts`. `CONFIG_KINDS` is defined in `src/kinds.ts` (from
`KindDescriptor.isConfig`) and re-exported by `src/select/selection.ts`. The set is
`{ hook, settings, mcp }`.

`artifactLanguage(a)` / `isAgnostic(a)` (`src/select/selection.ts`) are the canonical accessors for
`a.frontmatter.language` — use these throughout rather than raw `frontmatter.language` casts.
`isAgnostic` returns true for every config-kind and every shared artifact (no language tag).

**Vocabulary for config kinds** — both targets declare `vocabulary` entries so `kindPlural`/
`kindNoun`/`kindHint` return readable labels (e.g. `'MCPs'` not `'Mcps'`):

- Claude: `mcp`, `hook`, `settings` vocabulary in `src/targets/claude-code/metadata.ts`.
- Copilot: `mcp` vocabulary in `src/targets/copilot/metadata.ts`.

## Provider-declared scope model (`Target.configScopes`)

Scope→path resolution is owned by each target adapter, never hardcoded in the wizard or CLI. The
`Target` interface declares:

```ts
configScopes?(kinds: ConfigKind[], projectDir: string): ConfigScopeInfo[];
```

Each `ConfigScopeInfo` (`src/types.ts`) carries:

- `value: ConfigScope` — the CLI flag value (`'local' | 'project' | 'user'`)
- `precedence: number` — docs-accurate priority rank (1 = highest), used to sort the scope menu
- `blastRadius: 'project' | 'all-projects'` — drives the blast-radius warning
- `destinations: ConfigScopeDestination[]` — one per requested config kind, each with a
  pre-resolved **absolute `fullPath`** and an optional **`section`** (the in-file JSON key-path
  where the fragment lands, e.g. `projects › /abs/proj › mcpServers`). `section` is present when
  the fragment nests below the file root — critical for Claude MCP where `local` and `user` both
  write `~/.claude.json` but at different key paths (`projects.<dir>.mcpServers` vs `mcpServers`).
  `undefined` means the fragment merges at the file root (settings, hook).

The wizard's `configScope` step (`src/wizard/steps/add/config-scope.ts`, registered on `ADD_STEPS`
in `src/wizard/steps/add/index.ts`) calls
`chosenTarget.configScopes(selectedKinds, projectDir)` and renders the result directly — no
`if (copilot)` branches. The scope menu label shows `"<scope>   (precedence N)"` and the hint shows
`fullPath  › section` (if section is present) so same-file scopes appear visibly distinct. Dedup is
on the `(fullPath, section)` pair.

### Scope tables (docs-accurate, from code.claude.com/docs/en/settings)

Claude Code (3 scopes, highest precedence first):

| Scope (precedence) | settings / hook               | mcp                                |
| ------------------ | ----------------------------- | ---------------------------------- |
| local (1)          | `.claude/settings.local.json` | `~/.claude.json` (per-project key) |
| project (2)        | `.claude/settings.json`       | `.mcp.json`                        |
| user (3)           | `~/.claude/settings.json`     | `~/.claude.json`                   |

GitHub Copilot (2 scopes — no distinct local MCP scope):

| Scope (precedence) | mcp                                                            |
| ------------------ | -------------------------------------------------------------- |
| project (1)        | `.mcp.json` (`mcpServers`)                                     |
| user (2)           | `mcp-config.json` under `$COPILOT_HOME` (default `~/.copilot`) |

These are the portable files VS Code recommends for new servers; VS Code, its Agent Host and
Copilot CLI read them ([VS Code docs](https://code.visualstudio.com/docs/copilot/reference/mcp-configuration)).
VS Code lists its own `.vscode/mcp.json` and user-profile `mcp.json` as deprecated, and Copilot CLI
never reads `.vscode/mcp.json`. `.mcp.json` is the same file Claude Code's project scope uses, so
with both targets installed one server entry serves both.

GitHub Copilot hooks (3 scopes, `src/targets/copilot/config.ts` and `target-helpers.ts`):

| Scope (precedence) | Hook file                                                                | Notes                                                    |
| ------------------ | ------------------------------------------------------------------------ | -------------------------------------------------------- |
| local (1)          | `.github/copilot/settings.local.json`                                    | hooks inline; no `version` key; not git-committed        |
| project (2)        | `.github/hooks/sigil.json`                                               | `version: 1`; git-committed                              |
| user (3)           | `$COPILOT_HOME/hooks/sigil.json` (default `~/.copilot/hooks/sigil.json`) | home-scoped: one `.sigil.bak` once it holds user content |

Cursor hooks (2 scopes, `src/targets/cursor/config.ts`):

| Scope (precedence) | Hook file              | Notes                                                    |
| ------------------ | ---------------------- | -------------------------------------------------------- |
| project (1)        | `.cursor/hooks.json`   | `version: 1`; git-committed                              |
| user (2)           | `~/.cursor/hooks.json` | home-scoped: one `.sigil.bak` once it holds user content |

Cursor has no personal per-project hook file, so `--scope local` is refused. Its events and tool names
come from the neutral vocabulary, and a hook with no Cursor equivalent is skipped with its reason,
never written to match nothing ([setup](../setup/cursor.md)).

Cursor MCP (2 scopes, `src/targets/cursor/config.ts`):

| Scope (precedence) | mcp                                 | Notes                                                    |
| ------------------ | ----------------------------------- | -------------------------------------------------------- |
| project (1)        | `.cursor/mcp.json` (`mcpServers`)   | git-committed; Cursor asks to approve a new server       |
| user (2)           | `~/.cursor/mcp.json` (`mcpServers`) | home-scoped: one `.sigil.bak` once it holds user content |

`--scope local` is refused here too. Cursor never reads `.mcp.json`, so a server installed for
`claude` or `copilot` doesn't reach it, and the two files are written and uninstalled independently.

Antigravity hooks (2 scopes, `src/targets/antigravity/config.ts`):

| Scope (precedence) | Hook file                     | Notes                                                    |
| ------------------ | ----------------------------- | -------------------------------------------------------- |
| project (1)        | `.agents/hooks.json`          | keyed by hook name, no `version`; git-committed          |
| user (2)           | `~/.gemini/config/hooks.json` | home-scoped: one `.sigil.bak` once it holds user content |

`--scope local` is refused. Each hook is one top-level key named after its id (`shared/protect-config` →
`shared-protect-config`), so your other hooks are never touched, and a hook of your own with that name is replaced.
Hooks in Antigravity's `settings.json` are not loaded, so sigil writes none there.

Antigravity MCP (2 scopes, `src/targets/antigravity/config.ts`):

| Scope (precedence) | mcp                                               | Notes                                                      |
| ------------------ | ------------------------------------------------- | ---------------------------------------------------------- |
| project (1)        | `.agents/mcp_config.json` (`mcpServers`)          | git-committed; a tool runs after approval or an allow rule |
| user (2)           | `~/.gemini/config/mcp_config.json` (`mcpServers`) | home-scoped: one `.sigil.bak` once it holds user content   |

`--scope local` is refused. Neither file overrides the other: when both name a server, the one already running keeps
the name, so don't install one server at both scopes. Antigravity doesn't read `.mcp.json` (C1), and no other target
writes these files.

The Copilot and Cursor hook files carry `version: 1`. The `file-marker` strategy keeps it while any sigil
hook remains in the file: uninstalling one of several hooks leaves the version in place, and
uninstalling the last one removes it.

On Copilot, a hook that cannot start **denies** the call (fail-closed), and the cloud agent skips
exec-form hooks (`args`) entirely — `shared/protect-config` is exec form, so it guards Copilot CLI
and VS Code but not the cloud agent.

Copilot CLI loads repository hooks only from a trusted folder. `copilot -p` in an untrusted folder
skips them silently, so nothing guards that session; `--trust-folder` trusts the folder for that one
session.

A hook on `notification` makes `sigil add --target copilot` stop with an error (refused, not
skipped): Copilot documents no compatible input for that event. Give such hooks
`platforms: [claude]`.

**Moving an older install.** Installs made before this recorded the VS Code files. `sigil update`
moves each recorded server to its portable file and takes sigil's entry out of the old one (deleting
the file if nothing else is left), the same reverse-merge `uninstall` uses. A server whose values
you edited in the old file stays there until you pass `--force`. The moves are data: a target
declares `retiredConfigDestinations` (`src/commands/update-config-move.ts` applies them).

**Blast-radius warning.** Driven by `ConfigScopeInfo.blastRadius === 'all-projects'`
(provider-agnostic). The warning note names the concrete `fullPath  › section` target(s) from the
chosen scope's `destinations`. The CLI also prints `fullPath  › section` in the `(merged)`
confirmation line and in dry-run previews (read directly from `ConfigMergeOp.section`, set by each
target's `scaffoldConfig` using the identical derivation `configScopes()` uses, so the two can't
drift apart).
