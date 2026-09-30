# Config-kind writes (`mcp` / `hook` / `settings`)

> **Back to:** [README](../../README.md) · [Documentation index](../index.md)

Config kinds merge into user-owned JSON files instead of writing whole files. This is the sole
home for their merge model, provider-declared scope model, and wizard treatment.

## Serialization: `serialize` vs `canonicalize`

Two serializers, never interchangeable:

- **`serialize(obj)`** (`src/config-merge/primitives.ts`) — **order-preserving** (`JSON.stringify`
  with no key sort). Used on the disk-write path (`cli.ts`). Guarantees a backup-vs-new diff shows
  only the keys sigil added, with existing keys staying in their original positions.
- **`canonicalize(obj)`** (`src/config-merge/primitives.ts`) — **sorted** (stable key order). Used
  only for deterministic fragment hashing (`manifest/hash.ts sha256(canonicalize(fragment))`).
  Never used as the disk writer.

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

- Claude: `mcp`, `hook`, `settings` vocabulary in `src/targets/claude-code/index.ts`.
- Copilot: `mcp` vocabulary in `src/targets/copilot/index.ts`.

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
