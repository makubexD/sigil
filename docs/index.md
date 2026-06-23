# Sigil — Documentation

> **New here?** Start with the [README](../README.md) for the one-minute pitch and install
> instructions, then pick the guide that matches your goal below.

## Guides

| Guide | Who it's for | Covers |
| ----- | ------------ | ------ |
| [guides/consuming.md](guides/consuming.md) | Developers adding skills to a project | Wizard, `add`, `list`, `init`, shell completion |
| [guides/authoring.md](guides/authoring.md) | Contributors adding artifacts to the catalog | New skill / rule / language walkthroughs |
| [guides/operations.md](guides/operations.md) | Maintainers & CI | Build targets, CI gate, `release` command |

## Reference

| Reference | Covers |
| --------- | ------ |
| [reference/spec.md](reference/spec.md) | Artifact kinds, frontmatter schema, platform mapping, CLI flags |
| [reference/troubleshooting.md](reference/troubleshooting.md) | Common errors, FAQ, validation violations |

## Root files

| File | Covers |
| ---- | ------ |
| [README.md](../README.md) | What Sigil is, install, quick start, artifact list |
| [CONTRIBUTING.md](../CONTRIBUTING.md) | Authoring rules, PR process, what reviewers check |
| [CHANGELOG.md](../CHANGELOG.md) | Version history |
| [CLAUDE.md](../CLAUDE.md) | Build internals, architecture (for code contributors) |

---

## Command cheat-sheet

| Command | When to use |
| ------- | ----------- |
| `sigil add skill:<id>` | Scaffold a skill + its full dependency closure into a project |
| `sigil add all --yes` | Bulk-install the entire catalog (CI-safe) |
| `sigil list --kind rule` | Browse available artifacts before authoring duplicates |
| `sigil new <kind>` | Start a new catalog artifact with the correct frontmatter template |
| `sigil validate` | Schema + reference-graph checks — run before every build and in CI |
| `sigil build --target claude` | Compile the Claude Code plugin layout to `dist/claude/` |
| `sigil build --target copilot` | Compile the Copilot layout to `dist/copilot/` |
| `sigil check <file>` | Validate a single source file (fast per-file feedback) |
| `sigil edit <id>` | Update an artifact's title, description, or tags |
| `sigil delete <id>` | Remove an artifact; warns about dependent skills |
| `sigil retarget <id>` | Widen or restrict which AI platforms an artifact targets |
| `sigil release [level]` | Bump version, rebuild, update CHANGELOG, commit + tag |

Full flag reference → [reference/spec.md § CLI reference](reference/spec.md#cli-reference).
