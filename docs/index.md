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

| Decision log                                                                                           | Topic                                                      |
| ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| [decisions/catalog-import-migration.md](decisions/catalog-import-migration.md)                         | `_Others` import migration — design decisions and bug log  |
| [decisions/skill-dispatch-audit-2026-08.md](decisions/skill-dispatch-audit-2026-08.md)                 | Why skills never dispatched; `whenToUse` vs `description`  |
| [decisions/template-extraction-evidence-2026-08.md](decisions/template-extraction-evidence-2026-08.md) | Line-level duplication audit — why only `mcp-note` shipped |

## Reference

| Reference                                                    | Covers                                                                              |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| [reference/spec.md](reference/spec.md)                       | Artifact kinds, frontmatter schema, platform mapping, CLI reference, trust scanning |
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

| Command                        | When to use                                                        |
| ------------------------------ | ------------------------------------------------------------------ |
| `sigil add skill:<id>`         | Scaffold a skill + its full dependency closure into a project      |
| `sigil add all --yes`          | Bulk-install the entire catalog (CI-safe)                          |
| `sigil list --kind rule`       | Browse available artifacts before authoring duplicates             |
| `sigil new <kind>`             | Start a new catalog artifact with the correct frontmatter template |
| `sigil import <dir>`           | Import a portable Claude template directory into the catalog       |
| `sigil validate`               | Schema + reference-graph checks — run before every build and in CI |
| `sigil build --target claude`  | Compile the Claude Code plugin layout to `dist/claude/`            |
| `sigil build --target copilot` | Compile the Copilot layout to `dist/copilot/`                      |
| `sigil check <file>`           | Validate a single source file (fast per-file feedback)             |
| `sigil edit <id>`              | Update an artifact's title, description, or tags                   |
| `sigil patch <id>`             | Update any other field (severity, extends, uses, tools, ...)       |
| `sigil get <id>`               | Show full detail — closure, reverse-deps, emit targets             |
| `sigil search <query>`         | Ranked free-text search across the catalog                         |
| `sigil delete <id>`            | Remove an artifact; warns about dependent skills                   |
| `sigil move <id> <new-id>`     | Atomic rename — rewrites all referrers                             |
| `sigil retarget <id>`          | Widen or restrict which AI platforms an artifact targets           |
| `sigil status`                 | Show install health of artifacts in a consumer project             |
| `sigil update [ids...]`        | Refresh installed artifacts to the current catalog version         |
| `sigil uninstall <ids...>`     | Remove installed artifacts from a consumer project                 |
| `sigil sync`                   | Catalog-author side: report/apply template-drift + stale doc links |
| `sigil index`                  | Emit `dist/registry.json` — flat per-artifact index                |
| `sigil release [level]`        | Bump version, rebuild, update CHANGELOG, commit + tag              |

Full flag reference → [reference/spec.md § CLI reference](reference/spec.md#cli-reference).
