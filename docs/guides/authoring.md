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
description: Generate integration tests with WebApplicationFactory or TestContainers.
whenToUse: >-
  Use when writing integration tests with WebApplicationFactory or TestContainers — this is
  the field that actually drives dispatch (skills have no appliesTo/paths — they load by
  description relevance, not file path).
language: csharp
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

### Shared (stack-agnostic) skills

A skill whose guidance applies across stacks omits `language:` and lives under
`catalog/shared/skills/<name>/` (`sigil new skill --name <name>` with no `--language`). Put
per-stack detail in the skill's own `references/` files (e.g. `references/stack-go.md`) and tell
the model in `SKILL.md` when to read each one — the body loads only on invocation and each
reference only when read. Only flat `references/*.md` files ship with a skill: `validate` warns
when `SKILL.md` or a reference names a `references/<file>` that doesn't exist, or any `assets/` or
`scripts/` path. Write paths relative to the skill root (the folder holding `SKILL.md`), including
inside reference files. Shared skills belong to no language pack; install them by id
(`sigil add skill:shared/<name>`) or through a non-language pack (`shared/feature` ships in
`pack:spec-driven`). `shared/cli` and `shared/wizard` are the worked examples of per-stack
references; `shared/feature` shows a stack-less skill with a single `references/examples.md`.

### Provider-neutral bodies: `{sigil:<term>}`

Never write a provider's literal (`CLAUDE.md`, `$ARGUMENTS`, `.claude/rules/`) in a body. Use the
neutral token; each target replaces it at render time (`src/targets/<provider>/lexicon.ts`):

| Token                      | Claude Code       | Copilot                      |
| -------------------------- | ----------------- | ---------------------------- |
| `{sigil:conventions-file}` | `CLAUDE.md`       | `AGENTS.md`                  |
| `{sigil:rules-dir}`        | `.claude/rules/`  | `.github/instructions/`      |
| `{sigil:skills-dir}`       | `.claude/skills/` | `.github/skills/`            |
| `{sigil:arguments}`        | `$ARGUMENTS`      | "the request you were given" |

`sigil sync --check` fails on a provider literal in a body (`provider-term-leak`).

An agent can preload skills on Claude Code with `claude: { skills: [<skill id>] }`. `validate`
rejects an id that isn't a skill, or a skill whose `name` isn't its id's last segment, and
`sigil add` warns when the agent is installed without it.

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

Source→catalog field mapping: rule `paths` → `appliesTo`; agent `tools` (comma string) →
`tools[]`; skill `allowed-tools` → `allowedTools`; `argument-hint` → `argumentHint`;
`disable-model-invocation` → `disableModelInvocation`; skill `when_to_use` → `whenToUse`
(frontmatter-to-frontmatter — it's routing metadata, not body content, so it round-trips through
the field Claude Code actually reads for dispatch, not the body).

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
description: Generate table-driven tests for a Go file or package.
whenToUse: Use when adding or reviewing Go tests, or table-driven test coverage is missing.
language: go
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

## Authoring against a template

