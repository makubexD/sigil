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
**For stack-agnostic skills:** `catalog/shared/skills/<name>/SKILL.md` (omit `language:`)  
**Invoked as:** `skill:csharp/cs-generate-tests` in the CLI

```yaml
---
id: csharp/cs-generate-tests
kind: skill
name: xunit-testing
title: Write xUnit Tests for .NET
description: Generate an xUnit test suite for a C# file or class.
whenToUse: >-
  Use when adding or reviewing unit tests in a C#/.NET project — this is what actually
  drives model-invoked dispatch (see the "Emitted frontmatter notes" section below); no
  `appliesTo` field exists for skills, since they load by description relevance, not file path.
language: csharp
uses:
  rules:
    - csharp/cs-conventions # resolves at build time; inherited rules folded in
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
  skills: [shared/cli] # preloaded into the subagent at startup; emitted as `skills: [cli]`
---
```

`claude.skills` takes catalog skill **ids** (checked by `validate` like `uses:`) and is emitted as
Claude Code's subagent `skills:` field with each skill's name. Preloading injects the skill's
`SKILL.md`, not its `references/`, so the agent still reads any reference file it needs. Author it
only on agents whose skill is scaffolded alongside them: plugin skills are namespaced
(`<plugin>:<name>`).

The `claude:` block is intentionally namespaced. If a `copilot:` or `cursor:` block is needed in
future, the pattern is identical — the adapter reads its own namespace and ignores others.

### rule

Coding guidelines that apply to a scope of files. Rules can inherit from other rules via `extends`
(oldest ancestor first); the resolver flattens the chain at build time.

**File:** `catalog/languages/<lang>/rules/<name>.rule.md`  
**For cross-language rules:** `catalog/shared/rules/<name>.rule.md`

```yaml
---
id: csharp/cs-conventions
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

**`appliesToRationale`** (optional): required in practice when `appliesTo` is exactly `['**/*']` —
`sigil validate` warns that an unscoped `appliesTo` buys no residency benefit unless
`appliesToRationale` explains why it's deliberate (e.g. a language-agnostic baseline rule, or a git
rule that governs workflow rather than any particular file). Editable via
`sigil patch --set-applies-to-rationale <text>`; shown by `sigil get`.

### prompt

A reusable, parameterised prompt that can be invoked by name.

- **GitHub Copilot:** emitted as a **prompt file** (`.github/prompts/<slug>.prompt.md`), invoked
  as `/slug` in Copilot Chat.
- **Claude Code:** emitted as a **user-invoked skill** (`.claude/skills/<slug>/SKILL.md`,
  `disable-model-invocation: true`), invoked as `/slug` in Claude Code. Formerly a custom command
  at `.claude/commands/<slug>.md` — Anthropic merged custom commands into skills (see
  `src/targets/doc-refs.ts`'s `CLAUDE_SKILLS_DOC`); sigil no longer writes the legacy path, though
  Claude Code still reads it if a project has old files there.

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
  - ref: csharp/cs-generate-tests
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
  rules: [csharp/cs-conventions]
  agents: [shared/code-reviewer]
```

The resolver looks up each rule (resolving its own `extends` chain) and records each agent ID.
Adapters then decide how to materialise the closure:

| Adapter                    | Rules                                                          | Agents                                    |
| -------------------------- | -------------------------------------------------------------- | ----------------------------------------- |
| Claude Code (plugin build) | Inlined as `## Applied Rules` section in SKILL.md              | Written to `agents/<name>.md` in the pack |
| Claude Code (scaffold/add) | Written to `.claude/rules/<slug>.md`                           | Written to `.claude/agents/<name>.md`     |
| GitHub Copilot             | Inlined as `## Coding guidelines to apply` section in SKILL.md | Entry in `AGENTS.md`                      |

---

## Per-platform artifact models

Sourced from `src/targets/doc-refs.ts` — the one place provider doc URLs are declared; every entry
there carries a `verifiedOn` date and is staleness-tracked by `sigil sync --stale` (see § Templates
below for what that command checks).

