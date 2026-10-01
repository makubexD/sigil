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

The wizard walks you through these steps. A step that does not apply is skipped:

1. **Target** — Claude Code or GitHub Copilot (auto-detected from `.claude/` / `.github/` at your project root, shown with reason)
2. **Scope** — Everything / Recommended / Pick specific items
3. **Artifacts** — under Pick specific items, a type sub-menu (the labels are that target's vocabulary) then the picker. Code kinds get an optional "Narrow by language?" step. For Everything, a language filter step appears instead.
4. **Dependencies** — before you decide, the wizard shows the exact rules and agents your selection references via `uses:` frontmatter. These are **author recommendations** — the skill bodies work without them, but the author bundled them as "you'll probably want these too." Yes installs them; No skips them (`--no-deps`).
5. **Conflicts** — whether to overwrite files that already exist.
6. **Config scope** — only when the selection includes `mcp`, `hook`, or `settings`. Choices are `project`, `local`, and `user`, each showing the destination file. A scope that writes into every project also shows the blast-radius warning.

The **Install plan** box (shown before "Proceed?") previews the full resolved artifact set: your picks tagged `(your pick)` and dependency-closure artifacts tagged `(dependency of <skill-name>)`. After install, a copy-pasteable `sigil add … --yes` command is printed so you can repeat it in CI.

**CI / non-interactive:** the wizard never runs in a piped context. Always pass a selector and `--yes`:

```bash
sigil add all --yes
sigil add skill:csharp/cs-generate-tests --yes
```

---

## Add a skill to a Claude Code project

Scaffold the xUnit testing skill (+ its rule + agent dependency) into a C# repo:

```bash
# In your C# project root
sigil init --target claude
sigil add skill:csharp/cs-generate-tests
```

**What gets written:**

```
.claude/skills/cs-generate-tests/SKILL.md
.claude/rules/csharp-cs-testing.md          ← C# testing rule (path-scoped via paths:)
.claude/agents/cs-code-reviewer.md          ← C# code-reviewer agent
```

Claude Code loads `.claude/rules/*.md` natively on every session. The rule and agent are
scaffolded from the `uses:` dependency closure automatically.

```bash
# If .claude/ already exists, init is optional.
# Use --overwrite only if you want to replace existing files:
sigil add skill:csharp/cs-generate-tests --overwrite
```

---

## Add a skill to a GitHub Copilot project

Add the Python pytest skill to a repo using GitHub Copilot Chat:

```bash
sigil init --target copilot
sigil add skill:python/py-generate-tests --target copilot
```

**What gets written:**

```
.github/skills/py-generate-tests/SKILL.md
.github/skills/py-generate-tests/references/fixtures.md
.github/instructions/python-py-conventions.instructions.md   ← applyTo: "**/*.py"
.github/agents/code-reviewer.agent.md
```

Copilot Chat picks up `.github/instructions/*.instructions.md` for files matching `applyTo` and
loads `.github/skills/*/SKILL.md` as native Agent Skills (invocable as `/name`).

---

## Install the .NET tooling pack as a Claude plugin

Compile and install the plugin so any Claude Code user can `/plugin install dotnet-tooling@sigil` without
needing this repo locally:

```bash
# 1. Compile from the catalog repo
cd /path/to/sigil
sigil build --target claude
# → writes dist/claude/

# 2. In Claude Code, point at the generated marketplace:
# /plugin marketplace add /path/to/sigil/dist/claude
# /plugin install dotnet-tooling@sigil
```

**Plugin layout:**

```
dist/claude/
  .claude-plugin/marketplace.json
  plugins/dotnet-tooling/
    .claude-plugin/plugin.json     ← version = npm package version
    skills/cs-generate-tests/SKILL.md  ← rule bodies inlined under ## Applied Rules
    agents/cs-code-reviewer.md
    agents/cs-architecture-reviewer.md
```

---

## Browse the catalog

```bash
sigil list                      # all artifacts
sigil list --language python    # filter by language
sigil list --kind skill         # skill | agent | rule | prompt | workflow | mcp | hook | settings | template
```

**Expected output (`sigil list --kind skill --language csharp`):**

```
SKILL (7)
  csharp/cs-add-package [csharp] — Vet and wire a NuGet package through Central Package Management — checks CVEs, maintenance, transitive footprint, and license before adding
  csharp/cs-audit-deps [csharp] — Audit NuGet dependencies — known CVEs, outdated versions, deprecated packages, unused references, and license compliance
  csharp/cs-document [csharp] — Generate or update XML doc comments and module-level documentation following the project's documented docstring style
  csharp/cs-release [csharp] — Prepare a .NET release — verify quality gates, generate a changelog from git log, and propose a version bump with SemVer classification
  csharp/cs-generate-tests [csharp] — Generate an xUnit + Moq test suite for a C# file or class following the project's documented test conventions
  csharp/cs-scaffold-project [csharp] — Scaffold a new .NET project with the solution's standards pre-wired — NRT, analyzers, CPM, file-scoped namespaces, correct src/tests layout — and add it to the .sln
  csharp/cs-sync-tests [csharp] — Sync the xUnit test suite with source code — add missing tests, update stale ones, and remove orphaned tests (with confirmation before deletion)
```

An unfiltered `sigil list` uses the same shape: a `KIND (N)` header, then `  <id> [<language>] — <description>` for each artifact. `template` is a catalog kind `list` can filter; neither target installs it.

---

## Bulk install

```bash
# Full catalog — Claude Code
sigil add all --target claude --yes

# All artifacts from one pack
sigil add pack:dotnet-tooling --target claude --yes

# Full catalog except prompts — GitHub Copilot
sigil add all --target copilot --exclude prompt --yes

# Only agents and rules, no skills or prompts
sigil add all --kind agent,rule --target claude --yes
sigil add kind:agent kind:rule --target claude --yes

# --kind also accepts workflow, mcp, hook, and settings (comma-separated)
sigil add all --kind mcp,hook,settings --target claude --scope project --yes
```

---

## Install a skill without its dependency closure

By default `add skill:...` writes the skill **plus** the rules and agents it references. Use
`--no-deps` if you manage those separately:

```bash
sigil add skill:csharp/cs-generate-tests --no-deps --target claude --yes
# Only writes: .claude/skills/cs-generate-tests/SKILL.md + references/
```

---

## Preview before writing (dry run)

```bash
sigil add skill:csharp/cs-generate-tests --target claude --dry-run --yes
```

Output shows `+` for new files and `~` for conflicts — nothing is written. With
`.claude/skills/cs-generate-tests/SKILL.md` already on disk and no sigil manifest entry for it:

```
Dry run — files that would be written:
  + .claude/rules/csharp-cs-testing.md
  + .claude/agents/cs-code-reviewer.md
  ~ .claude/skills/cs-generate-tests/SKILL.md  (exists — would be overwritten with --overwrite)

2 new, 1 conflict(s). No files were written.
```

---

## Handle conflicts

Existing files are **never overwritten** by default:

```bash
# First install writes the skill plus its uses: closure.
sigil add skill:csharp/cs-generate-tests --target claude --yes

# Second install of the same up-to-date artifact is a skip, not a conflict:
#   =  csharp/cs-generate-tests  (✓ already up to date — skipped)
# No artifacts to install (all were filtered out or unsupported).

# A file sigil does not already own is a conflict. The new files are still
# written; the existing one is left in place unless --overwrite is set:
# ▲  1 file(s) already exist and were NOT overwritten:
#      .claude/skills/cs-generate-tests/SKILL.md
#    Re-run with --overwrite to replace them, or use --dry-run to preview first.
# ✓ 2 operation(s) applied to <project>, 1 skipped (conflicts)

sigil add skill:csharp/cs-generate-tests --target claude --overwrite --yes
```

---

## Keep installs healthy over time

After the initial install, sigil tracks what it wrote in `.sigil/manifest.json` — a small JSON
ledger that records each artifact, its files, and the SHA-256 hash of every file at install time.

> **Commit this file.** `.sigil/manifest.json` is project state, not a build artifact. Committing
> it means every team member and every CI run can use the lifecycle commands below without losing
> install history.

```bash
# See the current health of everything sigil installed
sigil status --target claude
```

```
  ✓  csharp/cs-generate-tests  [up-to-date]
  ✓  csharp/cs-testing  [up-to-date]  (dep of csharp/cs-generate-tests)
  ✓  csharp/cs-code-reviewer  [up-to-date]  (dep of csharp/cs-generate-tests)

  3 artifact(s): 3 up-to-date
```

```bash
# Re-scaffold outdated artifacts (skips files you edited — use --force to overwrite those too)
sigil update
sigil update csharp/cs-testing   # single artifact, bare catalog id
```

A non-`up-to-date` row prints its reason on the next indented line. For `outdated` that line is
`template <id> rev <from>→<to>`. `sigil status` does not re-scaffold, so a body change that is not
a template revision stays `up-to-date` here; `sigil update` applies it anyway. Config kinds never
show as `outdated` on this command — a changed JSON fragment is `drifted` or `missing`. This is
purely diagnostic on the consumer side: the propagation itself is still `update` (single artifact
or, with no ids, everything). Catalog **authors** — not consumers — are the ones who run
`sigil sync` to find and mechanically fix artifacts that drifted from their _own_ template; see
`docs/guides/authoring.md` § Keeping artifacts in sync with their template.

```bash
# Remove an artifact and its files (refcount-aware: a file still recorded by
# another installed entry is kept). Pass the bare catalog id — a kind: prefix
# does not match and exits with "Not installed".
sigil uninstall csharp/cs-generate-tests

# Report manifest entries whose ids are gone from the catalog. Preview only
# until --apply, which removes the orphaned entries.
sigil prune
sigil prune --apply
```

**Status values at a glance:**

| Status       | Meaning                                                                            |
| ------------ | ---------------------------------------------------------------------------------- |
| `up-to-date` | Files match what the current catalog would produce                                 |
| `outdated`   | The artifact's template changed since you installed — `sigil update`               |
| `drifted`    | You edited a file — `update` skips it; `update --force` replaces it                |
| `missing`    | A sigil-owned file was deleted — `update` restores it                              |
| `orphaned`   | Artifact removed from the catalog — `sigil prune` reports it; `--apply` removes it |

**Picker glyphs.** Before writing, the wizard labels each candidate and starts every item unchecked:
`＋ new`, `✓ installed`, `↑ new version available`, `✎ you edited this`, `⚠ not installed by sigil`,
`! missing from disk`. The header counts what is already installed versus new (for example
`3 already installed, 1 new`). The six states behind those glyphs are in
[`src/wizard/CLAUDE.md`](../../src/wizard/CLAUDE.md).

**`add` without the wizard.** An up-to-date artifact prints
`=  csharp/cs-generate-tests  (✓ already up to date — skipped)`. When every requested id is up to
date the command then prints `No artifacts to install (all were filtered out or unsupported).` and
does not print a conflict summary. Those skips do not change the exit code. `--overwrite` reinstalls
even an up-to-date artifact.

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

After sourcing: `sigil add <Tab>` suggests `all`, `pack:dotnet-tooling`, `kind:skill`,
`skill:csharp/cs-generate-tests`, etc. Flag values also complete: `--target <Tab>` → `claude copilot`.

---

## Path strategy

- **Catalog source** is embedded in the package — run `sigil` from any directory.
- **Output root** defaults to the current working directory; override with `--project-dir`.

```bash
# Monorepo: install into a specific package
sigil add skill:csharp/cs-generate-tests --project-dir packages/my-api --yes
```

Claude Code writes to `.claude/`; Copilot writes to `.github/`. Target auto-detection checks for
these directories at the project root. When both exist it defaults to `claude` — override with `--target`.

---

> **Troubleshooting** — wizard hangs, conflicts, schema errors → [reference/troubleshooting.md](../reference/troubleshooting.md)
> **Full flag reference** → [reference/spec.md § CLI reference](../reference/spec.md#cli-reference)
