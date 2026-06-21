# @maku/agent-catalog

A vendor-neutral catalog of AI skills, agents, rules, and prompts — authored once, compiled to [Claude Code](https://code.claude.com), [GitHub Copilot](https://github.com/features/copilot), and more.

> **Status:** v0.1 — reference catalog for C#, Python, and React. Package is not yet published to npm.
> Once published, use `npx @maku/agent-catalog <cmd>` or install globally.
> Until then, build from source (see **Prerequisites** below) and substitute `maku-catalog` with `node /path/to/dist-cli/cli.js`.

## Why

Every AI tool has its own file format for coding instructions. Today you re-type the same "how to write a good unit test" guidance for Claude, then again for Copilot, in each tool's different syntax. When the guidance changes, you update it in multiple places. That drifts.

This project solves it with a **canonical-source + compiler** approach:
- Author skills, agents, and rules **once** in plain Markdown with light YAML frontmatter.
- Express DRY reuse through `extends:` (rules inherit from rules) and `uses:` (skills reference rules/agents by ID).
- A build step compiles the resolved catalog to each platform's native layout.
- Adding a new language = adding one folder. Adding a new AI platform = adding one adapter.

For practical recipes, see **[USAGE.md](./USAGE.md)**.

## Install

```bash
# Zero-install (after publish)
npx @maku/agent-catalog <command>

# Global install (recommended for repeated use)
npm install -g @maku/agent-catalog
maku-catalog <command>
```

### Build from source (contributors / pre-publish)

```bash
git clone <repo-url>
cd MakuAgentCatalogAI
npm install
npm run build          # Sets the heap flag automatically via cross-env
npm run validate       # Should report: ✓ All 12 artifact(s) are valid.
```

Then use `node dist-cli/cli.js` in place of `maku-catalog` in any command below.
The CLI always reads the catalog from the package itself, so you can run it from any directory.

## Quick start

**Two consumption paths:**

### Path A — CLI scaffold (add files directly to your project)

Run these commands from your project's root directory. The catalog is read from the installed package;
files are written to your current directory.

```bash
# Claude Code project
maku-catalog add                              # interactive guided wizard
maku-catalog add skill:csharp/xunit-testing  # or pick directly

# GitHub Copilot project
maku-catalog add --target copilot            # wizard, auto-writes .github/
maku-catalog add skill:python/pytest-testing --target copilot
```

### Path B — Native Claude marketplace plugin

```bash
# Build the plugin layout (run from inside the catalog repo)
maku-catalog build --target claude

# In Claude Code, install from the local dist:
# /plugin marketplace add ./dist/claude
# /plugin install dotnet-pack
```

## Available artifacts (v0.1)

### Skills
| ID | Title | Language |
|---|---|---|
| `csharp/xunit-testing` | Write xUnit Tests for .NET | C# |
| `python/pytest-testing` | Write pytest Tests for Python | Python |
| `react/component-testing` | Write React Component Tests | React |

### Agents
| ID | Title | Scope |
|---|---|---|
| `shared/code-reviewer` | Code Reviewer | All languages |
| `csharp/dotnet-api-architect` | .NET API Architect | C# |
| `python/python-architect` | Python Architect | Python |
| `react/react-architect` | React Architect | React |

### Rules
| ID | Title | Scope |
|---|---|---|
| `shared/clean-code` | Clean Code Baseline | All files |
| `csharp/dotnet-style` | .NET / C# Style | `**/*.cs` |
| `python/python-style` | Python Style | `**/*.py` |
| `react/react-style` | React Component Style | `**/*.tsx` |

### Prompts
| ID | Title |
|---|---|
| `shared/explain-diff` | Explain a Code Diff |

## CLI reference

Run `maku-catalog` from **any directory** — the catalog source is embedded in the package.
Files are written relative to the directory you run from (or `--project-dir`).

```bash
# Scaffold artifact(s) into your project — guided wizard when run with no selector in a TTY
maku-catalog add                                   # interactive wizard
maku-catalog add all                               # full catalog
maku-catalog add pack:dotnet-pack                  # one pack
maku-catalog add kind:agent                        # all agents
maku-catalog add skill:csharp/xunit-testing        # explicit artifact
maku-catalog add all --exclude prompt --yes        # bulk minus prompts (CI-safe)
maku-catalog add skill:... --no-deps               # skill only, no dep closure
maku-catalog add all --dry-run --yes               # preview, no writes
maku-catalog add all --overwrite --yes             # replace existing files
maku-catalog add all --project-dir packages/my-api # monorepo: write to specific subdir

# Compile catalog to dist/ (for marketplace plugin or Copilot repo)
maku-catalog build [--target claude|copilot|all]

# Schema + reference-graph checks (CI gate, non-zero exit on errors)
maku-catalog validate

# Browse the catalog
maku-catalog list [--language <l>] [--kind <k>]

# Prepare project directory structure
maku-catalog init --target claude|copilot

# Author a new artifact template
maku-catalog new <kind> [--language <l>] [--name <n>]

# Enable shell tab-completion
eval "$(maku-catalog completion)"                  # bash
eval "$(maku-catalog completion zsh)"              # zsh
maku-catalog completion fish | source              # fish
```

See [USAGE.md](./USAGE.md) for detailed examples of every command and scenario.

## How the catalog is structured

```
catalog/
├─ shared/                     ← cross-language, written ONCE
│  ├─ rules/clean-code.rule.md
│  ├─ agents/code-reviewer.agent.md
│  └─ prompts/explain-diff.prompt.md
└─ languages/                  ← one folder per language
   ├─ csharp/
   │  ├─ language.yaml
   │  ├─ rules/dotnet-style.rule.md
   │  │    extends: [shared/clean-code]    ← DRY
   │  └─ skills/xunit-testing/SKILL.md
   │        uses:
   │          rules: [csharp/dotnet-style] ← no duplication
   │          agents: [shared/code-reviewer]
   ├─ python/  └─ …
   └─ react/   └─ …
```

## What the compiler outputs

```bash
maku-catalog build
```

**For Claude Code** (`dist/claude/`):
```
.claude-plugin/marketplace.json        ← /plugin marketplace add ./dist/claude
plugins/dotnet-pack/
  .claude-plugin/plugin.json           ← version matches npm, /plugin update works
  skills/xunit-testing/SKILL.md        ← rule bodies inlined
  agents/code-reviewer.md              ← claude: frontmatter applied
```

**For GitHub Copilot** (`dist/copilot/`):
```
.github/copilot-instructions.md        ← shared baseline rules
.github/instructions/
  csharp-dotnet-style.instructions.md  ← applyTo: "**/*.cs,**/*.csproj"
.github/prompts/
  xunit-testing.prompt.md              ← agent: agent, rule guidance inlined
.github/AGENTS.md                      ← all agents (open standard aggregate)
# or per-file when using `add` (scaffold path):
# .github/agents/<name>.agent.md      ← .agent.md extension + description frontmatter required
```

## Adding a language

1. Create `catalog/languages/<lang>/language.yaml`
2. Add your skills, rules, and agents under `catalog/languages/<lang>/`
3. Add a pack entry to `packs.yaml`
4. Run `npm run validate && npm run catalog:build`

No core code changes. The compiler discovers the new files automatically.

## Contributing an artifact

```bash
# Scaffold a template
maku-catalog new skill --language csharp --name my-new-skill

# Validate
maku-catalog validate

# Build and inspect output
maku-catalog build --target claude
```

See [SPEC.md](./SPEC.md) for the full frontmatter specification and platform mapping table.
See [CLAUDE.md](./CLAUDE.md) for architecture details and build gotchas.

## License

MIT
