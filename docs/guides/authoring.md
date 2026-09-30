# Authoring Catalog Artifacts — Recipes

Copy-pasteable walkthroughs for adding a new skill, rule, or language to the catalog.
For the _rules_ of authoring (kinds, DRY, PR process) see [CONTRIBUTING.md](../../CONTRIBUTING.md).

---

## Add a new skill that reuses an existing rule and agent

**Goal:** add a `csharp/integration-testing` skill that inherits the existing C# style rules
and delegates review to the shared code-reviewer agent.

```bash
# Scaffold the template (run from inside the catalog repo)
sigil new skill --language csharp --name integration-testing
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
    - csharp/cs-conventions      # inherits clean-code baseline automatically
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
sigil validate
# ✓ All 14 artifact(s) are valid.

sigil build
# 17 file(s) written to dist/claude/
```

---

## Add a rule that extends the shared baseline (DRY)

**Goal:** add a `typescript/ts-style` rule that gets the clean-code bullets for free.

```bash
sigil new rule --language typescript --name ts-style
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
  - '**/*.ts'
  - '**/*.tsx'
severity: recommended
extends:
  - shared/clean-code # DRY: baseline bullets prepended at build time
---
- Prefer `type` over `interface` for object shapes unless declaration merging is needed.
- Use `unknown` instead of `any`; narrow with type guards.
- Annotate all exported function return types explicitly.
```

The resolver emits the clean-code body + ts-style body oldest-first. You never copy the baseline
bullets into the TypeScript file.

---

## Import an existing portable-template directory

**Goal:** fold a pre-built Claude template directory (the `rules/` · `agents/` · `skills/` layout)
into the catalog as schema-validated artifacts.

```bash
# Preview — coverage report shows source→dest mapping, dropped fields, any unclassified files
sigil import path/to/.ClaudeFoo --language foo --create-language --dry-run

# Self-review the coverage report, correct any issues, then execute:
sigil import path/to/.ClaudeFoo --language foo --create-language --yes

# Wire deps, polish titles (content-refinement stage, separate from mechanical import)
sigil patch foo/foo-generate-tests --set-uses.agents='["shared/code-reviewer"]'
```

Source→catalog field mapping: `paths` → `appliesTo`; `tools` (comma string) → `tools[]`;
`allowed-tools` → `allowedTools`; `argument-hint` → `argumentHint`;
`disable-model-invocation` → `disableModelInvocation`; `when_to_use` → prepended to body.

See [docs/decisions/catalog-import-migration.md](../decisions/catalog-import-migration.md) for
the full field map, known YAML pitfalls (glob patterns, `[` chars in argument hints), and the
content-refinement follow-up checklist.

---

## Add a brand-new language end-to-end

**Goal:** onboard Go as a new language with one rule and one skill.

**Step 1 — language descriptor** (`catalog/languages/go/language.yaml`):

```yaml
name: go
displayName: Go
icon: 🐹
globs:
  - '**/*.go'
  - '**/go.mod'
  - '**/go.sum'
```

**Step 2 — a rule** (`catalog/languages/go/rules/go-style.rule.md`):

```yaml
---
id: go/go-style
kind: rule
title: Go Style
language: go
appliesTo:
  - '**/*.go'
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
  - '**/*_test.go'
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

**Step 4 — register the pack** (`packs.yaml`):

```yaml
- name: go-pack
  displayName: Go Pack
  languages: [go]
```

**Step 5 — validate and build:**

```bash
sigil validate
# ✓ All 15 artifact(s) are valid.

sigil build
# → dist/claude/plugins/go-pack/  and  dist/copilot/.github/
```

No changes to `src/` required.

---

> **Authoring rules & PR process** → [CONTRIBUTING.md](../../CONTRIBUTING.md)
> **Frontmatter schema** → [reference/spec.md](../reference/spec.md)
