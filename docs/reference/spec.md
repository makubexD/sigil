# Sigil — Specification v0.1

> **Back to:** [README](../../README.md) · [Documentation index](../index.md)
> **Authoring recipes:** [guides/authoring.md](../guides/authoring.md)

## Overview

The Sigil is a vendor-neutral framework for authoring and distributing AI skills,
agents, rules, prompts, and workflows. Content is written once in a canonical format and compiled
to the native file layout of each AI platform (Claude Code, GitHub Copilot, and others).

---

## Core principles

1. **Single source of truth.** Every artifact lives in exactly one file under `catalog/`. No
   copying or duplication between platforms — the compiler handles that.
2. **DRY through references.** Rules inherit from other rules via `extends`. Skills reference rules
   and agents via `uses`. The compiler resolves these graphs at build time.
3. **Language separation.** Each language has a dedicated folder under `catalog/languages/<lang>/`.
   Adding a new language = adding a new folder. No core code changes.
4. **Extensible targets.** Each AI platform is a Target adapter (`src/targets/<name>/`). Adding a
   new platform = implementing one interface. The canonical source does not change.
5. **Portable by default.** The canonical SKILL.md format is an open cross-tool standard already
   supported by Claude Code, Codex CLI, Gemini CLI, and Cursor. Skill bodies are portable; only
   the surrounding wrappers differ.

---

## Artifact kinds

### skill

A procedural how-to that an AI agent reads when asked to perform a specific task. Emitted as a
native **Agent Skill** on both Claude Code (`.claude/skills/<name>/SKILL.md`) and GitHub Copilot
(`.github/skills/<name>/SKILL.md`) — both follow the same Agent Skills open standard
(agentskills.io). Invoked as `/name` in both tools.

**File:** `catalog/languages/<lang>/skills/<name>/SKILL.md`  
**Invoked as:** `skill:csharp/xunit-testing` in the CLI

```yaml
---
id: csharp/xunit-testing
kind: skill
name: xunit-testing
title: Write xUnit Tests for .NET
description: Use when adding or reviewing unit tests in a C#/.NET project.
language: csharp
appliesTo:
  - '**/*.cs'
  - '**/*.csproj'
uses:
  rules:
    - csharp/dotnet-style # resolves at build time; inherited rules folded in
  agents:
    - shared/code-reviewer # bundled alongside the skill in the plugin
tags: [csharp, testing, xunit]
---
```

### agent

A specialised AI persona with a defined system prompt, scope, and (optionally) platform-specific
model/effort hints.

**File:** `catalog/languages/<lang>/agents/<name>.agent.md`  
**For shared agents:** `catalog/shared/agents/<name>.agent.md`

```yaml
---
id: shared/code-reviewer
kind: agent
name: code-reviewer
title: Code Reviewer
description: Thorough code review agent for any language.
claude: # Claude-namespaced hints; other adapters ignore this block
  model: sonnet
  effort: medium
  maxTurns: 10
---
```

The `claude:` block is intentionally namespaced. If a `copilot:` or `cursor:` block is needed in
future, the pattern is identical — the adapter reads its own namespace and ignores others.

### rule

Coding guidelines that apply to a scope of files. Rules can inherit from other rules via `extends`
(oldest ancestor first); the resolver flattens the chain at build time.

**File:** `catalog/languages/<lang>/rules/<name>.rule.md`  
**For cross-language rules:** `catalog/shared/rules/<name>.rule.md`

```yaml
---
id: csharp/dotnet-style
kind: rule
title: .NET / C# Style
language: csharp
appliesTo: ['**/*.cs', '**/*.csproj']
severity: recommended
extends:
  - shared/clean-code # DRY: inherits the baseline, adds only what is C#-specific
---
```

**Severity:** `required` | `recommended` | `optional`

### prompt

A reusable, parameterised prompt that can be invoked by name.

- **GitHub Copilot:** emitted as a **prompt file** (`.github/prompts/<slug>.prompt.md`), invoked
  as `/slug` in Copilot Chat.
- **Claude Code:** emitted as a **custom command** (`.claude/commands/<slug>.md`), invoked as
  `/slug` in Claude Code.

**File:** `catalog/shared/prompts/<name>.prompt.md` or `catalog/languages/<lang>/prompts/<name>.prompt.md`

