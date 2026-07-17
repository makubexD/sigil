<p align="center">
  <img src="docs/assets/sigil-logo.svg" width="280" alt="Sigil — one source, every assistant">
</p>

<p align="center">
  <strong>Write AI coding instructions once. Compile to Claude Code, GitHub Copilot, and more.</strong>
</p>

---

> **Status:** v0.1 — reference catalog for C#, Python, and React. Not yet published to npm.
> Build from source (below) and invoke with `sigil` once linked.

## Why

Every AI tool has its own format for coding instructions. Today you re-type the same
"how to write a good unit test" guidance for Claude, then again for Copilot, in each tool's
own syntax. When guidance changes, it drifts.

**Sigil** solves this with a **canonical-source → compiler** approach:

- Author skills, agents, and rules **once** in plain Markdown with YAML frontmatter.
- Express DRY reuse through `extends:` (rules inherit rules) and `uses:` (skills reference rules/agents by ID).
- A build step compiles the resolved catalog to each platform's native layout.
- Adding a language = one new folder. Adding a new AI platform = one new adapter.

## Install

```bash
# Zero-install (after publish)
npx sigil <command>

# Global install (recommended for repeated use)
npm install -g sigil
sigil <command>
```

### Build from source (contributors / pre-publish)

```bash
git clone <repo-url>
cd sigil
npm install
npm run build       # sets heap flag automatically via cross-env
npm run validate    # should report: ✓ All 13 artifact(s) are valid.
npm link            # one-time: registers global `sigil` symlink
```

## Quick start

### Path A — CLI scaffold (add files directly to your project)

Run from your project root. The catalog is read from the installed package; files are written
to your current directory.

```bash
# Claude Code project
sigil add                              # interactive guided wizard
sigil add skill:csharp/xunit-testing  # or pick directly

# GitHub Copilot project
sigil add --target copilot            # wizard, auto-writes .github/
sigil add skill:python/pytest-testing --target copilot
```

### Path B — Native Claude marketplace plugin

```bash
# Build the plugin layout (run inside the catalog repo)
sigil build --target claude

# In Claude Code, install from the local dist:
# /plugin marketplace add ./dist/claude
# /plugin install dotnet-pack
```

## Available artifacts (v0.1)

### Skills

| ID                        | Title                         | Language |
| ------------------------- | ----------------------------- | -------- |
| `csharp/xunit-testing`    | Write xUnit Tests for .NET    | C#       |
| `python/pytest-testing`   | Write pytest Tests for Python | Python   |
| `react/component-testing` | Write React Component Tests   | React    |

### Agents

| ID                            | Title              | Scope         |
| ----------------------------- | ------------------ | ------------- |
| `shared/code-reviewer`        | Code Reviewer      | All languages |
| `csharp/dotnet-api-architect` | .NET API Architect | C#            |
| `python/python-architect`     | Python Architect   | Python        |
| `react/react-architect`       | React Architect    | React         |

### Rules

| ID                    | Title                 | Scope      |
| --------------------- | --------------------- | ---------- |
| `shared/clean-code`   | Clean Code Baseline   | All files  |
| `csharp/dotnet-style` | .NET / C# Style       | `**/*.cs`  |
| `python/python-style` | Python Style          | `**/*.py`  |
| `react/react-style`   | React Component Style | `**/*.tsx` |

### Prompts

| ID                       | Title                         |
| ------------------------ | ----------------------------- |
| `shared/explain-diff`    | Explain a Code Diff           |
| `shared/author-artifact` | Author a New Catalog Artifact |

## Learn more

| Document                                                               | Purpose                                                   |
| ---------------------------------------------------------------------- | --------------------------------------------------------- |
| [docs/index.md](docs/index.md)                                         | Documentation hub — one line per doc, command cheat-sheet |
| [docs/guides/consuming.md](docs/guides/consuming.md)                   | Install skills into a project — wizard, `add`, `list`     |
| [docs/guides/authoring.md](docs/guides/authoring.md)                   | Add new skills, rules, or languages to the catalog        |
| [docs/guides/operations.md](docs/guides/operations.md)                 | Build targets, CI gate, `release` command                 |
| [docs/reference/spec.md](docs/reference/spec.md)                       | Frontmatter schema, platform mapping, CLI flags           |
| [docs/reference/troubleshooting.md](docs/reference/troubleshooting.md) | Common errors and FAQ                                     |
| [CONTRIBUTING.md](CONTRIBUTING.md)                                     | Authoring rules, DRY conventions, PR process              |
| [CHANGELOG.md](CHANGELOG.md)                                           | Version history                                           |
| [CLAUDE.md](CLAUDE.md)                                                 | Build internals and architecture (for code contributors)  |

## License

MIT — Copyright (c) 2026 makudev1719
