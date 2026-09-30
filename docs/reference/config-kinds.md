# Config-kind writes (`mcp` / `hook` / `settings`)

> **Back to:** [README](../../README.md) · [Documentation index](../index.md)

Config kinds merge into user-owned JSON files instead of writing whole files. This is the sole
home for their merge model, provider-declared scope model, and wizard treatment.

## Hook fields

A `kind: hook` artifact (`src/schema/index.ts`, `HookSchema`) becomes one entry under
`hooks.<event>` in Claude Code's settings (`src/targets/claude-code/config-scaffold.ts`):

| Field     | Meaning                                                           |
| --------- | ----------------------------------------------------------------- |
| `event`   | Claude Code lifecycle event (`PreToolUse`, `PostToolUse`, …)      |
| `matcher` | Tool-name pattern, for tool events; defaults to `*`               |
| `command` | Shell command to run or, with `args`, the executable to spawn     |
| `args`    | Exec form: `command` is spawned with these arguments and no shell |
| `timeout` | Optional timeout                                                  |

Use exec form for any hook whose exit code matters. On Windows without Git Bash, shell-form hooks
run through PowerShell, which reports exit code 2 (block) as 1 (no block).

## Serialization: `serialize` vs `canonicalize`

Two serializers, never interchangeable:

- **`serialize(obj)`** (`src/config-merge/primitives.ts`) — **order-preserving** (`JSON.stringify`
  with no key sort). Used on the disk-write path (`cli.ts`). Guarantees a backup-vs-new diff shows
  only the keys sigil added, with existing keys staying in their original positions.
- **`canonicalize(obj)`** (`src/config-merge/primitives.ts`) — **sorted** (stable key order). Used
  only for deterministic fragment hashing (`manifest/hash.ts sha256(canonicalize(fragment))`).
  Never used as the disk writer.

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
refusing. See `docs/decisions/catalog-usage-audit-2026-08-21.md` (F14) for the incident that
established this.

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

`sigil status` does not yet report "catalog changed" for config kinds; `sigil update` is what
detects and applies it.

## `.sigil.bak` home-directory backup

Any write or delete to a home-scoped config file (`ConfigRoot: 'home' | 'vscode-user'` — files like
`~/.claude.json` or the VS Code user-profile `mcp.json`, which affect **every** project, not just
the current one) takes a pristine `.sigil.bak` copy before the first such write, via the shared
`ensureHomeBackup()` helper (`src/config-utils.ts`). This applies uniformly across all three
config-JSON writers — `sigil add`, `sigil update`, and `sigil uninstall`
(`commands/add/execute-config.ts`, `commands/update-config.ts`, `commands/uninstall-config.ts`) —
after the 2026-08-22 audit found the backup implemented only in `add`'s path, leaving `update`'s
re-merges and `uninstall`'s deletes/rewrites of the same home-scoped files with no safety net (F23,
`docs/decisions/catalog-benchmark-audit-2026-08-22.md`). The backup is written once, pristine; a
second write to the same file in the same session keeps the existing backup and just warns that
it's still there. Project-scoped config files (`.claude/settings.json`, `.mcp.json`) are protected
by git instead — no `.bak` is written for them.

## Wizard: config kinds are first-class, never language-gated

- **`Pick specific items` → specific kind (primary path):** config kinds appear as top-level kind
  entries in the kind sub-menu (MCPs · Hooks · Settings, each with counts). Selecting one opens a
  flat picker that skips language and deps steps entirely — goes straight to overwrite → scope.
- **`Pick specific items` → All types (cross-kind path):** config kinds appear under a dedicated
  `"Config — agnostic"` group at the top of the grouped picker, above all language groups. The
  `shared` language group contains only genuine shared-code artifacts (agents, rules), never config
  kinds.

`partitionConfigKinds()` (`src/select/grouping.ts`) is the pure helper that splits
`{ config, rest }` — imported by both `src/wizard/add.ts` and `cli.ts`. `CONFIG_KINDS`
(`src/select/selection.ts`) is the single source of truth for `{ hook, settings, mcp }`.

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

The wizard's `configScope` step (`src/wizard/add.ts`) calls
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

GitHub Copilot (2 scopes — no distinct local MCP scope in VS Code):

| Scope (precedence) | mcp                             |
| ------------------ | ------------------------------- |
| project (1)        | `.vscode/mcp.json`              |
| user (2)           | VS Code user-profile `mcp.json` |

**Blast-radius warning.** Driven by `ConfigScopeInfo.blastRadius === 'all-projects'`
(provider-agnostic). The warning note names the concrete `fullPath  › section` target(s) from the
chosen scope's `destinations`. The CLI also prints `fullPath  › section` in the `(merged)`
confirmation line and in dry-run previews (read directly from `ConfigMergeOp.section`, set by each
target's `scaffoldConfig` using the identical derivation `configScopes()` uses, so the two can't
drift apart).

## `.sigil.bak` backup

Written **once, pristine** before the first home-directory write to preserve the original file
state. On every subsequent run (backup already exists) the CLI still prints
`⚠  Existing backup kept → <bak>  (compare before committing)` so users know the backup is there
and can compare. Project-level config files are protected by git — no `.bak` written there.