```yaml
---
id: shared/explain-diff
kind: prompt
title: Explain a Code Diff
description: Summarise what changed and why it matters.
args:
  - name: diff
    description: The git diff to explain.
    required: true
  - name: audience
    description: 'Who will read this: reviewer, junior, manager'
    required: false
---
```

Use `{{argName}}` in the prompt body. Each adapter translates:

- `{{name}}` → `$name` on Claude Code (named positional arg via `arguments:` frontmatter list)
- `{{name}}` → `${input:name}` on Copilot (VS Code input variable; 2-part form only)

### workflow

An ordered sequence of skill and prompt steps. Emitted as a multi-step command on each platform.

```yaml
---
id: csharp/new-feature-workflow
kind: workflow
title: Ship a New C# Feature
description: Complete workflow from implementation to tested, reviewed PR.
steps:
  - ref: csharp/xunit-testing
    description: Write tests first
  - ref: shared/code-reviewer
    description: Review the implementation
  - ref: shared/explain-diff
    description: Generate the PR description
---
```

---

## Reuse mechanisms

### `extends` (rules only)

```yaml
extends: [shared/clean-code]
```

The resolver walks the `extends` graph and prepends each ancestor's body (oldest first) to the
current rule's body. Cycles are detected at validation time and reported as hard errors.

### `uses` (skills only)

```yaml
uses:
  rules: [csharp/dotnet-style]
  agents: [shared/code-reviewer]
```

The resolver looks up each rule (resolving its own `extends` chain) and records each agent ID.
Adapters then decide how to materialise the closure:

| Adapter | Rules | Agents |
| ------- | ----- | ------ |
| Claude Code (plugin build) | Inlined as `## Applied Rules` section in SKILL.md | Written to `agents/<name>.md` in the pack |
| Claude Code (scaffold/add) | Written to `.claude/rules/<slug>.md` | Written to `.claude/agents/<name>.md` |
| GitHub Copilot | Inlined as `## Coding guidelines to apply` section in SKILL.md | Entry in `AGENTS.md` |

---

## Per-platform artifact models (verified June 2026)

| Catalog kind | Claude Code native artifact | GitHub Copilot native artifact |
| ------------ | --------------------------- | ------------------------------ |
| `skill` | **Agent Skill** — `.claude/skills/<name>/SKILL.md` | **Agent Skill** — `.github/skills/<name>/SKILL.md` |
| `prompt` | **Custom command** — `.claude/commands/<slug>.md` | **Prompt file** — `.github/prompts/<slug>.prompt.md` |
| `agent` | **Subagent** — `.claude/agents/<name>.md` | **Custom agent** — `.github/agents/<name>.agent.md` |
| `rule` (shared) | **Memory rule** — `.claude/rules/<slug>.md` (no path filter) | **Global instructions** — `.github/copilot-instructions.md` |
| `rule` (language) | **Memory rule** — `.claude/rules/<slug>.md` (`paths:` frontmatter) | **Scoped instructions** — `.github/instructions/<slug>.instructions.md` (`applyTo:`) |

**Key vocabulary rules:**

- Claude Code has **no "prompt" artifact** — catalog `prompt` becomes a _custom command_.
- GitHub Copilot has **no "command" artifact** — catalog `prompt` becomes a _prompt file_.
- Both platforms share the **Agent Skills open standard** (`SKILL.md`) for the `skill` kind.
- Claude **built-in commands** (`/model`, `/clear`, `/compact`) control the session and are not catalog artifact types.

## Canonical → platform mapping

| Canonical kind | Claude Code plugin (`dist/claude/`) | Claude Code scaffold (`.claude/`) | GitHub Copilot (`.github/`) |
| -------------- | ----------------------------------- | ---------------------------------- | --------------------------- |
| `skill` | `skills/<name>/SKILL.md` + `references/` | `.claude/skills/<name>/SKILL.md` + `references/` | `skills/<name>/SKILL.md` + `references/` |
| `agent` | `agents/<name>.md` | `.claude/agents/<name>.md` | `agents/<name>.agent.md` |
| `rule` (shared) | folded into skill SKILL.md | `.claude/rules/<slug>.md` (no frontmatter) | `copilot-instructions.md` |
| `rule` (language) | folded into skill SKILL.md | `.claude/rules/<slug>.md` (`paths:` frontmatter) | `instructions/<slug>.instructions.md` |
| `prompt` | `commands/<slug>.md` | `.claude/commands/<slug>.md` | `prompts/<slug>.prompt.md` |
| `workflow` | `commands/<slug>.md` | `.claude/commands/<slug>.md` | `prompts/<slug>.prompt.md` |

