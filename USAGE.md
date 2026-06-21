# Usage Guide — Practical Recipes

This file contains copy-pasteable walkthroughs for the most common tasks.

## How to invoke `maku-catalog`

| Context | Command form |
|---|---|
| After `npm install -g @maku/agent-catalog` | `maku-catalog <cmd>` |
| Without installing | `npx @maku/agent-catalog <cmd>` |
| Built from source | `node /path/to/MakuAgentCatalogAI/dist-cli/cli.js <cmd>` |

**Run from your project directory.** The catalog source is embedded in the installed package — you
never need to be inside the catalog repo. Files are written to your current directory (or
`--project-dir` if specified).

```bash
# Build from source first (sets heap flag automatically)
cd /path/to/MakuAgentCatalogAI
npm install && npm run build
# → dist-cli/ ready. Now cd to any project and use:
node /path/to/MakuAgentCatalogAI/dist-cli/cli.js <cmd>
```

---

## Guided interactive installer

### 0. Use the interactive wizard (recommended starting point)

**Goal:** install from the catalog without knowing artifact IDs or flags.

```bash
# In your project root — the catalog is read from the package, not here
maku-catalog add
```

The wizard runs when `add` is called with **no selector** in an interactive terminal. It guides you through:
1. **Target** — Claude Code or GitHub Copilot (auto-detected, shown with reason)
2. **Scope** — Everything / By pack / By kind / Pick individually
3. **Artifacts** — multiselect from the full list (grouped by kind) when picking individually
3b. **Language filter** — shown for *all* and *kind* scopes; each option shows the artifact count for that language
4. **Dependencies** — include the rule/agent closure referenced by skills? An explanatory note describes what the closure is before you answer
5. **Conflicts** — whether to overwrite files that already exist; a note explains the effect of each choice

After confirmation, it runs the install. The final output lists every written file, tagging dependency
files (rules/agents pulled in by skills via `uses:`) with `(dependency)` so you know exactly why they
appeared. A copy-pasteable `maku-catalog add … --yes` command is printed in a box at the very end.

**Non-TTY / CI:** the wizard never runs in a piped or non-interactive context. Provide an explicit
selector instead:
```bash
maku-catalog add all --yes   # non-interactive, CI-safe
```

---

## For consumers — adding skills to a project

### 1. Add a skill to a Claude Code project

**Goal:** scaffold the xUnit testing skill (+ its rule + agent dependency) into a C# repo.

```bash
# In your C# project root
maku-catalog init --target claude
maku-catalog add skill:csharp/xunit-testing
```

**What gets written (relative to your project root):**
```
.claude/skills/xunit-testing/SKILL.md
.claude/skills/xunit-testing/references/assertions.md
.claude/rules/csharp-dotnet-style.md      ← C# style (+ clean-code baseline folded in)
.claude/agents/code-reviewer.md           ← shared code-reviewer agent
```

Claude Code loads `.claude/rules/*.md` natively on every session. The rule and agent are
scaffolded from the `uses:` dependency closure — you don't need to add them manually.

```bash
# If the project already has a .claude/ directory, init is optional.
# Use --overwrite only if you want to replace an existing file:
maku-catalog add skill:csharp/xunit-testing --overwrite
```

---

### 2. Add a skill to a GitHub Copilot project

**Goal:** add the Python pytest skill to a repo using GitHub Copilot Chat.

```bash
maku-catalog init --target copilot
maku-catalog add skill:python/pytest-testing --target copilot
```

**What gets written:**
```
.github/instructions/python-python-style.instructions.md   ← applyTo: "**/*.py"
.github/prompts/pytest-testing.prompt.md                   ← invocable as /pytest-testing
.github/agents/code-reviewer.agent.md                      ← .agent.md + description frontmatter required
```

Copilot Chat picks up `.github/instructions/*.instructions.md` for files matching `applyTo` and
makes `.github/prompts/*.prompt.md` available as `/` commands.