| Catalog kind       | Claude Code native artifact                                                   | GitHub Copilot native artifact                                                                                               |
| ------------------ | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `skill`            | **Agent Skill** — `.claude/skills/<name>/SKILL.md`                            | **Agent Skill** — `.github/skills/<name>/SKILL.md`                                                                           |
| `prompt`           | **User-invoked skill** — `.claude/skills/<slug>/SKILL.md`                     | **Prompt file** — `.github/prompts/<slug>.prompt.md`                                                                         |
| `agent`            | **Subagent** — `.claude/agents/<name>.md`                                     | **Custom agent** — `.github/agents/<name>.agent.md`                                                                          |
| `rule` (repo-wide) | **Memory rule** — `.claude/rules/<slug>.md` (no `appliesTo` → no path filter) | **Global instructions** — `.github/copilot-instructions.md` (full build); an `applyTo: "**"` instructions file (`sigil add`) |
| `rule` (scoped)    | **Memory rule** — `.claude/rules/<slug>.md` (`paths:` frontmatter)            | **Scoped instructions** — `.github/instructions/<slug>.instructions.md` (`applyTo:`), with or without a `language`           |
| `workflow`         | **User-invoked skill** — `.claude/skills/<slug>/SKILL.md`                     | **Prompt file** — `.github/prompts/<slug>.prompt.md`                                                                         |

**Key vocabulary rules:**

- Claude Code has **no "prompt" artifact** — catalog `prompt` becomes a _user-invoked skill_
  (`disable-model-invocation: true`, same trigger-only semantics the retired custom-command format
  had).
- GitHub Copilot has **no "command" artifact** — catalog `prompt` becomes a _prompt file_.
- Both platforms share the **Agent Skills open standard** (`SKILL.md`) for the `skill` kind — and,
  on Claude Code, for `prompt`/`workflow` too, now that custom commands have merged into it.
- `workflow` maps to a user-invoked skill on Claude Code and a prompt file on Copilot, same as
  `prompt`. Its `steps:` frontmatter field is rendered as a markdown checklist in the body.
- Claude **built-in commands** (`/model`, `/clear`, `/compact`) control the session and are not
  catalog artifact types. Claude Code's own **dynamic workflows** feature
  (`.claude/workflows/*.js`) is unrelated to sigil's `workflow` kind — see `spec/workflow.ts`'s
  header comment for the naming collision.

## Canonical → platform mapping

| Canonical kind     | Claude Code plugin (`dist/claude/`)      | Claude Code scaffold (`.claude/`)                | GitHub Copilot (`.github/`)              |
| ------------------ | ---------------------------------------- | ------------------------------------------------ | ---------------------------------------- |
| `skill`            | `skills/<name>/SKILL.md` + `references/` | `.claude/skills/<name>/SKILL.md` + `references/` | `skills/<name>/SKILL.md` + `references/` |
| `agent`            | `agents/<name>.md`                       | `.claude/agents/<name>.md`                       | `agents/<name>.agent.md`                 |
| `rule` (repo-wide) | folded into skill SKILL.md               | `.claude/rules/<slug>.md` (no frontmatter)       | `copilot-instructions.md`                |
| `rule` (scoped)    | folded into skill SKILL.md               | `.claude/rules/<slug>.md` (`paths:` frontmatter) | `instructions/<slug>.instructions.md`    |
| `prompt`           | — (not packaged into plugins yet)        | `.claude/skills/<slug>/SKILL.md`                 | `prompts/<slug>.prompt.md`               |
| `workflow`         | `skills/<slug>/SKILL.md`                 | `.claude/skills/<slug>/SKILL.md`                 | `prompts/<slug>.prompt.md`               |

**Emitted frontmatter notes:**