**Emitted frontmatter notes:**

- **Claude skill SKILL.md:** uses `paths:` (translated from `appliesTo`). `description` is double-quoted.
- **Copilot skill SKILL.md:** uses only `name` and `description` — no `applyTo` or `paths:`.
- **Copilot prompt files:** use `agent: agent`. `applyTo` is not valid here. Body uses `${input:name}`.
- **Claude custom commands:** `description:`, `argument-hint:`, and `arguments:` frontmatter. Body uses `$name`.
- **Copilot agent files:** require `.agent.md` extension and `description:` frontmatter.
- **`appliesTo` in catalog source stays unchanged** — adapters translate it to `paths:` (Claude) or `applyTo` (Copilot `.instructions.md`).

---

## File conventions

| Path | Contents |
| ---- | -------- |
| `catalog/shared/` | Cross-language artifacts (rules, agents, prompts) |
| `catalog/languages/<lang>/` | Language-specific skills, rules, agents |
| `catalog/languages/<lang>/language.yaml` | Display name, file globs, icon |
| `catalog/languages/<lang>/skills/<name>/SKILL.md` | Skill entry point |
| `catalog/languages/<lang>/skills/<name>/references/` | Supplementary docs bundled with the skill |
| `packs.yaml` | Groups languages into installable packs |
| `schema/*.schema.json` | JSON Schemas for editor autocomplete (generated from zod) |

---

## CLI reference

| Command | Description |
| ------- | ----------- |
| `sigil build [--target claude\|copilot\|all]` | Compile catalog to `dist/` |
| `sigil validate` | Schema + reference-graph checks. Non-zero exit on any error. |
| `sigil list [--language L] [--kind K]` | Browse the catalog |
| `sigil add [selectors...] [flags]` | Scaffold artifact(s) + closure into a project |
| `sigil init --target claude\|copilot` | Initialise project directory structure |
| `sigil new <kind> [--language L] [--name N]` | Author a new artifact template |
| `sigil check <file>` | Validate a single source file |
| `sigil edit <id>` | Update title, description, or tags |
| `sigil delete <id>` | Remove an artifact; warns about dependents |
| `sigil retarget <id>` | Widen or restrict platform targeting |
| `sigil release [level]` | Bump version, rebuild, update CHANGELOG, commit + tag |
| `sigil completion [bash\|zsh\|fish]` | Print shell tab-completion script |

**Selectors for `add` (variadic, combinable):**

| Selector | Expands to |
| -------- | ---------- |
| `all` | Every artifact in the catalog |
| `pack:dotnet-pack` | Every artifact in a named pack |
| `kind:agent` | Every artifact of that kind |
| `skill:csharp/xunit-testing` | One explicit artifact (kind-prefixed) |
| `csharp/xunit-testing` | One explicit artifact (bare ID) |

**Key `add` flags:** `--target claude|copilot`, `--kind skill,agent`, `--exclude prompt`,
`--language csharp`, `--no-deps`, `--dry-run`, `--overwrite`, `--yes`, `--project-dir <dir>`,
`-i / --interactive`.

---

## Versioning

The npm package version (`package.json` `version`) is the single version in v1. The whole catalog
ships as one version:

- **MAJOR** — breaking change to the frontmatter schema or file layout.
- **MINOR** — new artifacts, new languages, new CLI commands.
- **PATCH** — content fixes, typos, documentation.

---

## Extension model

### Adding a language

1. Create `catalog/languages/<lang>/language.yaml`.
2. Add skills, rules, and agents under `catalog/languages/<lang>/`.
3. Add a pack entry to `packs.yaml`.
4. Run `sigil validate && sigil build`.

### Adding a platform target

1. Create `src/targets/<platform>/index.ts` implementing the `Target` interface:
   ```typescript
   export interface Target {
     name: string;
     compile(catalog: ResolvedCatalog, options: CompileOptions): Promise<FileMap>;
     scaffold?(artifactId, catalog, options): Promise<FileMap>; // optional
   }
   ```
2. Register in `src/targets/index.ts` with `registerTarget(new YourTarget())`.
3. The `--target <name>` CLI flag and `dist/<name>/` output directory work automatically.