---

### 3. Install the whole .NET pack natively in Claude Code

**Goal:** publish the compiled plugin so any Claude Code user on the team can
`/plugin install dotnet-pack` without needing this repo locally.

```bash
# 1. Compile from the catalog repo
cd /path/to/MakuAgentCatalogAI
maku-catalog build --target claude
# → writes dist/claude/

# 2. (From Claude Code) point at the generated marketplace
# /plugin marketplace add /path/to/MakuAgentCatalogAI/dist/claude
# /plugin install dotnet-pack

# Or copy dist/claude/ to a shared location / commit it to a companion repo
# and point users at the path.
```

**What the plugin contains:**
```
dist/claude/
  .claude-plugin/marketplace.json
  plugins/dotnet-pack/
    .claude-plugin/plugin.json     ← version field = npm package version
    skills/xunit-testing/SKILL.md  ← rule bodies inlined under ## Applied Rules
    agents/code-reviewer.md
    agents/dotnet-api-architect.md
```

---

### 4. Browse the catalog

```bash
# All artifacts
maku-catalog list

# Filter by language
maku-catalog list --language python
maku-catalog list --language csharp

# Filter by kind
maku-catalog list --kind skill
maku-catalog list --kind agent
maku-catalog list --kind rule
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
  …

RULE (4)  PROMPT (1)
```

---

### 4b. Install the full catalog at once (bulk)

```bash
# All 12 artifacts — Claude Code
maku-catalog add all --target claude --yes

# All artifacts from one pack — Claude Code
maku-catalog add pack:dotnet-pack --target claude --yes

# Full catalog except prompts — GitHub Copilot
maku-catalog add all --target copilot --exclude prompt --yes
```

Expected output (full catalog to Claude):
```
✓ 15 file(s) written to <your-project-dir>
  .claude/agents/code-reviewer.md
  .claude/commands/shared-explain-diff.md
  .claude/rules/shared-clean-code.md
  ...
```

### 4c. Install only agents and rules (kind-selective)

```bash
# Claude Code — only agents and rules, no skills or prompts
maku-catalog add all --kind agent,rule --target claude --yes

# Alternatively, use kind: selectors
maku-catalog add kind:agent kind:rule --target claude --yes

# Copilot — only skills and agents
maku-catalog add all --target copilot --kind skill,agent --yes
```

### 4d. Install a skill without its dependency closure (--no-deps)

By default, `add skill:...` writes the skill **plus** the rules and agents it references. Use
`--no-deps` if you manage those separately:

```bash
maku-catalog add skill:csharp/xunit-testing --no-deps --target claude --yes
```

**What gets written:** only `.claude/skills/xunit-testing/SKILL.md` and the `references/`
directory — no `.claude/rules/`, no `.claude/agents/`.

### 4e. Preview before writing (--dry-run)

```bash
maku-catalog add all --target claude --dry-run --yes
```

Output shows `+` for new files and `~` for conflicts (would overwrite) — nothing is written:
```
Dry run — files that would be written:
  + .claude/agents/code-reviewer.md
  ~ .claude/rules/shared-clean-code.md  (exists — would be overwritten with --overwrite)
  ...
15 new, 1 conflict(s). No files were written.
```

### 4f. Handling conflicts

On a second `add`, existing files are listed and **not overwritten** by default:

```bash
# First install
maku-catalog add skill:csharp/xunit-testing --yes
# ✓ 4 file(s) written

# Second install — conflict advisory
maku-catalog add skill:csharp/xunit-testing --yes
# ⚠  4 file(s) already exist and were NOT overwritten: ...
# Re-run with --overwrite to replace them.

# Force overwrite
maku-catalog add skill:csharp/xunit-testing --overwrite --yes
```

### 4g. Enable tab-completion in your shell

