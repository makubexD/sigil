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
# ✓ All N artifact(s) are valid.

sigil build
# ✓ N file(s) written to dist/claude/
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
sigil patch foo/foo-generate-tests --set-uses-agents shared/code-reviewer
```

Source→catalog field mapping: rule `paths` → `appliesTo`; agent `tools` (comma string) →
`tools[]`; skill `allowed-tools` → `allowedTools`; `argument-hint` → `argumentHint`;
`disable-model-invocation` → `disableModelInvocation`; skill `when_to_use` → `whenToUse`
(frontmatter-to-frontmatter — it's routing metadata, not body content, so it round-trips through
the field Claude Code actually reads for dispatch, not the body).

See [docs/decisions/catalog-import-migration.md](../decisions/catalog-import-migration.md) for
the full field map, known YAML pitfalls (glob patterns, `[` chars in argument hints), and the
content-refinement follow-up checklist. `--display-name` overrides the generated titles;
`--overwrite` replaces an existing catalog file (the default is to skip the conflict).

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
# ✓ All N artifact(s) are valid.

sigil build
# → dist/claude/plugins/go-pack/  and  dist/copilot/.github/
```

No changes to `src/` required.

---

## Authoring against a template

Templatize a same-kind family only after measured body overlap, and fill that template's slots
instead of copying a sibling
([template-extraction evidence](../decisions/template-extraction-evidence-2026-08.md)).
`typescript/ts-release` opts into the shipped `shared/templates/release-skill` template and supplies
only slot content (`catalog/languages/typescript/skills/ts-release/SKILL.md`):

```markdown
---
id: typescript/ts-release
kind: skill
name: ts-release
template: shared/templates/release-skill
---

<!-- slot: quality-gates -->

Discover the combined gate from `package.json` scripts (`check`/`validate`/`ci`/`prepublishOnly`)
and run it; fall back to the type checker, linter, and `scripts.test` separately only if none exists.

**If any gate fails: stop and report.** A release with failing gates is blocked.
```

The other slots on that template are `version-determination`, `changelog-format`, `api-compat-step`,
and `checklist-and-next-steps`. The same template backs `cs-release`, `ng-release`, `py-release`,
and `react-release`. Also shipped in `catalog/shared/templates/`: `mcp-note` and `code-quality`.

Only slot content goes in the artifact body — the shared prose (headings, procedural framing) lives
once in the template and is composed in automatically at build time. `sigil validate` checks:
unknown slot keys, missing required slots, content outside a slot marker, and duplicate markers. See
`docs/reference/architecture.md` § Templates for the full slot syntax and composition order.

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

One example per command. The command list and flags are in the
[CLI reference](../reference/spec.md#cli-reference). Import's field mapping is in
[Import an existing portable-template directory](#import-an-existing-portable-template-directory)
above.

```bash
sigil get csharp/cs-generate-tests
sigil search "generate tests" --kind skill
sigil patch typescript/ts-release --add-tag release
sigil move typescript/ts-old typescript/ts-release --dry-run
sigil import path/to/.ClaudeFoo --language foo --dry-run
```

`patch` has no alias — consumer `sigil update` is a different command. `version` is not patchable.
There is no generic `--set-<field>`: list fields have their own `--add` / `--remove` / `--set`
flags, rule severity is `--severity` (not `--set-severity`), and each target's `authoringFields`
are `--<target>-<key>` (Claude: `--claude-model`, `--claude-effort`, `--claude-max-turns`,
`--claude-isolation`). `whenToUse`, `userInvocable`, and `skillContext` have no `patch` flags; edit
the file. `move` (alias `rename`) rewrites `extends` / `uses.rules` / `uses.agents` referrers; a
skill moves its directory and every other kind moves the single file.

## Adding a platform target that skips catalog work entirely

A new **language** never touches `src/`, per the recipe above. A new **platform target** (a third
AI besides Claude Code / Copilot) is `src/`-only and touches no catalog content — see
[Adding a platform target](../reference/architecture.md#adding-a-platform-target). The root
`CLAUDE.md` has no section by that name.

---

> **Authoring rules & PR process** → [CONTRIBUTING.md](../../CONTRIBUTING.md)
> **Frontmatter schema** → [reference/spec.md](../reference/spec.md)