- **Claude skill SKILL.md:** `description` is double-quoted. Skills have **no `paths:` equivalent** —
  Claude Code loads skills by description relevance, not file path; `paths:` is a `.claude/rules/*.md`-only
  mechanism (see the `rule (language)` row above). Optional skill fields: `when_to_use: "<text>"` (from
  `whenToUse` — trigger phrases the model matches against; this is what actually drives model-invoked
  dispatch, distinct from `description`), `allowed-tools: <csv>` (from `allowedTools`), `argument-hint:
"<hint>"` (from `argumentHint`), `disable-model-invocation: true` (from `disableModelInvocation`),
  `user-invocable: false` (from `userInvocable`), `context: fork` (from `skillContext`) — `argument-hint`,
  `disable-model-invocation`, `user-invocable`, and `context` are Claude-only and skipped entirely in
  Copilot's SKILL.md output.
- **Copilot skill SKILL.md:** frontmatter is `name`, `description`, and `allowed-tools: <csv>` (from
  `allowedTools` — valid outside Claude Code per the Agent Skills spec's six-field list,
  `AGENT_SKILLS_SPEC_DOC`) — no `applyTo`, `paths:`, `when_to_use`, or any Claude-only field.
  `argumentHint` has no Copilot frontmatter equivalent (`argument-hint` is a documented hard error
  outside Claude Code) and instead renders as a `**Arguments:** <hint>` body line, the same pattern
  `whenToUse` already used for its own `## When to Use` body section — see `copilot/spec/skill.ts`.
- **Copilot prompt files:** use `agent: agent`. `applyTo` is not valid here. Body uses `${input:name}` (2-part VS Code input variable form only).
- **Claude prompt/workflow (user-invoked skills):** `name:`, `description:`, `argument-hint:`, `arguments:` (YAML list), and `disable-model-invocation: true` frontmatter. Body uses `$name` (via the `arguments:` list).
- **Copilot agent files:** require `.agent.md` extension and `description:` frontmatter.
- **`appliesTo` on rules stays unchanged in catalog source** — adapters translate it to `paths:` (Claude)
  or `applyTo` (Copilot `.instructions.md`). The translation is language-independent: a language-less
  shared rule with `appliesTo` still emits `paths:`/`applyTo:` — it is never gated on `language` being
  set. **Skills never had a valid use for `appliesTo`** on either platform and the field was removed
  from `SkillSchema` — see the decision log entry on skill-dispatch fixes.
- **Flat `marketplace.json`** (`name`/`owner`/`plugins[]`) is emitted only by the Claude Code plugin build (`dist/claude/`) — Copilot has no equivalent manifest.

---

## File conventions

| Path                                                 | Contents                                                  |
| ---------------------------------------------------- | --------------------------------------------------------- |
| `catalog/shared/`                                    | Cross-language artifacts (skills, rules, agents, prompts) |
| `catalog/languages/<lang>/`                          | Language-specific skills, rules, agents                   |
| `catalog/languages/<lang>/language.yaml`             | Display name, file globs, icon                            |
| `catalog/languages/<lang>/skills/<name>/SKILL.md`    | Skill entry point                                         |
| `catalog/languages/<lang>/skills/<name>/references/` | Supplementary docs bundled with the skill                 |
| `catalog/shared/skills/<name>/SKILL.md`              | Stack-agnostic (language-less) skill, plus `references/`  |
| `packs.yaml`                                         | Curated bundles (explicit `artifacts:` or `languages:`)   |
| `schema/*.schema.json`                               | JSON Schemas for editor autocomplete (generated from zod) |

---

## CLI reference

Generated from `node dist-cli/cli.js --help` — regenerate the same way rather than hand-editing, so
this table cannot drift from `src/cli.ts` again.