```bash
# Bash — add to ~/.bashrc
eval "$(maku-catalog completion)"

# Zsh — add to ~/.zshrc
eval "$(maku-catalog completion zsh)"

# Fish
maku-catalog completion fish | source
```

After sourcing: `maku-catalog add <Tab>` suggests `all`, `pack:dotnet-pack`, `kind:skill`,
`skill:csharp/xunit-testing`, etc. Flag values also complete: `--target <Tab>` → `claude copilot`.

### 4h. Where files get installed (path strategy)

The CLI resolves the catalog from the installed package automatically — **you never need to cd to the
catalog repo**. Just run from your project root.

**Claude Code** and **Copilot** read from fixed, tool-mandated locations. The catalog always
writes to those locations:
- Claude Code: `.claude/skills/`, `.claude/rules/`, `.claude/agents/`, `.claude/commands/`
- GitHub Copilot: `.github/instructions/`, `.github/prompts/`, `.github/agents/`

The only variable is the **root**: point `--project-dir` at whichever directory should be the root.

```bash
# Monorepo: install into a specific package
maku-catalog add skill:csharp/xunit-testing --project-dir packages/my-api --yes

# Install at the repo root (default = current working directory)
maku-catalog add skill:csharp/xunit-testing --yes
```

Target auto-detection checks for `.claude/` or `.github/` at the given root. When both exist,
it defaults to `claude` and tells you — override with `--target` if needed.

---

## For authors — adding artifacts to the catalog

### 5. Add a new skill that reuses an existing rule and agent

**Goal:** add a `csharp/integration-testing` skill that inherits the existing C# style rules
and delegates review to the shared code-reviewer agent.

```bash
# Scaffold the template (run from inside the catalog repo)
maku-catalog new skill --language csharp --name integration-testing
# → creates catalog/languages/csharp/skills/integration-testing/SKILL.md
```

**Edit the generated file:**

```yaml
---
id: csharp/integration-testing
kind: skill
name: integration-testing
title: Write Integration Tests for .NET
description: Use when writing integration tests with WebApplicationFactory or TestContainers.
language: csharp
appliesTo:
  - "**/*.cs"
  - "**/*Tests.cs"
uses:
  rules:
    - csharp/dotnet-style      # inherits clean-code baseline automatically
  agents:
    - shared/code-reviewer
tags: [csharp, testing, integration]
---

# Write Integration Tests for .NET

When asked to write integration tests:
1. Use `WebApplicationFactory<Program>` for in-process HTTP testing.
2. Prefer `TestContainers` for database dependencies (never mock the database in integration tests).
3. …
```

**Validate and build:**
```bash
maku-catalog validate
# ✓ All 13 artifact(s) are valid.

maku-catalog build
# 17 file(s) written to dist/claude/
```

---

### 6. Add a rule that extends the shared baseline (DRY)

**Goal:** add a `typescript/ts-style` rule that gets the clean-code bullets for free.

```bash
maku-catalog new rule --language typescript --name ts-style
# → creates catalog/languages/typescript/rules/ts-style.rule.md
```

**Edit:**
```yaml
---
id: typescript/ts-style
kind: rule
title: TypeScript Style
language: typescript
appliesTo:
  - "**/*.ts"
  - "**/*.tsx"
severity: recommended
extends:
  - shared/clean-code      # ← DRY: baseline bullets prepended at build time
---

- Prefer `type` over `interface` for object shapes unless declaration merging is needed.
- Use `unknown` instead of `any`; narrow with type guards.
- Annotate all exported function return types explicitly.
```

The resolver emits the clean-code body + ts-style body oldest-first. You never copy those
baseline bullets into the TypeScript file.

---

### 7. Add a brand-new language end-to-end

**Goal:** onboard Go as a new language with one rule and one skill.

**Step 1 — language descriptor** (`catalog/languages/go/language.yaml`):
```yaml
name: go
displayName: Go
icon: 🐹
globs:
  - "**/*.go"
  - "**/go.mod"
  - "**/go.sum"
```

