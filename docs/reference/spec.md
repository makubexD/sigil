# Sigil — Specification

> **Back to:** [README](../../README.md) · [Documentation index](../index.md)
> **Authoring recipes:** [guides/authoring.md](../guides/authoring.md)

## Contents

- [Overview](#overview)
- [Core principles](#core-principles)
- [Artifact kinds](#artifact-kinds)
- [Reuse mechanisms](#reuse-mechanisms)
- [Platform mapping](#platform-mapping)
- [File conventions](#file-conventions)
- [CLI reference](#cli-reference)
- [Trust scanning](#trust-scanning)
- [Versioning](#versioning)
- [Contributor architecture](#contributor-architecture)

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
   supported by Claude Code, Codex CLI, Antigravity CLI (formerly Gemini CLI), and Cursor. Skill bodies are portable; only
   the surrounding wrappers differ.

---

## Artifact kinds

Nine kinds exist (`KIND_REGISTRY` in `src/kinds.ts`; one zod schema each in `SCHEMAS`,
`src/schema/index.ts`): the whole-file kinds `skill`, `agent`, `rule`, `prompt`, `workflow`; the
config kinds `hook`, `settings`, `mcp`, which merge into user-owned JSON; and the authoring-only
`template`. Which kinds each provider delivers is generated into
[capabilities.md](capabilities.md).

### Shared base fields

Every kind's schema spreads `BaseFields` (`src/schema/shared.ts`):

| Field         | Required | Meaning                                                                                                                                                                                             |
| ------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`          | yes      | Namespaced kebab-case, two or three segments (`shared/foo`, `typescript/ts-foo`). Enforced by `KEBAB_ID_RE`, because adapters interpolate it into output paths.                                     |
| `kind`        | yes      | Discriminator; each schema pins it to its own literal.                                                                                                                                              |
| `title`       | yes      | Short human-readable title.                                                                                                                                                                         |
| `description` | yes      | One-line description used in listings and emitted as the provider `description`.                                                                                                                    |
| `tags`        | no       | Discovery tags (default `[]`).                                                                                                                                                                      |
| `platforms`   | no       | Restrict emission to the listed target names (`claude`, `copilot`), intersected with the targets that support the kind. Absent = every supporting target. Do not list every target; omit the field. |
| `deprecated`  | no       | `{ since, reason, supersededBy? }`. Retires an artifact without deleting it: it stays resolvable, `validate` warns on live dependents, `sigil prune` reports installed copies.                      |

Fields shared by several kinds, beyond the base set:

| Field              | Kinds                                   | Meaning                                                                                                                                                              |
| ------------------ | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`             | skill, agent                            | Invocation name; kebab-case (`KEBAB_NAME_RE`), used as the output file or directory name.                                                                            |
| `language`         | skill, agent, rule, hook, settings, mcp | Language namespace; must match a `catalog/languages/<lang>/` directory. Omit for cross-language artifacts.                                                           |
| `template`         | skill, agent, rule, prompt, workflow    | Id of a `template` artifact whose slots compose the body ([architecture.md](architecture.md#templates-one-body-structure-many-artifacts)).                           |
| `relatedArtifacts` | skill, agent, rule                      | `[{ id, relation, reason }]` with `relation` one of `escalates-to`, `complements`, `see-also`. Rendered as a Boundary section only when the sibling is co-installed. |
| `defaultScope`     | hook, settings, mcp                     | Recommended install scope (`project`, `local`, `user`); overridden by `--scope` or the wizard.                                                                       |

### skill

A procedural how-to that an AI agent reads when asked to perform a specific task. Emitted as a
native **Agent Skill** on both Claude Code (`.claude/skills/<name>/SKILL.md`) and GitHub Copilot
(`.github/skills/<name>/SKILL.md`) — both follow the same Agent Skills open standard
(agentskills.io). Invoked as `/name` in both tools.

**File:** `catalog/languages/<lang>/skills/<name>/SKILL.md`  
**For stack-agnostic skills:** `catalog/shared/skills/<name>/SKILL.md` (omit `language:`)  
**Invoked as:** `skill:csharp/cs-generate-tests` in the CLI. The block shows the skill schema:
`name` is that id's last segment. Title, description, `whenToUse`, and `uses` here illustrate
those fields; the live skill's `uses` are `csharp/cs-testing` and `csharp/cs-code-reviewer`.

```yaml
---
id: csharp/cs-generate-tests
kind: skill
name: cs-generate-tests
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
tools: [read, search, shell] # neutral names; each target writes its own (see Tool vocabulary)
model: balanced # neutral tier: fast | balanced | deep
effort: medium
claude: # Claude-only hints; other adapters ignore this block
  maxTurns: 10
  skills: [shared/cli] # preloaded into the subagent at startup; emitted as a `skills:` list of names
---
```

Agent-specific fields (`AgentSchema`, beyond the shared fields above). `tools`, `disallowedTools`
(and a skill's `allowedTools`) take the neutral tool names in [Tool vocabulary](#tool-vocabulary).
A name may use letters, digits, spaces and `_ . : * ( ) / -` only, so it can't end or add a
frontmatter key.

| Field              | Meaning                                                                                                                                                                                            |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tools`            | Allow-list of neutral tool names, at least one. Absent means the provider default of all tools, so an authored read-only agent must declare it.                                                    |
| `disallowedTools`  | Neutral tools the agent must not use, at least one. Only Claude has a denylist field, so on any other target the restriction is inexact and `toolPolicy` decides.                                  |
| `toolPolicy`       | What a target does when it can't write the restriction exactly. `strict` (the default when absent): it skips the agent with the reason. `nearest`: it writes the closest mapping and warns.        |
| `model`            | Neutral tier: `fast`, `balanced`, or `deep`. Mapped only where a target has a tier table (Claude: `haiku`, `sonnet`, `opus`); elsewhere the line is left out and the tool's default model applies. |
| `effort`           | `low`, `medium`, or `high`. Written on Claude; left out elsewhere.                                                                                                                                 |
| `claude.model`     | `haiku`, `sonnet`, or `opus`. Overrides the neutral `model` on Claude.                                                                                                                             |
| `claude.effort`    | `low`, `medium`, or `high`. Overrides the neutral `effort` on Claude.                                                                                                                              |
| `claude.maxTurns`  | Positive integer turn cap.                                                                                                                                                                         |
| `claude.isolation` | `worktree` (run the subagent in an isolated git worktree).                                                                                                                                         |
| `claude.skills`    | Catalog skill ids to preload (see below).                                                                                                                                                          |
| `relatedArtifacts` | Sibling cross-references rendered as a Boundary section; see the shared-fields table.                                                                                                              |

Agents have no `whenToUse`; they dispatch on `description` alone.

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
  `disable-model-invocation: true`), invoked as `/slug` in Claude Code. In the plugin build it is
  `plugins/<pack>/skills/<name>/SKILL.md`, invoked as `/<pack>:<name>`, named by the id's last
  segment (`shared/explain-diff` → `explain-diff`, `csharp/cs-deploy` → `cs-deploy`). Two members of
  a pack with one name fail the build. Formerly a custom command at `.claude/commands/<slug>.md` —
  Anthropic merged custom commands into skills (see `src/targets/doc-refs.ts`'s
  `CLAUDE_SKILLS_DOC`); sigil no longer writes the legacy path, though Claude Code still reads it if
  a project has old files there.

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

An ordered sequence of skill and prompt steps. Emitted as a user-invoked skill on Claude Code and a
prompt file on Copilot — the same shapes as `prompt` — with `steps:` rendered as a `## Steps`
checklist in the body. It is not a separate multi-step command type, and it does not emit
`argument-hint` or `arguments`.

The block below is illustrative: no `kind: workflow` artifact currently exists in `catalog/`. It
shows the schema (`steps` is required and non-empty).

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

### hook, settings, mcp (config kinds)

These three kinds do not write whole files. They merge a fragment into a user-owned JSON file
(`.claude/settings.json`, `.mcp.json`, and the Copilot/VS Code MCP files) and are usually language-agnostic
(each schema still accepts an optional `language`, though not on an artifact under `shared/`). Source files are `*.hook.md`, `*.settings.md`, and `*.mcp.md`
(under `catalog/shared/hooks/`, `settings/`, `mcps/`, or a language folder for a language's own,
such as `catalog/languages/csharp/settings/cs-allow-dev-tools.settings.md`). The kind-specific fields:

| Kind       | Fields (beyond the shared set)                                                                                                                                                                |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hook`     | `event` (required: `PreToolUse`, `PostToolUse`, `UserPromptSubmit`, `SubagentStop`, `Stop`, `SessionStart`, `Notification`), `command` (required), `args`, `matcher` (default `*`), `timeout` |
| `settings` | `permissions` (`allow` / `deny` / `ask`), `env`, `model`, `statusLine`                                                                                                                        |
| `mcp`      | `server`: stdio (`command`, `args`, `env`) or remote (`type: http` or `sse`, `url`, `headers`)                                                                                                |

The merge model, scope tables, drift classification, and backup rules are owned by
[config-kinds.md](config-kinds.md). `settings` models Claude Code's own vocabulary and is
flagged `KindDescriptor.ownedBy` until a second target supports it.

### template

A `kind: template` artifact (`*.template.md`, under `catalog/shared/templates/`) holds shared body
structure with `<!-- slot: key -->` markers. It is authoring-time structure only and is never
emitted to `dist/` or installed (every target marks it `none`). Fields: `appliesToKind`,
`revision`, `slots` (`key`, `required`, `description`, optional `renamedFrom`), and `docs`
(provider citations). Composition, shipped templates, and propagation are owned by
[architecture.md](architecture.md#templates-one-body-structure-many-artifacts).

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

| Adapter                    | Rules                                                          | Agents                                      |
| -------------------------- | -------------------------------------------------------------- | ------------------------------------------- |
| Claude Code (plugin build) | Inlined as `## Applied Rules` section in SKILL.md              | Written to `agents/<name>.md` in the pack   |
| Claude Code (scaffold/add) | Written to `.claude/rules/<slug>.md`                           | Written to `.claude/agents/<name>.md`       |
| GitHub Copilot             | Inlined as `## Coding guidelines to apply` section in SKILL.md | Written to `.github/agents/<name>.agent.md` |

---

## Platform mapping

Sourced from `src/targets/doc-refs.ts` — the one place provider doc URLs are declared; every entry
there carries a `verifiedOn` date and is staleness-tracked by `sigil sync --stale` (see
[Templates](architecture.md#templates-one-body-structure-many-artifacts) for what that command checks).
Native artifact names and output paths are one table, with a column for the Claude Code plugin build. Plugin-column paths are relative to `dist/claude/plugins/<pack>/` (for example `dist/claude/plugins/<pack>/skills/<name>/SKILL.md`).

| Catalog kind       | Claude native artifact                                                        | Claude plugin (`dist/claude/plugins/<pack>/`) | Claude scaffold (`.claude/`)                     | Copilot native artifact                                                                                                      | Copilot (`.github/`)                     |
| ------------------ | ----------------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `skill`            | **Agent Skill** — `.claude/skills/<name>/SKILL.md`                            | `skills/<name>/SKILL.md` + `references/`      | `.claude/skills/<name>/SKILL.md` + `references/` | **Agent Skill** — `.github/skills/<name>/SKILL.md`                                                                           | `skills/<name>/SKILL.md` + `references/` |
| `prompt`           | **User-invoked skill** — `.claude/skills/<slug>/SKILL.md`                     | `skills/<name>/SKILL.md` (`/<pack>:<name>`)   | `.claude/skills/<slug>/SKILL.md`                 | **Prompt file** — `.github/prompts/<slug>.prompt.md`                                                                         | `prompts/<slug>.prompt.md`               |
| `agent`            | **Subagent** — `.claude/agents/<name>.md`                                     | `agents/<name>.md`                            | `.claude/agents/<name>.md`                       | **Custom agent** — `.github/agents/<name>.agent.md`                                                                          | `agents/<name>.agent.md`                 |
| `rule` (repo-wide) | **Memory rule** — `.claude/rules/<slug>.md` (no `appliesTo` → no path filter) | folded into skill SKILL.md                    | `.claude/rules/<slug>.md` (no frontmatter)       | **Global instructions** — `.github/copilot-instructions.md` (full build); an `applyTo: "**"` instructions file (`sigil add`) | `copilot-instructions.md`                |
| `rule` (scoped)    | **Memory rule** — `.claude/rules/<slug>.md` (`paths:` frontmatter)            | folded into skill SKILL.md                    | `.claude/rules/<slug>.md` (`paths:` frontmatter) | **Scoped instructions** — `.github/instructions/<slug>.instructions.md` (`applyTo:`), with or without a `language`           | `instructions/<slug>.instructions.md`    |
| `workflow`         | **User-invoked skill** — `.claude/skills/<slug>/SKILL.md`                     | `skills/<slug>/SKILL.md`                      | `.claude/skills/<slug>/SKILL.md`                 | **Prompt file** — `.github/prompts/<slug>.prompt.md`                                                                         | `prompts/<slug>.prompt.md`               |

**Open standard (`agents-standard`).** One kind ships natively: a `skill` becomes
`.agents/skills/<name>/SKILL.md` with the [Agent Skills spec](https://agentskills.io/specification)'s
own frontmatter (`name`, `description`, `allowed-tools` as a space-separated list); `whenToUse`,
`argumentHint`, the Boundary and the skill's `uses.rules` become body sections, as on Copilot. A `rule`
reaches it inside skills, and a full build also writes repo-wide rules to a root `AGENTS.md`
([agents.md](https://agents.md/)). Every other kind is skipped with the reason in
[capabilities.md](capabilities.md). Specs and citations: `src/targets/agents-standard/`.

**OpenAI Codex (`codex`).** Skills and `AGENTS.md` render exactly as for `agents-standard`, so a project installs skills
for one of the two, and `add` refuses the second. A `hook` merges into `.codex/hooks.json`, or `$CODEX_HOME/hooks.json` at user scope, as one
command string, because Codex ignores `args`: a `node -e` script is base64-encoded so it runs in every shell. An `mcp` server becomes a `[mcp_servers.<name>]` table in
`.codex/config.toml`, or `$CODEX_HOME/config.toml` at user scope; `{sigil:env:NAME}` becomes `env_vars`, and any other use
of it is refused. Every other kind is skipped with the reason in [capabilities.md](capabilities.md). Specs and citations:
`src/targets/codex/`.

**Cursor (`cursor`).** A `skill` becomes `.cursor/skills/<name>/SKILL.md`, rendered as for `codex`, with its rules
inlined. A `rule` becomes `.cursor/rules/<id-slug>.mdc` with `description` and either `alwaysApply: true` (`appliesTo`
absent, empty, or only `**` / `**/*`) or `globs: "<comma-joined appliesTo>"` and `alwaysApply: false`, never gated on
`language`. `build` writes no `AGENTS.md`: the repo-wide rules are already `alwaysApply` files. Cursor uses its own
`.cursor/skills/` copy over a same-named skill in `.claude/skills/` or `.agents/skills/`, which `add` and `status` report
as a note. A `hook` merges into `.cursor/hooks.json` (or `~/.cursor/hooks.json` at user scope) with events and tool
names translated to Cursor's. An `mcp` server merges into `mcpServers` in `.cursor/mcp.json` (or `~/.cursor/mcp.json`):
`type: "stdio"` is written first on a local server, a remote one gets no `type`, and `{sigil:env:NAME}` becomes
`${env:NAME}`. `local` scope is refused for both. Every other kind is skipped with the reason in
[capabilities.md](capabilities.md). Specs and citations: `src/targets/cursor/`.

**Antigravity (`antigravity`).** A `skill` becomes `.agents/skills/<name>/SKILL.md`, the same file `codex` and
`agents-standard` write (so `add` refuses a second owner), with its rules inlined. A repo-wide `rule` becomes
`.agents/rules/<id-slug>.md` with `trigger: always_on`; a scoped rule is skipped, since no glob rule attached in
testing. `build` writes no `AGENTS.md`. An `mcp` server merges into `mcpServers` in `.agents/mcp_config.json` (or
`~/.gemini/config/mcp_config.json` at user scope) with no `type`; the file expands no env references, so an identity
`env` entry is dropped (the server inherits `agy`'s environment) and any other `{sigil:env:NAME}` token skips the
server. `local` scope is refused. An `agent` becomes `.agents/agents/<name>.md` with `name`, `description`, `model`
(a tier, below) and `tools` as a YAML block list in Antigravity's own tool names; an agent with no `tools` gets the
full list, because Antigravity reads an absent list as no tools. Every other kind is skipped with the reason in
[capabilities.md](capabilities.md). Specs and citations: `src/targets/antigravity/`.

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

**Emitted frontmatter notes:**

- **Claude skill SKILL.md:** `description` is double-quoted. Skills have **no `paths:` equivalent** —
  Claude Code loads skills by description relevance, not file path; `paths:` is a `.claude/rules/*.md`-only
  mechanism (see the `rule` (scoped) row above). Optional skill fields: `when_to_use: "<text>"` (from
  `whenToUse` — trigger phrases the model matches against; this is what actually drives model-invoked
  dispatch, distinct from `description`), `allowed-tools: <csv>` (from `allowedTools`), `argument-hint:
"<hint>"` (from `argumentHint`), `disable-model-invocation: true` (from `disableModelInvocation`),
  `user-invocable: false` (from `userInvocable`), `context: fork` (from `skillContext`) — `argument-hint`,
  `disable-model-invocation`, `user-invocable`, and `context` are Claude-only and skipped entirely in
  Copilot's SKILL.md output.
- **Copilot skill SKILL.md:** frontmatter is `name`, `description`, and `allowed-tools` (from
  `allowedTools`, written as the Agent Skills spec's quoted space-separated string, the same as the
  open-standard target; valid outside Claude Code per the spec's six-field list,
  `AGENT_SKILLS_SPEC_DOC`). A tool name containing whitespace can't be carried, so rendering
  refuses it. No `applyTo`, `paths:`, `when_to_use`, or any Claude-only field.
  `argumentHint` has no Copilot frontmatter equivalent (`argument-hint` is a documented hard error
  outside Claude Code) and instead renders as a `**Arguments:** <hint>` body line, the same pattern
  `whenToUse` already used for its own `## When to Use` body section — see `copilot/spec/skill.ts`.
- **Copilot prompt files:** use `agent: agent`. `applyTo` is not valid here. `tools:` is hardcoded to
  `codebase` and `github` (`COPILOT_PROMPT_SPEC` in `src/targets/copilot/spec/prompt.ts`); catalog
  frontmatter cannot override it. Body uses `${input:name}` (2-part VS Code input variable form only).
  The same spec renders `workflow`, and its `forbiddenKeys` include `argument-hint` and `arguments`.
- **Claude prompt (user-invoked skill):** `name:`, `description:`, `argument-hint:` (built from `args`),
  `arguments:` (YAML list of arg names), and `disable-model-invocation: true`. Body uses `$name`
  (via the `arguments:` list). See `src/targets/claude-code/spec/prompt.ts`.
- **Claude workflow (user-invoked skill):** `name:`, `description:`, and `disable-model-invocation: true`
  only. Workflows have `steps:`, not `args:`, so this spec does not emit `argument-hint` or
  `arguments`. `steps:` render as a `## Steps` checklist (`src/targets/claude-code/spec/workflow.ts`).
- **Claude agent (subagent):** `name:`, `description:` (double-quoted), then each present `claude:`
  hint flattened to a top-level key (`model`, `effort`, `maxTurns`, `isolation`; a neutral `model` /
  `effort` fills the same key when `claude:` sets none), `skills:` as a list of skill names (from the
  `claude.skills` ids), `tools: <csv>` and `disallowedTools` as a JSON array, both in Claude's tool
  names. An absent `tools` means the subagent inherits every tool. Same layout for plugin and
  scaffold (`src/targets/claude-code/spec/agent.ts`).
- **Copilot agent files:** require the `.agent.md` extension and `description:` frontmatter.
  Frontmatter is `name`, `description`, and `tools` as a **JSON array** literal (a valid YAML array)
  in Copilot's primary aliases when `tools` is authored. `model`, `effort` and the `claude:` block
  are not emitted. An agent with `disallowedTools` is inexact here (`src/targets/copilot/spec/agent.ts`).
- **Copilot instructions (`.instructions.md`, from scoped rules):** `applyTo: "<globs>"`
  (comma-joined from `appliesTo`, falling back to `**` when absent) and a single-line
  `description:`; no `name` or `agent` (`src/targets/copilot/spec/rule.ts`).
- **`appliesTo` on rules stays unchanged in catalog source** — adapters translate it to `paths:` (Claude)
  or `applyTo` (Copilot `.instructions.md`). The translation is language-independent: a language-less
  shared rule with `appliesTo` still emits `paths:`/`applyTo:` — it is never gated on `language` being
  set. **Skills never had a valid use for `appliesTo`** on either platform and the field was removed
  from `SkillSchema` — see the [skill-dispatch audit](../decisions/skill-dispatch-audit-2026-08.md).
- **Flat `marketplace.json`** (`name`/`owner`/`plugins[]`) is emitted only by the Claude Code plugin build (`dist/claude/`). Sigil emits no Copilot manifest; Copilot reads this one ([setup](../setup/copilot.md)).

### Tool vocabulary

Catalog tool lists and model hints are provider-neutral. Each target writes them through its own
`ToolDialect` (`src/targets/<provider>/tool-dialect.ts`) and tier table, and never copies a catalog
name unchanged. The record is [neutral-agent-vocabulary-2026-11](../decisions/neutral-agent-vocabulary-2026-11.md).

Neutral tools: `read`, `search`, `edit`, `shell`, `web`, `agent`, `todo`. Claude's names are still
accepted as legacy aliases (`Read` → `read`; `Grep`, `Glob` → `search`; `Edit`, `Write` → `edit`;
`Bash` → `shell`; `WebFetch`, `WebSearch` → `web`; `Agent`, `Task` → `agent`; `TodoWrite` → `todo`),
and `sigil sync --check` reports them (`legacy-tool-name`); `sync --apply` rewrites them.

| Field                   | Claude                                                                                                                         | Copilot                                                     | agents-standard    | Codex     | Cursor                                                                          | Antigravity                                                                                                                                                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- | ------------------ | --------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| agent `tools`           | `read`→Read, `search`→Grep, Glob, `edit`→Edit, Write, `shell`→Bash, `web`→WebFetch, WebSearch, `agent`→Agent, `todo`→TodoWrite | `read`, `search`, `edit`, `execute`, `web`, `agent`, `todo` | no agents          | no agents | `readonly: true` unless the list holds `edit`; exact only when ⊆ {read, search} | `read`→view_file, `search`→grep_search, find_by_name, list_dir, `edit`→write_to_file, replace_file_content, `shell`→run_command, `web`→search_web, read_url_content, `agent`→invoke_subagent, `todo` inexact; absent → the full list |
| agent `disallowedTools` | same names                                                                                                                     | not carried (inexact)                                       | —                  | —         | not carried (inexact)                                                           | not carried (inexact)                                                                                                                                                                                                                |
| skill `allowedTools`    | same names                                                                                                                     | `read`, `search`, `edit`, `shell`, `web`                    | Claude-style names | left out  | left out                                                                        | left out                                                                                                                                                                                                                             |
| `model`                 | `fast`→haiku, `balanced`→sonnet, `deep`→opus                                                                                   | left out (inherits)                                         | —                  | —         | left out (`inherit`)                                                            | `fast`→flash_lite, `balanced`→flash, `deep`→pro                                                                                                                                                                                      |
| `effort`                | as written                                                                                                                     | left out                                                    | —                  | —         | left out                                                                        | left out                                                                                                                                                                                                                             |

An agent restriction a target can't write exactly follows `toolPolicy`. Under `strict` (the
default) `add` and the wizard list the agent as skipped with the reason, `build` leaves it out, and
`sync --check` fails (`tool-restriction-coverage`) until `platforms:` excludes the target. Under
`nearest` the closest mapping is written with a warning. A skill's `allowedTools` only pre-approves
tools, so a target that can't write it leaves it out and the tool asks for permission instead.
Neutral names are coarse: `search` pre-approves both Grep and Glob on Claude, and `edit` both Edit
and Write.

---

## File conventions

| Path                                                      | Contents                                                                                                                                                                                            |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `catalog/shared/`                                         | Cross-language artifacts, one subdirectory per kind: `skills/`, `agents/`, `rules/`, `prompts/`, `hooks/`, `settings/`, `mcps/`, `templates/`                                                       |
| `catalog/languages/<lang>/`                               | Language-specific skills, rules, agents                                                                                                                                                             |
| `catalog/languages/<lang>/language.yaml`                  | Display name, artifact-name `prefix`, `stack`, file globs, icon                                                                                                                                     |
| `catalog/standard.yaml`                                   | The catalog standard as data: stacks and families (members, section skeleton, required keys); read by `sync --check` only                                                                           |
| `catalog/languages/<lang>/skills/<name>/SKILL.md`         | Skill entry point                                                                                                                                                                                   |
| `catalog/languages/<lang>/skills/<name>/references/`      | Supplementary docs bundled with the skill                                                                                                                                                           |
| `catalog/shared/skills/<name>/SKILL.md`                   | Stack-agnostic (language-less) skill, plus `references/`                                                                                                                                            |
| `packs.yaml`                                              | Curated bundles (explicit `artifacts:` or `languages:`); `pluginExclude:` keeps a listed artifact out of the Claude plugin; `pluginDependencies:` makes it depend on a generated hook or MCP plugin |
| `schema/*.schema.json`                                    | JSON Schemas for editor autocomplete (generated from zod)                                                                                                                                           |
| `catalog/shared/templates/*.template.md`                  | Shared body structure (`kind: template`)                                                                                                                                                            |
| `*.agent.md`, `*.rule.md`, `*.prompt.md`, `*.workflow.md` | Single-file artifacts (kinds `agent`, `rule`, `prompt`, `workflow`)                                                                                                                                 |
| `*.hook.md`, `*.settings.md`, `*.mcp.md`                  | Config-kind artifacts (kinds `hook`, `settings`, `mcp`)                                                                                                                                             |
| `.sigil/manifest.json`                                    | Consumer install manifest                                                                                                                                                                           |

---

## CLI reference

Command summary aligned with `node dist-cli/cli.js --help`. This table is the command list.
Per-command flags: see [cli-flags.md](cli-flags.md).

| Command                            | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sigil` (no command)               | In a terminal: the guided home menu (inspects the folder, recommends the next step, routes to the commands below). Otherwise prints the command list on stdout and exits 0. See [consuming.md](../guides/consuming.md#using-the-guided-menu).                                                                                                                                                                                                                                                                                |
| `sigil build`                      | Compile the catalog to `dist/<target>/`, replacing that folder. Refuses to replace a folder whose output root has no sigil `registry.json`.                                                                                                                                                                                                                                                                                                                                                                                  |
| `sigil validate`                   | Validate all catalog artifacts (schema + reference integrity). Exits non-zero on errors.                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `sigil index`                      | Emit `dist/registry.json` — flat per-artifact index with sha256 + facets.                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `sigil list`                       | List catalog artifacts, optionally filtered by language and/or kind.                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `sigil get\|show <id>`             | Show full detail for a single catalog artifact (closure, targets, dest paths).                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `sigil search <query>`             | Free-text search the catalog (id, title, description, tags). Ranked results.                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `sigil add [selectors...]`         | Scaffold artifact(s) + their dependency closure into a consumer project. Guided wizard when called with no selector in a TTY.                                                                                                                                                                                                                                                                                                                                                                                                |
| `sigil init`                       | Prepare a consumer project for a target platform. Asks which target in a terminal when `--target` is omitted; without a terminal `--target` is required.                                                                                                                                                                                                                                                                                                                                                                     |
| `sigil new [kind]`                 | Scaffold an authoring template for a new catalog artifact. Guided wizard when called with no args in a TTY.                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `sigil check [files...]`           | Validate catalog source artifact files (schema, id/path/language, namespace — a shared artifact names no language and a language folder has a `language.yaml` — references, platforms). Exits non-zero on violations.                                                                                                                                                                                                                                                                                                        |
| `sigil import <source-dir>`        | Import a portable Claude template directory into the catalog as first-class artifacts (`--language <lang>` or `--shared`, exactly one). `--from copilot` reads a `.github/` layout instead: instructions, agents, prompts and skills. A skill comes with its flat `references/*.md`; anything else is listed as not imported.                                                                                                                                                                                                |
| `sigil status`                     | Show health status of artifacts installed in a consumer project. `reason` names _why_ a non-up-to-date entry is that way (e.g. a template revision bump, missing files, local edits), and a `Next:` list names the command that fixes each problem (a deleted whole-file artifact is restored with `sigil add`, not `sigil update`).                                                                                                                                                                                         |
| `sigil update [ids...]`            | Refresh installed artifacts to the current version in the catalog each was installed from (recorded in the manifest; `--catalog-dir` overrides it), including hook/settings/mcp fragments the catalog changed. Skips drifted files and edited config values unless `--force`. Installs a dependency an updated artifact now `uses` and the project lacks, recorded as a dependent like `add` does. No ids = update everything. In a terminal it previews and asks before writing (`--yes` skips, `--dry-run` previews only). |
| `sigil sync [template-id]`         | Catalog-author propagation: template drift, conformance, and stale `docs:` citations (summary below this table).                                                                                                                                                                                                                                                                                                                                                                                                             |
| `sigil uninstall [ids...]`         | Remove installed artifacts from a consumer project. Refcount-aware. With no ids, a terminal offers a picker of what is installed; without a terminal ids are required. Ids are bare catalog ids (`csharp/cs-generate-tests`), not `kind:` selectors.                                                                                                                                                                                                                                                                         |
| `sigil prune`                      | Report orphaned installed artifacts (ids no longer in the catalog each was installed from), inlined ones (a dependency file the skill using it already carries inline, e.g. a rule on Copilot; `inlined` in `--json`) and deprecated-but-installed ones. Preview by default; `--apply` removes the orphaned and inlined entries. An inlined copy from a manifest that predates `picked` may be an explicit pick: it is listed (`inlinedUnconfirmed`) and kept. A terminal is offered to apply right after the preview.       |
| `sigil patch <id>`                 | Update any field(s) of an existing catalog artifact. Transactional: rolls back on validation failure.                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `sigil move\|rename <id> <new-id>` | Rename/relocate a catalog artifact and rewrite its `extends` / `uses.rules` / `uses.agents` referrers; the moved artifact's `language:` follows its new namespace. Transactional.                                                                                                                                                                                                                                                                                                                                            |
| `sigil retarget <id>`              | Change platform targeting of a catalog artifact without touching its body.                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `sigil edit <id>`                  | Update title, description, and tags. Use `sigil patch` for all other fields.                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `sigil delete\|remove <id>`        | Remove a catalog artifact from the source. Prompts for confirmation unless `--yes`.                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `sigil completion [shell]`         | Print a shell tab-completion script (bash, zsh, or fish).                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `sigil release [level]`            | Bump version (patch\|minor\|major\|x.y.z), rebuild, update CHANGELOG, commit + tag. Does NOT push.                                                                                                                                                                                                                                                                                                                                                                                                                           |

**`sigil sync` in brief.** Catalog-author tooling: it reports template drift, conformance against
the current provider standard, and stale `docs:` citations; `--check` is the CI gate and `--apply`
writes the mechanical fixes. Flags: [cli-flags.md](cli-flags.md#sigil-sync). How-to:
[authoring.md](../guides/authoring.md#keeping-artifacts-in-sync-with-their-template). Internals
(drift analysis, conformance engine, staleness tracking):
[architecture.md](architecture.md#conformance-engine). CI gate:
[operations.md](../guides/operations.md#ci).

**Selectors for `add` (variadic, combinable):**

| Selector                         | Expands to                            |
| -------------------------------- | ------------------------------------- |
| `all`                            | Every artifact in the catalog         |
| `pack:dotnet-tooling`            | Every artifact in a named pack        |
| `kind:agent`                     | Every artifact of that kind           |
| `skill:csharp/cs-generate-tests` | One explicit artifact (kind-prefixed) |
| `csharp/cs-generate-tests`       | One explicit artifact (bare ID)       |

Every `add` flag is documented in [cli-flags.md](cli-flags.md#sigil-add).

**TTY/CI guard:** when `add` is run with no selector and stdin/stdout is not a TTY, it exits
non-zero with a usage hint instead of hanging — always pass a selector and `--yes` in CI
(see `docs/reference/troubleshooting.md`).

---

## Trust scanning

`src/trust/scan/` — a pure, side-effect-free scanner (`scanner.ts`, `rules.ts`, `types.ts`,
`allowlist.ts`) that runs over artifact content before it's authored or installed.

- **20 rules** across three namespaces in `src/trust/scan/rules.ts` (the `RULES` array is the
  source of truth):
  - `secret/*` — AWS keys, PEM blocks, generic API keys, bearer tokens, password fields, GitHub /
    Anthropic / OpenAI / Slack / Stripe / Google / npm tokens, and JWTs.
  - `config/*` — dangerous shell patterns and possible exfiltration. These run on every file, not
    only hook and MCP commands, because an artifact body is an instruction to a model with shell
    access. `config/dangerous-command` matches an invocation and what can't be told from one. It is a
    check of command shapes on one line, not a parser: an extra character can defeat it, and it does
    not read what prose asks a model to do. The
    [limits](../decisions/trust-scan-eval-limits-2026-10.md) list what passes. A backticked `` `eval` ``
    passes unless an ASCII word character, `$`, `(`, `"` or a backtick touches its closing backtick, a
    double-quoted, backticked or `$` argument follows it, or `]` or `)` then `(` follows it. An odd number of backticks earlier on the line also refuses it,
    even in harmless prose, because that reads as the closing half of a span. `"eval"` passes only
    before `,` `.` `;` `:` `)` `]` `}` or the end of the line. `eval()` passes except on a line that
    names `perl`; `eval(x)` and `eval "$x"` don't.
  - `injection/*` — "ignore previous instructions", system-prompt disregard, jailbreak overrides,
    data-exfil URL patterns, and role-switch phrases.
- **Severity:** `error` findings always fail `sigil check --trust`. `warn` findings are printed
  either way and fail the command only with `--strict` (`src/commands/check.ts`).
- **Allowlist:** inline `<!-- sigil-allow: rule/id -->` in the file body silences `warn` rules only.
  No command reads `.sigil/allow.json`, so an `error` finding has no override.
- Binary extensions (`.png`, `.jpg`, `.pdf`, etc.) are skipped entirely.

Surfaced by `sigil check <file> --trust` (authoring time); `--strict` makes warnings fail too. For a
skill it also scans every `references/` file, since those ship to the user's project with it.
`sigil add` / `update` do not run the scanner.

---

## Versioning

The npm package version (`package.json` `version`) is the single version in v1. The whole catalog
ships as one version:

- **MAJOR** — breaking change to the frontmatter schema or file layout.
- **MINOR** — new artifacts, new languages, new CLI commands.
- **PATCH** — content fixes, typos, documentation.

---

## Contributor architecture

How to add a language, a platform target, or a kind — and how emit specs, templates, the body lexicon, and the conformance engine fit together — is in [architecture.md](architecture.md).

That page is the contributor reference for `KindEmitSpec`, `renderArtifact()`, template slot composition, and `sigil sync`'s conformance analyzer.

This specification keeps the artifact schema, the platform mapping, the CLI, and trust scanning.