| Command                            | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sigil build`                      | Compile the catalog to `dist/<target>/`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `sigil validate`                   | Validate all catalog artifacts (schema + reference integrity). Exits non-zero on errors.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `sigil index`                      | Emit `dist/registry.json` — flat per-artifact index with sha256 + facets.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `sigil list`                       | List catalog artifacts, optionally filtered by language and/or kind.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `sigil get\|show <id>`             | Show full detail for a single catalog artifact (closure, targets, dest paths).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `sigil search <query>`             | Free-text search the catalog (id, title, description, tags). Ranked results.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `sigil add [selectors...]`         | Scaffold artifact(s) + their dependency closure into a consumer project. Guided wizard when called with no selector in a TTY.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `sigil init`                       | Prepare a consumer project for a target platform.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `sigil new [kind]`                 | Scaffold an authoring template for a new catalog artifact. Guided wizard when called with no args in a TTY.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `sigil check [files...]`           | Validate catalog source artifact files (schema, id/path/language, references, platforms). Exits non-zero on violations.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `sigil import <source-dir>`        | Import a portable Claude template directory into the catalog as first-class artifacts.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `sigil status`                     | Show health status of artifacts installed in a consumer project. `reason` names _why_ a non-up-to-date entry is that way (e.g. a template revision bump, missing files, local edits).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `sigil update [ids...]`            | Refresh installed artifacts to the current bundled catalog version, including hook/settings/mcp fragments the catalog changed. Skips drifted files and edited config values unless `--force`. No ids = update everything.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `sigil sync [template-id]`         | **Catalog-author side of propagation.** Two analyzers share one report/`--check`/`--apply` surface: template drift (artifact content vs its declared `template:`, `mechanical` vs `review`) and **conformance** (every catalog artifact vs the current provider standard — `src/commands/sync/conformance/`, see below), plus stale `docs:` citations. Omit `template-id` to scan every template. `--check` exits non-zero on drift, a conformance error, or a stale doc; `--apply` writes mechanical fixes for both analyzers (refuses on a dirty tree); `--apply --editorial` also runs the model-backed conformance pass; `--rule`/`--kind`/`--language`/`--provider` scope conformance for mass-change review; `--changed-since <ref>` scopes template drift to a diff; `--stale <months>` tunes doc-staleness (default 6); `--json` for machine-readable output. |
| `sigil uninstall <ids...>`         | Remove installed artifacts from a consumer project. Refcount-aware.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `sigil patch <id>`                 | Update any field(s) of an existing catalog artifact. Transactional: rolls back on validation failure.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `sigil move\|rename <id> <new-id>` | Rename/relocate a catalog artifact and rewrite all referrers. Transactional.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `sigil retarget <id>`              | Change platform targeting of a catalog artifact without touching its body.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `sigil edit <id>`                  | Update title, description, and tags. Use `sigil patch` for all other fields.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `sigil delete\|remove <id>`        | Remove a catalog artifact from the source. Prompts for confirmation unless `--yes`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `sigil completion [shell]`         | Print a shell tab-completion script (bash, zsh, or fish).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `sigil release [level]`            | Bump version (patch\|minor\|major\|x.y.z), rebuild, update CHANGELOG, commit + tag. Does NOT push.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

**Selectors for `add` (variadic, combinable):**

| Selector                         | Expands to                            |
| -------------------------------- | ------------------------------------- |
| `all`                            | Every artifact in the catalog         |
| `pack:dotnet-pack`               | Every artifact in a named pack        |
| `kind:agent`                     | Every artifact of that kind           |
| `skill:csharp/cs-generate-tests` | One explicit artifact (kind-prefixed) |
| `csharp/cs-generate-tests`       | One explicit artifact (bare ID)       |

**Key `add` flags:** `--target claude|copilot`, `--kind skill,agent`, `--exclude prompt`,
`--language csharp`, `--no-deps`, `--dry-run`, `--overwrite`, `--yes`, `--project-dir <dir>`,
`-i / --interactive`.

**TTY/CI guard:** when `add` is run with no selector and stdin/stdout is not a TTY, it exits
non-zero with a usage hint instead of hanging — always pass a selector and `--yes` in CI
(see `docs/reference/troubleshooting.md`).

---

## Trust scanning

`src/trust/scan/` — a pure, side-effect-free scanner (`scanner.ts`, `rules.ts`, `types.ts`,
`allowlist.ts`) that runs over artifact content before it's authored or installed.

- **11 rules** across two namespaces: `secret/*` (AWS keys, Anthropic/OpenAI/GitHub tokens, bearer
  tokens, generic API keys) and `injection/*` (jailbreak overrides, "ignore previous instructions",
  role-switch, data-exfil URL patterns).
- **Severity:** `error` (fails `sigil check --trust --strict`) or `warn` (surface only).
- **Allowlist:** inline `<!-- sigil-allow: rule/id -->` in the file body, or a per-project
  `.sigil/allow.json` `{ "allow": [...] }`.
- Binary extensions (`.png`, `.jpg`, `.pdf`, etc.) are skipped entirely.

Surfaced by `sigil check <file> --trust` (authoring time); `--strict` makes warnings fail too.
`sigil add` / `update` do not run the scanner.

---

## Versioning

The npm package version (`package.json` `version`) is the single version in v1. The whole catalog
ships as one version:

- **MAJOR** — breaking change to the frontmatter schema or file layout.
- **MINOR** — new artifacts, new languages, new CLI commands.
- **PATCH** — content fixes, typos, documentation.

---

## Extension model

Three independent axes, each with exactly one owner. Scaling to a new language, a new platform, or a
new kind is additive in every case — none of them requires editing another axis's files.

| Axis                                       | Owner                                                                     | Scales by                                                                                         |
| ------------------------------------------ | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| **Kind** (what an artifact _is_)           | `KIND_REGISTRY` (`src/kinds.ts`) + one zod schema (`src/schema/index.ts`) | one registry entry per new kind                                                                   |
| **Provider** (where it goes)               | `registerTarget()` + `src/targets/<provider>/`                            | one directory per new provider                                                                    |
| **Kind × Provider** (how it renders there) | `src/targets/<provider>/spec/<kind>.ts`                                   | one small file per `native` (kind, channel) pair; support itself is declared in `capabilities.ts` |

Two extension points keep the axes from leaking into each other — see them worked through below:
**frontmatter namespaces** (a provider's own fields never touch the neutral schema) and **template
slots** (a provider can rearrange a body without a catalog-side change).

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
     capabilities: TargetCapabilities; // see step 4
     compile(catalog: ResolvedCatalog, options: CompileOptions): Promise<FileMap>;
     scaffold?(artifactId, catalog, options): Promise<FileMap>; // optional
   }
   ```
2. Register in `src/targets/index.ts` with `registerTarget(new YourTarget())`.
3. The `--target <name>` CLI flag and `dist/<name>/` output directory work automatically.
4. Declare kind support once, in `src/targets/<platform>/capabilities.ts`: a `TargetCapabilities`
   (`src/targets/capability-types.ts`) with one row per kind for each channel the platform has
   (`scaffold`, and `plugin` if it ships marketplace plugins) — `native`, `via` (carried inside
   another artifact, with a doc citation), or `none` (warn-and-skip on `sigil add`, with a
   reason rendered in the generated matrix). The `Record<ArtifactKind, …>` type makes a missing kind a compile error. Nothing else
   hand-lists kinds: selection's warn-and-skip, `validate`'s platform checks, the wizard and the
   plugin assembler all read the table through `src/targets/capabilities.ts`, and `npm run build`
   regenerates the matrix in [capabilities.md](capabilities.md) from it.
5. For each kind the platform emits `native`, add one `KindEmitSpec` under
   `src/targets/<platform>/spec/<kind>.ts` (see § Emit specs below) and list it in that directory's
   `index.ts` export array. `provider-kind-coverage` fails `sigil sync --check` when a `native`
   whole-file kind has no spec for its channel (a spec with no `variant`, or `variant` equal to the
   channel id).
6. If the platform needs fields no other provider has (e.g. a model override, an effort setting),
   declare them on `Target.frontmatterExtensions`, never as bare fields in `src/schema/index.ts`:

   ```typescript
   frontmatterExtensions: {
     agent: { model: z.string().optional(), effort: z.enum(['low', 'high']).optional() },
   };
   ```

   Catalog source then carries them under the provider's own namespace —
   `claude: { model: opus, effort: high }` — and `src/validate/schema-checks.ts` composes the
   effective per-artifact schema by iterating every registered target's declaration for that kind.
   The validator never names a specific provider, so a new provider's fields are picked up
   automatically. This is the fix for the pre-2026-08 state, where six Claude-only skill fields
   (`allowedTools`, `argumentHint`, `disableModelInvocation`, `whenToUse`, `userInvocable`,
   `skillContext`) lived un-namespaced on the neutral `SkillSchema` — a second provider had nowhere
   to put its own equivalents without `SkillSchema` becoming the union of every provider's fields.

7. If a kind's vocabulary is genuinely owned by one provider today (Claude's `hook`/`settings`
   lifecycle enums are Claude Code's own vocabulary, not a cross-provider standard), that is declared
   on `KindDescriptor.ownedBy` (`src/kinds.ts`) rather than pretended-neutral. `validate` warns the
   moment a second target's capability table supports an `ownedBy`-nonempty kind — that warning is
   the signal the vocabulary must move into per-provider namespaces before a second provider ships it.
8. Add one **body lexicon** table: `src/targets/<platform>/lexicon.ts` exporting a `ProviderLexicon`
   (`src/targets/lexicon.ts`) with a `{value, doc}` entry for every term in `LEXICON_TERMS`. Wire it
   onto every `KindEmitSpec`'s `lexicon:` field — `renderArtifact()` (`src/targets/emit.ts`) applies
   it unconditionally, so a body written once (`Read {sigil:conventions-file}...`) resolves to each
   provider's own literal (`CLAUDE.md` / `AGENTS.md`) at render time. This is what keeps catalog
   _bodies_ provider-neutral the same way `FieldMapping` already keeps _frontmatter_ neutral — see
   `src/targets/lexicon.ts`'s header and `docs/decisions/provider-neutral-body-lexicon-2026-08.md`
   for the audit that found bodies had no equivalent mechanism at all. Also add each of your
   provider's `bodyForbids` entries: `UNTRANSLATED_TOKEN_FORBID` (a `{sigil:}` token surviving to
   output means an unknown term or a spec that forgot step 8) on every spec, plus
   `CLAUDE_LITERAL_FORBIDS_ON_COPILOT`-style entries for any OTHER provider's literal your provider
   must never see (`src/targets/lexicon-forbid.ts`) — this is the second net that catches a
   hardcoded literal an author typed instead of using the lexicon token in the first place.
   **Any hand-rolled aggregate that assembles an artifact's body without going through
   `renderArtifact()`** (Copilot's `AGENTS.md`/`copilot-instructions.md` — see
   `copilot/build-helpers.ts`) must call `applyLexicon()` directly; it does not get the pass for
   free just by existing in the same target.

### Adding a kind

1. Add the kind to `ArtifactKind` (`src/types.ts`) and one entry to `KIND_REGISTRY`
   (`src/kinds.ts`) — `selectorOrder`/`displayOrder` place it in pickers and generated docs
   automatically; there is no second hand-maintained list to update.
2. Add its zod schema to `SCHEMAS` in `src/schema/index.ts`; `npm run build` regenerates
   `schema/<kind>.schema.json` from it — commit both.
3. Each provider that supports the new kind adds a `KindEmitSpec` for it (see below). A provider
   that doesn't support it adds no spec and marks the kind `none` in its `capabilities.ts` — every
   target's table must gain a row for the new kind, or the build fails to compile.

### Emit specs: how a kind renders on one provider

`src/targets/spec-types.ts` defines `KindEmitSpec` — a declarative, data-only description of one
(provider, kind) pairing: its output path, which frontmatter fields map to which provider keys, which
body sections wrap the artifact body, and which contract (required/forbidden keys, forbidden body
patterns) the emitted file must satisfy. `renderArtifact(spec, artifact, ctx)`
(`src/targets/emit.ts`) is the single renderer every spec runs through — there is one emission
function in the whole codebase, not one per platform.

Two consequences of this being data rather than code:

- **Contracts are derived, not hand-written.** `deriveContracts(specs)`
  (`src/targets/output-contract.ts`) builds each platform's `ContractEntry[]` straight from its
  `KindEmitSpec[]` — `requiredKeys` from mappings marked `required: true`, `forbiddenKeys` and
  `bodyForbids` passed through, `match` from `outputPath`. A spec and its contract cannot drift,
  because the contract no longer exists as separate hand-maintained state.
- **Per-provider body rearrangement without touching the catalog.** A spec's `BodySectionSpec`
  receives `ResolvedArtifact.resolvedSlots` / `resolvedAncestorBodies` (see § Templates below), so a
  provider that needs a different section order, a split into multiple files, or extra wrapping
  material builds it from the composed parts — the catalog author never writes anything
  platform-specific, and `resolvedBody` (the default, slot-concatenated string) stays available for
  every provider that doesn't need to diverge.

### Templates: one body structure, many artifacts

`kind: template` artifacts (`catalog/shared/templates/*.template.md`) hold a kind's shared body
structure exactly once. A template's body is ordinary Markdown with `<!-- slot: key -->` markers;
everything outside a marker is shared prose emitted for every artifact that uses the template. An
artifact opts in with `template: <template-id>` in its frontmatter and then supplies **only** slot
content — one or more `<!-- slot: key -->` markers followed by that slot's Markdown, nothing else at
the top level:

```markdown
---
id: shared/templates/workflow-skill
kind: template
appliesToKind: [skill]
revision: 1
slots:
  - { key: whenToUse, required: true, description: 'Trigger conditions, one paragraph.' }
  - { key: steps, required: true, description: '### Step N — <verb> sections, in order.' }
docs:
  - {
      url: 'https://code.claude.com/docs/en/skills',
      verifiedOn: '2026-08-04',
      covers: 'SKILL.md layout',
    }
---

## When to Use

<!-- slot: whenToUse -->

## Procedure

<!-- slot: steps -->
```

```markdown
---
id: typescript/ts-generate-tests
kind: skill
template: shared/templates/workflow-skill
---

<!-- slot: whenToUse -->

Use when adding or reviewing unit tests in a TypeScript project.

<!-- slot: steps -->

### Step 1 — Locate the test file

...
```

Composition (`src/templates.ts`, invoked from `resolve.ts` before `extends`) validates the artifact's
slots against the template's declared `slots:` and substitutes each marker, producing
`ResolvedArtifact.resolvedBody` (the default rendering every provider gets for free) plus the
unflattened `resolvedSlots` / `templateId` fields consumed by provider specs that need to diverge.
An artifact without `template:` is unaffected — hand-authored bodies remain valid for one-offs.
Templates are never emitted to `dist/` — every provider's capability table marks `template` as `none`.

**Propagating a template change** — when a template's shared prose or slot list changes, every
artifact built against it needs its output regenerated. `sigil sync` is the command for that; see the
CLI reference below and `docs/guides/authoring.md` § Keeping artifacts in sync with their template.

**Doc citations are staleness-tracked, not continuously verified.** Every `docs:` entry — on a
template, or in a provider's `KindEmitSpec.docs` (`src/targets/doc-refs.ts`) — carries a
`verifiedOn` date. `sigil sync --stale <months>` (default 6) walks both: template citations via
`findStaleDocs` and every provider spec's (plus the two hand-written aggregates',
`copilot-instructions.md`/`AGENTS.md`) citations via `findStaleProviderDocs`
(`src/targets/all-emit-specs.ts` flattens the input; `src/commands/sync/analyze.ts` does the date
check). `--check` fails CI when any entry is stale — wired into `.github/workflows/ci.yml`. What
stays manual: nothing re-fetches a URL or confirms the page still describes the cited structure —
a person does that and then updates `verifiedOn`.

**What "verified" means** (`src/targets/doc-refs.ts`'s header is the canonical statement): a citation
must name the provider's canonical home for the artifact — the page that provider's own navigation
or file-reference table points to, anchored to the specific section when the artifact is a
subsection — not merely a page that happens to mention the format. When two products read the same
emitted file (every `.github/*` output is read by both GitHub's cloud agent and VS Code's local
agent, and their docs genuinely diverge — see `COPILOT_RULE_SPEC`'s citation for a concrete
example), cite both; `docs` is an array for exactly this. A `KindEmitSpec` can also carry
`supersededBy` when a provider has signaled the whole output format is being retired (e.g. VS Code
steering `.prompt.md` toward agent skills) — `sigil sync` surfaces it as an advisory notice that
never fails `--check`, since acting on it is a deliberate, reviewed migration, not an automatic one.

### Conformance engine

`sigil sync`'s second analyzer (`src/commands/sync/conformance/`, added by the 2026-08-07
catalog-conformance audit — see `docs/decisions/catalog-conformance-audit-2026-08.md`) answers a
different question than template drift: not "does this artifact match its template" but "does this
artifact match the current provider standard, on every provider it emits to." A `ConformanceRule`
(`conformance/types.ts`) is data plus `detect()`/optional `fix()`/optional `editorialTask()` — the
same philosophy as `KindEmitSpec`: adding a rule is one file in `conformance/rules/` plus one line
in `conformance/registry.ts`, never a change to the runner.

Each rule is `mechanical` (a finding has a deterministic `fix()` — e.g. `when-to-use-lift`, which
extracts a skill's `## When to Use` body prose into `whenToUse:` frontmatter) or `editorial` (the
right answer needs judgment — e.g. `body-density`, `platform-path-leak`, `applies-to-rationale`,
`related-artifacts`). A `mechanical` rule can also be detect-only when even its class of finding
has no safe auto-fix (`provider-kind-coverage` — closing a spec gap means authoring code;
`deprecated-hygiene` — naming the right replacement artifact is judgment). Findings carry
`severity: 'error' | 'warning'`: errors are structural gaps (missing spec coverage, un-lifted
`whenToUse`) and fail `--check`; warnings are advisory, same precedent as `supersededBy`.

`--apply` writes every `mechanical` fix. `--apply --editorial` additionally runs a model-backed pass
(`fix-editorial.ts`, model call in `editorial-model-client.ts` — a raw `fetch` to the Anthropic
Messages API, no SDK dependency) for `editorial` findings, reading `ANTHROPIC_API_KEY`. Every
proposal must clear four rails (`editorial-rails.ts`) before it is written:

1. Re-parses as valid frontmatter + body.
2. Passes the artifact kind's zod schema.
3. Passes `checkOutputContract()` for every provider `KindEmitSpec` matching the kind.
4. Only touches the frontmatter keys (or `body`) its task declared ownership of — identity fields
   (`id`/`kind`/`name`/`language`/`uses`/`extends`/`platforms`/`deprecated`) are never touched by
   any task, regardless of what it claims to own.

A failed rail drops the edit and reports why; it never writes a partial result. `--rule <id>`,
`--kind <k>`, `--language <l>`, and `--provider <p>` scope both detection and `--apply` — the
mass-change controls: bring one language up to standard, or one rule across the whole catalog,
reviewing each as its own diff (the clean-tree guard on `--apply` makes this the natural workflow).

**Lifecycle scenarios the engine (plus existing mechanisms) covers:**

| Scenario                 | Mechanism                                                                                                                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| New artifact authored    | `sigil sync` flags it against every applicable rule; `shared/author-artifact` scaffolds frontmatter                                                                                  |
| New artifact kind added  | `KIND_REGISTRY` entry + spec per provider; `provider-kind-coverage` errors until every supporting target has a spec or aggregate                                                     |
| Provider changes a field | edit the `KindEmitSpec`, refresh the `DocRef`, add a rule if catalog source must change; `--apply` propagates                                                                        |
| Standard tightened       | one new file in `conformance/rules/`, one registry line, one `--apply`                                                                                                               |
| Artifact deprecated      | `deprecated: { since, reason, supersededBy? }` — stays resolvable; `deprecated-hygiene` enforces `supersededBy`; `validate` warns on live dependents; `sigil prune` cleans consumers |
| Citation goes stale      | `sync --stale` (6-month default) fails `--check`; a human re-verifies against the canonical-home standard and bumps `verifiedOn`                                                     |