**Step 2 — a rule** (`catalog/languages/go/rules/go-style.rule.md`):
```yaml
---
id: go/go-style
kind: rule
title: Go Style
language: go
appliesTo:
  - "**/*.go"
severity: recommended
extends:
  - shared/clean-code
---

- Follow standard Go formatting (`gofmt`); never submit unformatted code.
- Return errors as values; avoid panic except in init code.
- Use table-driven tests with `t.Run` subtests.
```

**Step 3 — a skill** (`catalog/languages/go/skills/table-tests/SKILL.md`):
```yaml
---
id: go/table-tests
kind: skill
name: table-tests
title: Write Table-Driven Tests in Go
description: Use when adding or reviewing Go tests.
language: go
appliesTo:
  - "**/*_test.go"
uses:
  rules:
    - go/go-style
  agents:
    - shared/code-reviewer
tags: [go, testing]
---
# Write Table-Driven Tests in Go
…instructions…
```

**Step 4 — register the pack** (in `packs.yaml`):
```yaml
  - name: go-pack
    displayName: Go Pack
    languages: [go]
```

**Step 5 — validate and build:**
```bash
maku-catalog validate
# ✓ All 15 artifact(s) are valid.

maku-catalog build
# → dist/claude/plugins/go-pack/  and  dist/copilot/.github/
```

No changes to `src/` required.

---

## For maintainers & CI

### 8. Validation as a CI gate

`validate` exits non-zero on any schema error, dangling `extends`/`uses` reference, or cycle.

```yaml
# .github/workflows/ci.yml (example)
- name: Validate catalog
  run: |
    npm ci
    npm run build
    npm run validate
```

**Testing the gate works** — temporarily break a reference:

```bash
# In any SKILL.md, add a non-existent rule:
#   uses:
#     rules: [csharp/does-not-exist]

maku-catalog validate
# ✗  [csharp/xunit-testing] uses.rules references unknown artifact 'csharp/does-not-exist'
# ✗ 1 error(s) found.
# exit code 1
```

Cycle detection: if rule A `extends` B and B `extends` A, validate reports a cycle error.

---

### 9. Build both targets and inspect output

```bash
# Build everything
maku-catalog build --target all
# → dist/claude/ and dist/copilot/

# Build a single target
maku-catalog build --target claude
maku-catalog build --target copilot

# Inspect what was generated
ls dist/claude/plugins/dotnet-pack/skills/xunit-testing/
# SKILL.md  references/

# Verify rule bodies are inlined in the plugin SKILL.md
grep "Applied Rules" dist/claude/plugins/dotnet-pack/skills/xunit-testing/SKILL.md
# ## Applied Rules

# Verify plugin.json carries the package version
cat dist/claude/plugins/dotnet-pack/.claude-plugin/plugin.json
# { "name": "dotnet-pack", "version": "0.1.0", … }

# Regenerate JSON Schemas from zod (also runs automatically as part of npm run build)
node dist-cli/schema/emit.js
# ✓ schema/skill.schema.json
# ✓ schema/agent.schema.json
# ✓ schema/rule.schema.json
# ✓ schema/prompt.schema.json
# ✓ schema/workflow.schema.json
```

---

## Reference

| Command | When to use |
|---|---|
| `validate` | Before every build, in CI. Catches broken references and cycles. |
| `build --target claude` | Prepare the Claude plugin layout for distribution. |
| `build --target copilot` | Prepare `.github/` files for a Copilot-enabled repo. |
| `add skill:<id>` | Scaffold a skill + its full dependency closure into a project. |
| `list --kind rule` | Audit what's available before authoring duplicates. |
| `new <kind> --language <l>` | Start a new artifact with the correct frontmatter template. |

See [SPEC.md](./SPEC.md) for the complete frontmatter reference and platform mapping table.
