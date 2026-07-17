# Consuming the Catalog — Install Skills into Your Project

Run `sigil` from **your project directory**. The catalog source is embedded in the installed
package — you never need to be inside the catalog repo.

## How to invoke `sigil`

| Context                      | Command form                                |
| ---------------------------- | ------------------------------------------- |
| After `npm install -g sigil` | `sigil <cmd>`                               |
| Without installing           | `npx sigil <cmd>`                           |
| Built from source            | `node /path/to/sigil/dist-cli/cli.js <cmd>` |

**Building from source (first time only):**

```bash
cd /path/to/sigil
npm install && npm run build
# → dist-cli/ ready. Now cd to any project and use sigil.
```

---

## Guided wizard (recommended starting point)

Run `sigil add` with no arguments in an interactive terminal:

```bash
sigil add
```

The wizard walks you through five steps:

1. **Target** — Claude Code or GitHub Copilot (auto-detected from `.claude/` / `.github/` at your project root, shown with reason)
2. **Scope** — Everything / By pack / By kind / Pick individually
3. **Artifacts** — when picking individually, an optional "Narrow by language?" step scopes the picker first, then a grouped checkbox list shows artifacts under language headers. For `all` and `kind` scopes, a language filter step appears instead.
4. **Dependencies** — before you decide, the wizard shows the exact rules and agents your selection references via `uses:` frontmatter. These are **author recommendations** — the skill bodies work without them, but the author bundled them as "you'll probably want these too." Yes installs them; No skips them (`--no-deps`).
5. **Conflicts** — whether to overwrite files that already exist.

The **Install plan** box (shown before "Proceed?") previews the full resolved artifact set: your picks tagged `(your pick)` and dependency-closure artifacts tagged `(dependency of <skill-name>)`. After install, a copy-pasteable `sigil add … --yes` command is printed so you can repeat it in CI.

**CI / non-interactive:** the wizard never runs in a piped context. Always pass a selector and `--yes`:

```bash
sigil add all --yes
sigil add skill:csharp/xunit-testing --yes
```

---

## Add a skill to a Claude Code project

Scaffold the xUnit testing skill (+ its rule + agent dependency) into a C# repo:

```bash
# In your C# project root
sigil init --target claude
sigil add skill:csharp/xunit-testing
```

**What gets written:**

```
.claude/skills/xunit-testing/SKILL.md
.claude/skills/xunit-testing/references/assertions.md
.claude/rules/csharp-dotnet-style.md      ← C# style (+ clean-code baseline folded in)
.claude/agents/code-reviewer.md           ← shared code-reviewer agent
```

Claude Code loads `.claude/rules/*.md` natively on every session. The rule and agent are
scaffolded from the `uses:` dependency closure automatically.

```bash
# If .claude/ already exists, init is optional.
# Use --overwrite only if you want to replace existing files:
sigil add skill:csharp/xunit-testing --overwrite
```

---

## Add a skill to a GitHub Copilot project

Add the Python pytest skill to a repo using GitHub Copilot Chat:

```bash
sigil init --target copilot
sigil add skill:python/pytest-testing --target copilot
```

**What gets written:**

```
.github/skills/pytest-testing/SKILL.md
.github/skills/pytest-testing/references/fixtures.md
.github/instructions/python-python-style.instructions.md   ← applyTo: "**/*.py"
.github/agents/code-reviewer.agent.md
```

Copilot Chat picks up `.github/instructions/*.instructions.md` for files matching `applyTo` and
loads `.github/skills/*/SKILL.md` as native Agent Skills (invocable as `/name`).

---

## Install the whole .NET pack as a Claude plugin

Compile and install the plugin so any Claude Code user can `/plugin install dotnet-pack` without
needing this repo locally:

```bash
# 1. Compile from the catalog repo
cd /path/to/sigil
sigil build --target claude
# → writes dist/claude/

# 2. In Claude Code, point at the generated marketplace:
# /plugin marketplace add /path/to/sigil/dist/claude
# /plugin install dotnet-pack
```

