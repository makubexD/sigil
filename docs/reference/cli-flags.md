# CLI flags

> **Back to:** [README](../../README.md) · [Documentation index](../index.md)

Per-command flags for the user-facing `sigil` commands. The command summary is in
[spec.md § CLI reference](spec.md#cli-reference).

<!-- generated -->
<!-- Regenerate: npm run build, then `node dist-cli/cli.js <cmd> --help` for build, validate, index, list, get, search, add, init, new, check, sync, import, status, update, prune, uninstall, patch, move, retarget, edit, delete, completion, release. -->
<!-- test/cli-flags.test.ts fails when a registered command or flag token is missing from this file. -->

## Contents

- [`sigil build`](#sigil-build)
- [`sigil validate`](#sigil-validate)
- [`sigil index`](#sigil-index)
- [`sigil list`](#sigil-list)
- [`sigil get`](#sigil-get)
- [`sigil search`](#sigil-search)
- [`sigil add`](#sigil-add)
- [`sigil init`](#sigil-init)
- [`sigil new`](#sigil-new)
- [`sigil check`](#sigil-check)
- [`sigil sync`](#sigil-sync)
- [`sigil import`](#sigil-import)
- [`sigil status`](#sigil-status)
- [`sigil update`](#sigil-update)
- [`sigil prune`](#sigil-prune)
- [`sigil uninstall`](#sigil-uninstall)
- [`sigil patch`](#sigil-patch)
- [`sigil move`](#sigil-move)
- [`sigil retarget`](#sigil-retarget)
- [`sigil edit`](#sigil-edit)
- [`sigil delete`](#sigil-delete)
- [`sigil completion`](#sigil-completion)
- [`sigil release`](#sigil-release)

## `sigil build`

```text
Usage: sigil build [options]

Compile the catalog to dist/<target>/.

Options:
  --target <name>      Platform to emit (claude, copilot, all) (default: "all")
  --catalog-dir <dir>  Path to catalog/ (default: <package>/catalog)
  --packs <file>       Path to packs.yaml (default: <package>/packs.yaml)
  --out-dir <dir>      Output root (default: <package>/dist)
  -h, --help           display help for command
```

## `sigil validate`

```text
Usage: sigil validate [options]

Validate all catalog artifacts (schema + reference integrity). Exits non-zero on
errors.

Options:
  --catalog-dir <dir>  Path to catalog/ (default: <package>/catalog)
  --packs <file>       Path to packs.yaml (default: <package>/packs.yaml)
  -h, --help           display help for command
```

## `sigil index`

```text
Usage: sigil index [options]

Emit dist/registry.json — flat per-artifact index with sha256 + facets.

Options:
  --catalog-dir <dir>  Path to catalog/ (default: <package>/catalog)
  --packs <file>       Path to packs.yaml (default: <package>/packs.yaml)
  --out-dir <dir>      Output root (default: <package>/dist)
  --json               Print the registry to stdout instead of writing a file
  -h, --help           display help for command
```

## `sigil list`

```text
Usage: sigil list [options]

List catalog artifacts, optionally filtered by language and/or kind.

Options:
  --language <lang>    Filter by language (e.g. csharp, python)
  --kind <kind>        Filter by kind (mcp, hook, settings, prompt, skill,
                       agent, rule, workflow, template)
  --catalog-dir <dir>  Path to catalog/ (default: <package>/catalog)
  -h, --help           display help for command
```

## `sigil get`

```text
Usage: sigil get|show [options] <id>

Show full detail for a single catalog artifact (closure, targets, dest paths).

Options:
  --catalog-dir <dir>  Path to catalog/ (default: <package>/catalog)
  --json               Output as JSON (default: false)
  -h, --help           display help for command
```

## `sigil search`

```text
Usage: sigil search [options] <query>

Free-text search the catalog (id, title, description, tags). Ranked results.

Options:
  --catalog-dir <dir>  Path to catalog/ (default: <package>/catalog)
  --kind <kind>        Filter to this kind
  --language <lang>    Filter to this language
  --tag <tag>          Filter to artifacts with this tag (substring match)
  --json               Output as JSON (default: false)
  -h, --help           display help for command
```

## `sigil add`

```text
Usage: sigil add [options] [selectors...]

Scaffold artifact(s) + their dependency closure into a consumer project. Runs a
guided wizard when called with no selector in a TTY.

Options:
  --target <name>      Target platform (auto-detected if omitted)
  --project-dir <dir>  Consumer project root (default: <cwd>)
  --catalog-dir <dir>  Path to catalog/ (default: <package>/catalog)
  --packs <file>       Path to packs.yaml (default: <package>/packs.yaml)
  --kind <list>        Comma-separated kinds to include after selector expansion
  --exclude <list>     Comma-separated kinds to exclude after selector expansion
  --language <lang>    Restrict to a specific language
  --no-deps            Skip the uses closure (skill only, no rule/agent deps)
  --dry-run            Preview what would be written without writing any files
                       (default: false)
  -i, --interactive    Force the interactive guided installer (default: false)
  --yes                Non-interactive mode; skip the wizard. Safe for CI.
                       (default: false)
  --overwrite          Replace existing files (default: warn and skip conflicts)
                       (default: false)
  --scope <scope>      Install scope for config-kind artifacts: project | local
                       | user
  --settings-local     (deprecated) Alias for --scope local (default: false)
  -h, --help           display help for command
```

## `sigil init`

```text
Usage: sigil init [options]

Prepare a consumer project for a target platform. Asks which one in a terminal.

Options:
  --target <name>      Target platform: claude or copilot (asked in a terminal
                       if omitted)
  --project-dir <dir>  Consumer project root (default: <cwd>)
  -h, --help           display help for command
```

## `sigil new`

```text
Usage: sigil new [options] [kind]

Scaffold an authoring template for a new catalog artifact. Runs a guided wizard
when called with no args in a TTY.

Options:
  --language <lang>    Language (e.g. csharp). Omit for shared.
  --name <name>        Artifact name (kebab-case)
  --catalog-dir <dir>  Path to catalog/ (default: <package>/catalog)
  --platforms <list>   Comma-separated platforms to restrict to.
  --yes                Non-interactive: skip wizard. Requires explicit kind and
                       --name.
  -i, --interactive    Force the guided wizard even when kind is provided.
  -h, --help           display help for command
```

## `sigil check`

```text
Usage: sigil check [options] [files...]

Validate catalog source artifact files (schema, id/path/language, references,
platforms). Exits non-zero on violations.

Options:
  --catalog-dir <dir>  Path to catalog/ (default: <package>/catalog)
  --schema-only        Only run zod schema validation (default: false)
  --trust              Run the trust/security scanner (secret detection +
                       injection heuristics) (default: false)
  --strict             Exit non-zero on trust warnings (requires --trust)
                       (default: false)
  -h, --help           display help for command
```

## `sigil sync`

```text
Usage: sigil sync [options] [template-id]

Report (default) / --check (CI gate) / --apply (write) drift between catalog
artifacts and the template they declare via template:, PLUS conformance against
the current provider standard (src/targets/doc-refs.ts + KindEmitSpecs). Scope
template drift to one template id, or omit for all; scope conformance with
--rule/--kind/--language/--provider.

Options:
  --catalog-dir <dir>    Path to catalog/ (default: <package>/catalog)
  --packs <file>         Path to packs.yaml (default: <package>/packs.yaml)
  --check                Exit non-zero if any drift or conformance error is
                         found (CI gate) (default: false)
  --apply                Write the mechanical fixes; refuses on a dirty working
                         tree (default: false)
  --editorial            With --apply, also run the model-backed conformance
                         pass (requires ANTHROPIC_API_KEY) (default: false)
  --changed-since <ref>  Scope to templates touched since this git ref
  --stale <months>       Flag template + provider-spec docs[] not verified
                         within N months (default: "6")
  --rule <id>            Scope conformance to one rule id
  --kind <kind>          Scope conformance to one artifact kind
  --language <lang>      Scope conformance to one language
  --provider <name>      Scope conformance to one target/provider name
  --json                 Output as JSON (default: false)
  -h, --help             display help for command
```

## `sigil import`

```text
Usage: sigil import [options] <source-dir>

Import a portable Claude template directory into the catalog as first-class
artifacts.

Options:
  --language <lang>      Target language key (e.g. csharp, typescript)
  --display-name <name>  Override the language display name in generated titles
  --catalog-dir <dir>    Path to catalog/ (default: <package>/catalog)
  --dry-run              Preview only — print coverage report without writing
                         (default: false)
  --yes                  Non-interactive mode (default: false)
  --overwrite            Overwrite existing catalog files (default: false)
  --create-language      Create language.yaml when it does not exist (default:
                         false)
  -h, --help             display help for command
```

## `sigil status`

```text
Usage: sigil status [options]

Show health status of artifacts installed in a consumer project.

Options:
  --project-dir <dir>  Consumer project root (default: <cwd>)
  --target <name>      Target platform (auto-detected if omitted)
  --catalog-dir <dir>  Path to catalog/ (default: <package>/catalog)
  --packs <file>       Path to packs.yaml (default: <package>/packs.yaml)
  --json               Output as JSON (default: false)
  -h, --help           display help for command
```

## `sigil update`

```text
Usage: sigil update [options] [ids...]

Refresh installed artifacts to the current bundled catalog version, including
hook/settings/mcp fragments the catalog changed. Skips drifted files and edited
config values unless --force. In a terminal it previews and asks before writing.

Options:
  --project-dir <dir>  Consumer project root (default: <cwd>)
  --target <name>      Target platform (auto-detected if omitted)
  --catalog-dir <dir>  Path to catalog/ (default: <package>/catalog)
  --packs <file>       Path to packs.yaml (default: <package>/packs.yaml)
  --force              Overwrite drifted (user-modified) files (default: false)
  --dry-run            Preview what would change without writing (default:
                       false)
  --yes                Apply without previewing and asking first (a terminal
                       asks by default) (default: false)
  -h, --help           display help for command
```

## `sigil prune`

```text
Usage: sigil prune [options]

Report (default) / --apply (write) cleanup of a project's manifest: removes
orphaned artifacts (no longer in the bundled catalog) and reports
deprecated-but-installed ones.

Options:
  --project-dir <dir>  Consumer project root (default: <cwd>)
  --target <name>      Target platform (auto-detected if omitted)
  --catalog-dir <dir>  Path to catalog/ (default: <package>/catalog)
  --packs <file>       Path to packs.yaml (default: <package>/packs.yaml)
  --apply              Remove orphaned artifacts (preview-only without this
                       flag) (default: false)
  --yes                Skip confirmation prompt (default: false)
  --force              Remove even drifted (user-modified) orphaned files
                       (default: false)
  --json               Output as JSON (default: false)
  -h, --help           display help for command
```

## `sigil uninstall`

```text
Usage: sigil uninstall [options] [ids...]

Remove installed artifacts from a consumer project. Refcount-aware: shared deps
only removed when no dependents remain.

Options:
  --project-dir <dir>  Consumer project root (default: <cwd>)
  --target <name>      Target platform (auto-detected if omitted)
  --yes                Skip confirmation prompt (default: false)
  --force              Remove even drifted (user-modified) files (default:
                       false)
  --dry-run            Preview without removing (default: false)
  -h, --help           display help for command
```

## `sigil patch`

```text
Usage: sigil patch [options] <id>

Update any field(s) of an existing catalog artifact. Transactional: rolls back
on validation failure.

Options:
  --catalog-dir <dir>                Path to catalog/ (default:
                                     <package>/catalog)
  --yes                              Non-interactive: apply without prompting
                                     (default: false)
  --title <title>                    New title
  --description <desc>               New description
  --add-tag <tag>                    Add a tag
  --remove-tag <tag>                 Remove a tag
  --set-tags <list>                  Replace all tags (comma-separated)
  --add-applies-to <glob>            Add a file glob to appliesTo
  --remove-applies-to <glob>         Remove a file glob from appliesTo
  --set-applies-to <list>            Replace appliesTo (comma-separated globs)
  --set-applies-to-rationale <text>  Justify a deliberately unscoped appliesTo:
                                     ["**/*"] (rule only; empty string clears
                                     it)
  --severity <level>                 Set severity: required | recommended |
                                     optional (rule only)
  --add-extends <id>                 Add a rule id to extends: (rule only)
  --remove-extends <id>              Remove a rule id from extends: (rule only)
  --set-extends <list>               Replace extends: (comma-separated rule ids,
                                     rule only)
  --add-uses-rule <id>               Add a rule id to uses.rules (skill only)
  --remove-uses-rule <id>            Remove a rule id from uses.rules (skill
                                     only)
  --set-uses-rules <list>            Replace uses.rules (comma-separated ids,
                                     skill only)
  --add-uses-agent <id>              Add an agent id to uses.agents (skill only)
  --remove-uses-agent <id>           Remove an agent id from uses.agents (skill
                                     only)
  --set-uses-agents <list>           Replace uses.agents (comma-separated ids,
                                     skill only)
  --add-tool <tool>                  Add a tool to tools (agent only)
  --remove-tool <tool>               Remove a tool from tools (agent only)
  --set-tools <list>                 Replace tools (comma-separated, agent only)
  --add-disallowed-tool <tool>       Add to disallowedTools (agent only)
  --remove-disallowed-tool <tool>    Remove from disallowedTools (agent only)
  --set-disallowed-tools <list>      Replace disallowedTools (comma-separated,
                                     agent only)
  --claude-model <value>             Set claude.model: haiku | sonnet | opus
                                     (agent only)
  --claude-effort <value>            Set claude.effort: low | medium | high
                                     (agent only)
  --claude-max-turns <value>         Set claude.maxTurns (agent only)
  --claude-isolation <value>         Set claude.isolation: worktree (agent only)
  --add-platform <name>              Add a platform to platforms:
  --remove-platform <name>           Remove a platform from platforms:
  --to-platforms <list>              Set platforms: to exactly these
                                     (comma-separated, or "all" to reset)
  -h, --help                         display help for command
```

## `sigil move`

```text
Usage: sigil move|rename [options] <id> <new-id>

Rename/relocate a catalog artifact and rewrite its extends/uses referrers.
Transactional: rolls back on failure.

Options:
  --catalog-dir <dir>  Path to catalog/ (default: <package>/catalog)
  --dry-run            Preview the move without executing (default: false)
  --yes                Skip confirmation prompt (default: false)
  -h, --help           display help for command
```

## `sigil retarget`

```text
Usage: sigil retarget [options] <id>

Change platform targeting of a catalog artifact without touching its body.

Options:
  --add <platforms>     Comma-separated platforms to add
  --remove <platforms>  Comma-separated platforms to remove
  --to <platforms>      Set targeting to exactly these (comma-separated, or
                        "all" to reset)
  --catalog-dir <dir>   Path to catalog/ (default: <package>/catalog)
  --yes                 Skip confirmation prompt (default: false)
  --with-deps           Also apply the targeting change to the artifact's uses:
                        closure (default: false)
  -h, --help            display help for command
```

## `sigil edit`

```text
Usage: sigil edit [options] <id>

Update title, description, and tags. Use `sigil patch` for all other fields.

Options:
  --title <title>       New title (replaces existing)
  --description <desc>  New description (replaces existing)
  --tags <list>         Comma-separated tags (replaces existing)
  --catalog-dir <dir>   Path to catalog/ (default: <package>/catalog)
  --yes                 Non-interactive: apply flags without prompting
  -h, --help            display help for command
```

## `sigil delete`

```text
Usage: sigil delete|remove [options] <id>

Remove a catalog artifact from the source. Prompts for confirmation unless
--yes.

Options:
  --catalog-dir <dir>  Path to catalog/ (default: <package>/catalog)
  --yes                Skip confirmation prompt
  --dry-run            Preview what would be deleted without deleting
  -h, --help           display help for command
```

## `sigil completion`

```text
Usage: sigil completion [options] [shell]

Print a shell tab-completion script (bash, zsh, or fish).

Options:
  -h, --help  display help for command
```

## `sigil release`

```text
Usage: sigil release [options] [level]

Bump version (patch|minor|major|x.y.z), rebuild, update CHANGELOG, commit + tag.
Does NOT push.

Options:
  --dry-run    Print every step and computed version; write nothing
  --no-verify  Skip the build/validate/test gate (escape hatch)
  --yes        Non-interactive; skip the confirmation prompt (required when not
               a TTY)
  -h, --help   display help for command
```