Most kinds have some shared body structure, but templating only pays for itself where duplication is
_measured_, not assumed — extract a template because three or more sibling artifacts share verbatim
prose, never because they merely resemble each other (a cross-language audit found most sibling
skills/agents/rules diverge substantially once you look past matching headings — see
[docs/decisions/template-extraction-evidence-2026-08.md](../decisions/template-extraction-evidence-2026-08.md)
for that finding). Three templates ship today in `catalog/shared/templates/`:
`mcp-note` (the four `shared/*.mcp.md` artifacts' shared authoring-hint comment), `code-quality`,
and `release-skill`. Where a `kind: template` artifact exists for your kind
(`catalog/shared/templates/*.template.md`), author against it instead of copying a sibling file —
the `workflow-skill` example below illustrates the mechanism generically for when a genuine
duplication case appears:

```markdown
---
id: typescript/ts-generate-tests
kind: skill
template: shared/templates/workflow-skill # opts into the template
name: generate-tests
title: Generate Unit Tests
---

<!-- slot: whenToUse -->

Use when adding or reviewing unit tests in a TypeScript project.

<!-- slot: steps -->

### Step 1 — Locate the test file

...
```

Only slot content goes in the artifact body — the shared prose (headings, procedural framing) lives
once in the template and is composed in automatically at build time. `sigil validate` checks:
unknown slot keys, missing required slots, content outside a slot marker, and duplicate markers. See
`docs/reference/spec.md` § Templates for the full slot syntax and composition order.

**Keeping artifacts in sync with their template.** When you edit a template — add/rename/reorder a
slot, or hoist a paragraph of prose that used to be duplicated across artifacts into the shared
body — bump the template's `revision:` and run:

```bash
sigil sync                # report: which artifacts drifted, mechanical vs needs-review
sigil sync --apply         # write the mechanical changes (refuses on a dirty working tree)
npm run validate          # any TODO: stub from a new required slot fails here until filled
```

`sigil sync --apply` never touches an artifact that has no `template:`, and prose you rewrote to
mean something different (not just moved) is reported under `review`, not applied automatically —
see `docs/reference/spec.md` § CLI reference for the full `--check` / `--changed-since` / `--stale`
flag set, including the CI-gate usage in `docs/guides/operations.md`.

---

## Command reference: the authoring CRUD surface

Beyond `new` and `delete`, the catalog exposes a full authoring surface:

```bash
sigil get <id>            # show full detail (description, closure, reverse-deps, emit targets)
sigil get <id> --json     # machine-readable
sigil search <query>      # ranked free-text search (--kind, --language, --tag, --json)
sigil patch <id>          # update any schema field (--title, --add-tag, --set-severity, ...)
sigil move <id> <new-id>  # atomic rename — rewrites all referrers + re-validates
sigil import <source-dir> # import a portable Claude template directory into the catalog
```

**`import` command** (`src/authoring/import/`):

Deterministic translator for portable Claude template directories (layout: `rules/*.md`,
`agents/*.md`, `skills/*/SKILL.md`). Translates source frontmatter to catalog frontmatter, assigns
IDs, renders files, and runs per-file `checkSourceArtifact` validation. No AI — reproducible,
CI-safe.

Key flags:

- `--language <lang>` — required; target catalog language key (e.g. `csharp`, `typescript`)
- `--display-name <name>` — overrides the language's `displayName` in generated titles
- `--create-language` — scaffold `language.yaml` if the language dir doesn't exist yet
- `--dry-run` — print the coverage report (source→dest mapping, translated frontmatter, per-file
  validation status, dropped fields) without writing anything
- `--overwrite` — replace existing files (default: skip conflicts)
- `--yes` — non-interactive; required in CI

**Source→catalog field mapping:**

| Kind  | Source field                   | Catalog field                                                        |
| ----- | ------------------------------ | -------------------------------------------------------------------- |
| rule  | `paths`                        | `appliesTo` (default `['**/*']`)                                     |
| rule  | _(none)_                       | `severity: recommended`; `extends: []` synthesized                   |
| agent | `tools` (comma string)         | `tools` (array)                                                      |
| skill | `allowed-tools` (comma string) | `allowedTools` (array) — new optional schema field                   |
| skill | `argument-hint`                | `argumentHint` — new optional schema field                           |
| skill | `disable-model-invocation`     | `disableModelInvocation` — new optional schema field                 |
| skill | `when_to_use`                  | Prepended to body as `## When to Use` section (NOT in description)   |
| all   | _(slug)_                       | `id: <lang>/<slug>`; `title` via slugToTitle; `tags` from slug words |

**Content quality is a separate concern.** The import command produces a mechanical baseline:
`uses: { rules: [], agents: [] }` (empty), `extends: []`, and fallback titles. Wiring deps, setting
`extends: [shared/clean-code]`, and polishing titles are done afterward with `sigil patch`.
See `docs/decisions/catalog-import-migration.md` for the full rationale and a list of open
content-refinement follow-ups.

**`patch` command** (alias `update` — distinct from consumer `update`):

- Kind-aware field registry in `src/authoring/update/descriptors.ts`: common fields (`title`, `description`, `tags`, `version`) + kind-specific (`appliesTo`, `appliesToRationale`, `severity`, `extends`, `uses.*`, `tools`, `claude.*`). Build logic in `src/authoring/update/patch-build.ts`; transactional write in `src/authoring/update/apply.ts`.
- List fields support `--add-<field>` / `--remove-<field>` / `--set-<field>`.
- `appliesToRationale` (rule only) is a scalar set via `--set-applies-to-rationale <text>`; an empty
  string clears it. When `appliesTo` is exactly `['**/*']`, `sigil validate` warns unless this field
  is set — it's the escape hatch for a genuinely file-agnostic rule (e.g. `shared/clean-code`), not
  a place to hide narrowing you meant to do.
- Transactional: after write, re-loads catalog + validates; rolls back the file if blocking violations are found.

**`move` command** (alias `rename`):

- Pure plan phase (`planMove`) then execute phase (`executeMove`) with LIFO rollback steps.
- Rewrites every `extends:` / `uses.rules:` / `uses.agents:` reference to the old id.
- Skills move the whole directory; other kinds move the single file.
- `--dry-run` prints the plan without writing.

## Adding a platform target that skips catalog work entirely

A new **language** never touches `src/`, per the recipe above. A new **platform target** (a third
AI besides Claude Code / Copilot) is `src/`-only and touches no catalog content — see the root
`CLAUDE.md`'s "Adding a platform target" section.

---

> **Authoring rules & PR process** → [CONTRIBUTING.md](../../CONTRIBUTING.md)
> **Frontmatter schema** → [reference/spec.md](../reference/spec.md)
