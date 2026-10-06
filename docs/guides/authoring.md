# Authoring Catalog Artifacts — Recipes

Copy-pasteable walkthroughs for adding a new skill, rule, or language to the catalog.
For the _rules_ of authoring (PR process, quality bar) see [CONTRIBUTING.md](../../CONTRIBUTING.md).
For what each kind is and every frontmatter field, see the [spec](../reference/spec.md#artifact-kinds);
this guide does not repeat it.

You author inside a clone of the sigil repo (see [operations.md § Build and link](operations.md#build-and-link)).
Commands that take `--catalog-dir` default to that clone's `catalog/`, wherever you run them from.
If you are installing artifacts rather than writing them, see [consuming.md](consuming.md).

---

## Add a new skill that reuses an existing rule and agent

**Goal:** add a `csharp/cs-integration-testing` skill that inherits the existing C# style rules
and delegates review to the shared code-reviewer agent.

Naming convention: artifacts in a language namespace carry that language's short prefix in their
name (`cs-` for C#, `py-`, `ts-`, `ng-`, `react-`), so `csharp/cs-generate-tests`, not
`csharp/generate-tests`. `sigil new` uses the `--name` exactly as you type it and `validate` does not
enforce the prefix, so include it yourself. Shared artifacts (`shared/...`) have no prefix and no
`language:`. `--language` must name a registered language (a `languages/<lang>/language.yaml`);
`sigil new` refuses any other, and `sigil check` flags a language folder without one.

```bash
# Scaffold the template (or run `sigil new` with no arguments in a terminal for a guided wizard)
sigil new skill --language csharp --name cs-integration-testing
# → creates catalog/languages/csharp/skills/cs-integration-testing/SKILL.md
```

**Edit the generated file:**

```yaml
---
id: csharp/cs-integration-testing
kind: skill
name: cs-integration-testing
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
# Builds every target: writes dist/claude/ and dist/copilot/ in the sigil clone.
# Use `sigil build --target claude` (or `copilot`) to build just one.
```

### Where an artifact goes

The catalog keeps one rule (see `docs/decisions/catalog-layout-standard-2026-10.md`):

| The content…                                | Goes to                                                                                      |
| ------------------------------------------- | -------------------------------------------------------------------------------------------- |
| does not vary by language                   | `catalog/shared/<kindDir>/`, with no `language:`                                             |
| varies with the project's own language      | `catalog/languages/<lang>/<kindDir>/`, one artifact per language (`template:` once measured) |
| varies with a stack the task itself chooses | one shared **skill** with `references/stack-<stack>.md` files and a table in `SKILL.md`      |

Agents and rules always take the per-language row: they can't load reference files on demand, and
rules activate by path. When the last two rows both seem to fit, choose per-language. Group
artifacts with a pack in `packs.yaml`, never with a topic folder.

### Shared (stack-agnostic) skills

A skill whose guidance applies across stacks omits `language:` and lives under
`catalog/shared/skills/<name>/` (`sigil new skill --name <name>` with no `--language`). Put
per-stack detail in the skill's own `references/` files (e.g. `references/stack-go.md`) and tell
the model in `SKILL.md` when to read each one — the body loads only on invocation and each
reference only when read. Only flat `references/*.md` files ship with a skill, and only regular
files (not symbolic links) with kebab-case names (`stack-go.md`), up to 256 KiB each and 1 MiB per
skill; anything else is skipped with a load warning. `validate` warns
when `SKILL.md` or a reference names a `references/<file>` that doesn't exist, or any `assets/` or
`scripts/` path. Write paths relative to the skill root (the folder holding `SKILL.md`), including
inside reference files. In `SKILL.md`, name each reference with a Markdown link,
``[`references/stack-go.md`](references/stack-go.md)``: Claude's and VS Code's skill docs recommend
links, and VS Code loads only the references `SKILL.md` references. `sync --check`
(`reference-links`) flags a backtick-only mention and `sync --apply` links it. Shared skills belong to no language pack; install them by id
(`sigil add skill:shared/<name>`) or through a non-language pack (`shared/feature` ships in
`pack:spec-driven`, `shared/cli` and `shared/wizard` in `pack:cli-builder`). `shared/cli` and
`shared/wizard` are the worked examples of per-stack
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

`sigil sync --check` fails on a provider literal in a body (`provider-term-leak`). The mechanism is
explained in [architecture.md](../reference/architecture.md).

### Two argument placeholders, two jobs

Both stand for "what the user typed", but they work differently:

|                    | `{{name}}`                                        | `{sigil:arguments}`                                       |
| ------------------ | ------------------------------------------------- | --------------------------------------------------------- |
| Used in            | **Prompt** artifacts only                         | Any artifact body (skills, agents, rules, …)              |
| Declared by        | A named entry in the prompt's `args:` frontmatter | Nothing; it is one fixed token                            |
| Meaning            | One specific named input, for example `{{diff}}`  | The whole argument text as one blob                       |
| Claude Code output | `$name`                                           | `$ARGUMENTS`                                              |
| Copilot output     | `${input:name}` (VS Code asks the user for it)    | the phrase "the request you were given"                   |
| Source             | `src/targets/prompt-args.ts`                      | `src/targets/lexicon.ts` and each provider's `lexicon.ts` |

Rule of thumb: a prompt with named inputs uses `{{name}}`; a skill that acts on whatever the user
asked uses `{sigil:arguments}`. `catalog/shared/prompts/explain-diff.prompt.md` shows `{{diff}}`, and
`catalog/languages/csharp/skills/cs-document/SKILL.md` shows `{sigil:arguments}`.

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
bullets into the TypeScript file. How `extends` and `uses` work is in the
[spec](../reference/spec.md#reuse-mechanisms).

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

# Artifacts that belong to no language go to catalog/shared/ instead (no language: field)
sigil import path/to/.ClaudeTools --shared --yes
```

Pass exactly one of `--language` and `--shared`. A new language needs `--create-language` (or an
existing `language.yaml`); without it the items are refused. A skill comes over with its flat
`references/*.md` files, under the same rules the catalog loads them by, and every file is
trust-scanned (an error-level finding blocks the whole skill). Anything else a skill folder
carries (`assets/`, `scripts/`, nested `references/stacks/`) is listed as not imported: flatten
per-stack folders into `references/stack-<x>.md` first.

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
prefix: go # every artifact name in this language starts with go-
stack: go # a stack declared in catalog/standard.yaml
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

**Step 3 — a skill** (`catalog/languages/go/skills/go-table-tests/SKILL.md`):

```yaml
---
id: go/go-table-tests
kind: skill
name: go-table-tests
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

**Step 4 — put each artifact in its family** (`catalog/standard.yaml`). Every language agent, rule
and skill belongs to exactly one family. Add `go/go-style` to an existing family's `members` (or a
new family), and give each new artifact the family's `sections` in order, if the family declares
any. A family is matched by its member list, never by name, so `go-style` can join `conventions`.
`sigil sync --check` fails (`family-skeleton`) on a member whose sections drift and warns about an
artifact in no family. See
[family-skeleton-standard-2026-10.md](../decisions/family-skeleton-standard-2026-10.md).

**Step 5 — register the pack** (`packs.yaml`):

```yaml
- name: go-pack
  displayName: Go Pack
  description: Go testing skill with its style rule and reviewer agent.
  artifacts:
    - go/go-table-tests
```

List artifact ids explicitly under `artifacts:`, with bare ids and no `kind:` prefix. A skill's rules
and agents (`uses:`) are resolved for you, so you do not list them. The older `languages: [go]` form
(every artifact in a language) still works, but `packs.yaml` recommends explicit lists. The pack's
`name` becomes a Claude plugin of the same name; see
[consuming.md](consuming.md#install-a-pack-as-a-claude-plugin).

**Step 6 — validate and build:**

```bash
sigil validate
# ✓ All N artifact(s) are valid.

sigil build
# → dist/claude/plugins/go-pack/, dist/copilot/.github/ and dist/agents-standard/ (add --target to pick one)
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
and `react-release`.

The three shipped templates (all in `catalog/shared/templates/`) are `code-quality`, `mcp-note`, and
`release-skill`.

Only slot content goes in the artifact body — the shared prose (headings, procedural framing) lives
once in the template and is composed in automatically at build time. `sigil validate` checks:
unknown slot keys, missing required slots, content outside a slot marker, and duplicate markers. The
full slot syntax and composition order are in
[architecture.md § Templates](../reference/architecture.md#templates-one-body-structure-many-artifacts).

### Keeping artifacts in sync with their template

When you edit a template — add/rename/reorder a slot, or hoist a paragraph of prose that used to be
duplicated across artifacts into the shared body — bump the template's `revision:` and run:

```bash
sigil sync                # report: which artifacts drifted, mechanical vs needs-review
sigil sync --apply         # write the mechanical changes (refuses on a dirty working tree)
npm run validate          # any TODO: stub from a new required slot fails here until filled
```

`sigil sync --apply` never touches an artifact that has no `template:`, and prose you rewrote to
mean something different (not just moved) is reported under `review`, not applied automatically.
The full `--check` / `--changed-since` / `--stale` flag set is in the
[CLI reference](../reference/spec.md#cli-reference); running `sigil sync --check` as a CI gate is
covered in [operations.md § CI](operations.md#ci).

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
the file. `move` (alias `rename`) rewrites only `extends`, `uses.rules`, and `uses.agents` in other
artifacts that point at the old id; a skill moves its directory and every other kind moves the single
file. The moved artifact's `language:` follows its new namespace (set for a language, removed for
`shared/`). It does **not** touch `packs.yaml` entries, `claude: { skills: [...] }` lists, or the
moved artifact's own `name:`. After a move, update those by hand (or with `patch`) and run
`sigil validate`. Use `--dry-run` first to see the plan.

## Adding a platform target that skips catalog work entirely

A new **language** never touches `src/`, per the recipe above. A new **platform target** (a third
AI besides Claude Code / Copilot) is `src/`-only and touches no catalog content — see
[Adding a platform target](../reference/architecture.md#adding-a-platform-target).

---

> **Authoring rules & PR process** → [CONTRIBUTING.md](../../CONTRIBUTING.md)
> **Frontmatter schema** → [reference/spec.md](../reference/spec.md)
