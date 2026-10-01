# Sigil — Documentation

> **New here?** Start with the [README](../README.md) for the one-minute pitch and install
> instructions, then pick the guide that matches your goal below.

## Guides

| Guide                                        | Who it's for                                 | Covers                                            |
| -------------------------------------------- | -------------------------------------------- | ------------------------------------------------- |
| [guides/consuming.md](guides/consuming.md)   | Developers adding skills to a project        | Wizard, `add`, `list`, `init`, shell completion   |
| [guides/authoring.md](guides/authoring.md)   | Contributors adding artifacts to the catalog | New skill / rule / language / import walkthroughs |
| [guides/operations.md](guides/operations.md) | Maintainers & CI                             | Build targets, CI gate, `release` command         |

## Decisions

Point-in-time session retrospectives, kept only while still load-bearing. See
[decisions/README.md](decisions/README.md) for the full archive index — including summaries of
superseded logs that were deleted (recoverable via the commit hash listed there).

## Audits

Measurement logs and campaign notes live under [audits/](audits/). They record a point in time;
the guides and reference describe the system as it stands.

## Reference

| Reference                                                    | Covers                                                                              |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| [reference/spec.md](reference/spec.md)                       | Artifact kinds, frontmatter schema, platform mapping, CLI reference, trust scanning |
| [reference/cli-flags.md](reference/cli-flags.md)             | Per-command flags, generated from `sigil <cmd> --help`                              |
| [reference/architecture.md](reference/architecture.md)       | Contributor internals: extension model, emit specs, templates, lexicon, conformance |
| [reference/capabilities.md](reference/capabilities.md)       | Generated: which kinds each target delivers per channel (scaffold / plugin)         |
| [reference/config-kinds.md](reference/config-kinds.md)       | `mcp` / `hook` / `settings` merge model, scope tables                               |
| [reference/troubleshooting.md](reference/troubleshooting.md) | Common errors, FAQ, validation violations                                           |

## Root files

| File                                  | Covers                                                                       |
| ------------------------------------- | ---------------------------------------------------------------------------- |
| [README.md](../README.md)             | What Sigil is, install, quick start, artifact list                           |
| [CONTRIBUTING.md](../CONTRIBUTING.md) | Authoring rules, PR process, what reviewers check                            |
| [CHANGELOG.md](../CHANGELOG.md)       | Version history                                                              |
| [CLAUDE.md](../CLAUDE.md)             | Agent-facing invariants, architecture, and a doc map (for code contributors) |

---

## Command cheat-sheet

| Command                        | When to use                                                                    |
| ------------------------------ | ------------------------------------------------------------------------------ |
| `sigil add skill:<id>`         | Scaffold a skill + its full dependency closure into a project                  |
| `sigil add all --yes`          | Bulk-install the entire catalog (CI-safe)                                      |
| `sigil init --target <name>`   | Prepare a consumer project for `claude` or `copilot`                           |
| `sigil list --kind rule`       | Browse available artifacts before authoring duplicates                         |
| `sigil new <kind>`             | Start a new catalog artifact with the correct frontmatter template             |
| `sigil import <dir>`           | Import a portable Claude template directory into the catalog                   |
| `sigil validate`               | Schema + reference-graph checks — run before every build and in CI             |
| `sigil build --target claude`  | Compile the Claude Code plugin layout to `dist/claude/`                        |
| `sigil build --target copilot` | Compile the Copilot layout to `dist/copilot/`                                  |
| `sigil check <file>`           | Validate a single source file (fast per-file feedback)                         |
| `sigil edit <id>`              | Update an artifact's title, description, or tags                               |
| `sigil patch <id>`             | Update a field that has an explicit patch flag (severity, uses, platform keys) |
| `sigil get <id>`               | Show full detail — closure, reverse-deps, emit targets                         |
| `sigil search <query>`         | Ranked free-text search across the catalog                                     |
| `sigil delete <id>`            | Remove an artifact; warns about dependent skills                               |
| `sigil move <id> <new-id>`     | Atomic rename — rewrites all referrers                                         |
| `sigil retarget <id>`          | Widen or restrict which AI platforms an artifact targets                       |
| `sigil status`                 | Show install health of artifacts in a consumer project                         |
| `sigil update [ids...]`        | Refresh installed artifacts to the current catalog version                     |
| `sigil uninstall <ids...>`     | Remove installed artifacts from a consumer project (bare catalog ids)          |
| `sigil prune`                  | Report orphaned installed artifacts; `--apply` removes them                    |
| `sigil completion [shell]`     | Print a shell completion script (bash, zsh, or fish)                           |
| `sigil sync`                   | Catalog-author side: report/apply template-drift + stale doc links             |
| `sigil index`                  | Emit `dist/registry.json` — flat per-artifact index                            |
| `sigil release [level]`        | Bump version, rebuild, update CHANGELOG, commit + tag                          |

Full flag reference → [reference/spec.md § CLI reference](reference/spec.md#cli-reference).
