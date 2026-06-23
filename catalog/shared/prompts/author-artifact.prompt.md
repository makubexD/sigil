---
id: shared/author-artifact
kind: prompt
title: Author a New Catalog Artifact
description: >-
  Guided authoring workflow for adding a new skill, agent, rule, or prompt to the
  sigil. Interviews you, suggests the right kind and which AIs it propagates
  to, scaffolds the frontmatter, and validates on save. DRY: body authored once,
  emits to every targeted AI automatically.
tags:
  - catalog
  - authoring
  - scaffolding
  - shared
# platforms:     # omit to propagate to ALL supporting AIs (DRY default)
#                # or list: [claude, copilot] to restrict
#                # change later: sigil retarget shared/author-artifact --add <platform>
---

# Author a New Catalog Artifact

When the user wants to add a new artifact to the sigil, follow this structured process.

## Step 1 — Understand the intent

Ask the user what they want the artifact to do. Listen for:
- **Skills** → invocation-based workflows (AI guides a task step-by-step). Keyword: "when I want to..."
- **Agents** → persistent subagents with an ongoing persona. Keyword: "an AI that always..."
- **Rules** → always-on conventions (coding style, naming, patterns). Keyword: "always follow..."
- **Prompts** → parameterised one-shot commands. Keyword: "a command to quickly..."

Suggest the best fit and briefly explain why. If unsure, suggest a skill (most flexible).

## Step 2 — Determine platform targeting

Explain to the user:
> "By default, this artifact will propagate to ALL AIs that support its kind — that's the DRY rule.
> Right now that means: Claude Code and GitHub Copilot (both support skill/agent/rule/prompt).
> You can restrict it with `--platforms claude` if you only want it on one AI.
> You can always widen it later with: `sigil retarget <id> --add <platform>`"

Ask: "Should this go to all AIs (recommended) or only specific ones?" Default to all.

**Platform kind support matrix** (reference):
| Kind     | Claude Code          | GitHub Copilot         |
|----------|----------------------|------------------------|
| skill    | ✓ SKILL.md           | ✓ SKILL.md             |
| agent    | ✓ subagent           | ✓ custom agent         |
| rule     | ✓ memory rule        | ✓ instructions file    |
| prompt   | ✓ custom command     | ✓ prompt file          |

**Vocabulary note**: the same catalog kind has different names per AI. The adapter translates
automatically. Never add "For Claude only:" sections — one body, multiple outputs.

## Step 3 — Gather metadata

Collect the following (suggest sensible defaults):
- **Kind**: confirmed in Step 1.
- **Language**: "Is this for a specific programming language (csharp, python, react) or shared?" Skills require a language; agents, rules, and prompts are optional.
- **Name**: kebab-case, e.g. `ef-core-migrations`. Used as the invocation name.
- **Title**: human-readable, e.g. "EF Core Migrations".
- **Description**: one-liner for catalog listings.
- **Kind extras** (ask only if relevant):
  - *Skill*: "Does it depend on any existing rules or agents? (`uses:`)"
  - *Rule*: "Does it extend an existing rule for DRY inheritance? (`extends:`)"
  - *Agent*: "Should it use a specific Claude model/effort?"
  - *Prompt*: "Does it take any input arguments? (`args:`)"

## Step 4 — Scaffold the file

Build and run the `sigil new` command with the gathered information:

```bash
sigil new <kind> \
  --name <name> \
  --language <lang>        \   # omit for shared
  [--platforms claude]     \   # only if restricting; omit for DRY default
  --catalog-dir catalog/
```

**Examples**:
```bash
# Shared prompt (all AIs, no language):
sigil new prompt --name author-artifact

# Claude-only csharp skill:
sigil new skill --name ef-core-migrations --language csharp --platforms claude

# Shared agent (all AIs):
sigil new agent --name sql-reviewer
```

The command generates a minimal, schema-derived frontmatter header with:
- All required fields as active YAML
- Optional fields as commented hints
- `platforms:` active only when restricted; commented hint otherwise

## Step 5 — Fill in the body

Open the created file. Fill in the title, description, and body.

**DRY constraint (hard rule)**: write the body **once** in neutral language. Never add
AI-specific sections ("For Claude only: ...") — that defeats the DRY architecture. The
adapters translate format and vocabulary automatically.

For a **skill** body:
1. What this skill covers (one sentence)
2. When to invoke it
3. Ordered conventions / patterns / rules

For a **rule** body: bullet points `- **Convention name.** Explanation.`

For an **agent** body: persona definition + when to invoke + behaviour rules

For a **prompt** body: the instruction text, with `{{placeholder}}` for args

## Step 6 — Validate

Run the check command and fix all violations before finishing:

```bash
sigil check <path-to-new-file>
```

Violation categories:
- `Schema:` → fix the frontmatter field against the zod schema
- `id/path` → make sure `id:` matches the file path convention (`<language>/<name>` or `shared/<name>`)
- `platforms:` → platform name is wrong or unsupported for the kind
- `Dependency coverage drift` → a `uses:` dep is restricted to fewer platforms than this artifact

Do not finish until `sigil check` exits 0.

## Step 7 — Summary

Print:
- File path created
- Platforms: `<platform list>` or "all AIs (DRY default)"
- Equivalent CLI command (copy-pasteable)
- Next steps:
  - `npm run validate` — full catalog integrity check
  - `npm run catalog:build` — emit to all targets
  - `sigil retarget <id> --add <platform>` — widen to more AIs later
  - `sigil retarget <id> --remove <platform>` — restrict further