**Plugin layout:**

```
dist/claude/
  .claude-plugin/marketplace.json
  plugins/dotnet-pack/
    .claude-plugin/plugin.json     ← version = npm package version
    skills/xunit-testing/SKILL.md  ← rule bodies inlined under ## Applied Rules
    agents/code-reviewer.md
    agents/dotnet-api-architect.md
```

---

## Browse the catalog

```bash
sigil list                      # all artifacts
sigil list --language python    # filter by language
sigil list --kind skill         # filter by kind: skill | agent | rule | prompt
```

**Expected output (all):**

```
SKILL (3)
  csharp/xunit-testing [csharp] — Use when adding or reviewing unit tests in a C#/.NET project.
  python/pytest-testing [python] — Use when adding or reviewing pytest tests in a Python project.
  react/component-testing [react] — Use when writing or reviewing React component tests.

AGENT (4)
  shared/code-reviewer — Thorough code review agent for any language.
  csharp/dotnet-api-architect [csharp] — …

RULE (4)  PROMPT (2)
```

---

## Bulk install

```bash
# All 13 artifacts — Claude Code
sigil add all --target claude --yes

# All artifacts from one pack
sigil add pack:dotnet-pack --target claude --yes

# Full catalog except prompts — GitHub Copilot
sigil add all --target copilot --exclude prompt --yes

# Only agents and rules, no skills or prompts
sigil add all --kind agent,rule --target claude --yes
sigil add kind:agent kind:rule --target claude --yes
```

---

## Install a skill without its dependency closure

By default `add skill:...` writes the skill **plus** the rules and agents it references. Use
`--no-deps` if you manage those separately:

```bash
sigil add skill:csharp/xunit-testing --no-deps --target claude --yes
# Only writes: .claude/skills/xunit-testing/SKILL.md + references/
```

---

## Preview before writing (dry run)

```bash
sigil add all --target claude --dry-run --yes
```

Output shows `+` for new files and `~` for conflicts — nothing is written:

```
Dry run — files that would be written:
  + .claude/agents/code-reviewer.md
  ~ .claude/rules/shared-clean-code.md  (exists — would be overwritten with --overwrite)
  ...
15 new, 1 conflict(s). No files were written.
```

---

## Handle conflicts

Existing files are **never overwritten** by default:

```bash
# First install — 4 files written
sigil add skill:csharp/xunit-testing --yes

# Second install — conflict advisory
sigil add skill:csharp/xunit-testing --yes
# ⚠  4 file(s) already exist and were NOT overwritten.
# Re-run with --overwrite to replace them.

sigil add skill:csharp/xunit-testing --overwrite --yes
```

---

## Enable tab-completion

```bash
# Bash — add to ~/.bashrc
eval "$(sigil completion)"

# Zsh — add to ~/.zshrc
eval "$(sigil completion zsh)"

# Fish
sigil completion fish | source
```

After sourcing: `sigil add <Tab>` suggests `all`, `pack:dotnet-pack`, `kind:skill`,
`skill:csharp/xunit-testing`, etc. Flag values also complete: `--target <Tab>` → `claude copilot`.

---

## Path strategy

- **Catalog source** is embedded in the package — run `sigil` from any directory.
- **Output root** defaults to the current working directory; override with `--project-dir`.

```bash
# Monorepo: install into a specific package
sigil add skill:csharp/xunit-testing --project-dir packages/my-api --yes
```

Claude Code writes to `.claude/`; Copilot writes to `.github/`. Target auto-detection checks for
these directories at the project root. When both exist it defaults to `claude` — override with `--target`.

---

> **Troubleshooting** — wizard hangs, conflicts, schema errors → [reference/troubleshooting.md](../reference/troubleshooting.md)
> **Full flag reference** → [reference/spec.md § CLI reference](../reference/spec.md#cli-reference)
