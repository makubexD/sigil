<p align="center">
  <img src="docs/assets/sigil-logo.svg" width="280" alt="Sigil — one source, every assistant">
</p>

<p align="center">
  <strong>Write AI coding instructions once. Compile to Claude Code, GitHub Copilot, and more.</strong>
</p>

---

> **Status:** v0.1 — reference catalog for C#, TypeScript, Angular, Python, and React. Not yet
> published to npm.
> Build from source (below) and invoke with `sigil` once linked.

## Why

Every AI tool has its own format for coding instructions. Today you re-type the same
"how to write a good unit test" guidance for Claude, then again for Copilot, in each tool's
own syntax. When guidance changes, it drifts.

**Sigil** solves this with a **canonical-source → compiler** approach:

- Author skills, agents, and rules **once** in plain Markdown with YAML frontmatter.
- Express DRY reuse through `extends:` (rules inherit rules) and `uses:` (skills reference rules/agents by ID).
- A build step compiles the resolved catalog to each platform's native layout.
- Adding a language = one new folder. Adding a new AI platform = one new adapter.

## Install

```bash
# Zero-install (after publish)
npx sigil <command>

# Global install (recommended for repeated use)
npm install -g sigil
sigil <command>
```

### Build from source (contributors / pre-publish)

```bash
git clone <repo-url>
cd sigil
npm install
npm run build       # sets heap flag automatically via cross-env
npm run validate    # should report: ✓ All 149 artifact(s) are valid.
npm link            # one-time: registers global `sigil` symlink
```

## Quick start

**Fastest path — one command, pick exactly what you want.** Run from your project root; the
catalog ships inside the package and files land in your project (tracked in
`.sigil/manifest.json` for `status` / `update` / `uninstall`):

```bash
sigil add                                  # guided wizard: pick target, kinds, artifacts
sigil list --kind skill                    # browse before installing (also: sigil search <query>)
```

Or grab individual artifacts — each pulls in the rules and agents it `uses:`:

```bash
sigil add skill:typescript/ts-generate-tests   # test generation in the project's own runner
sigil add agent:typescript/ts-code-reviewer    # per-change reviewer that makes no edits
sigil add skill:shared/cli                     # CLI design skill + path-scoped rule + auditor agent
sigil add pack:typescript-starter              # a curated bundle (see Packs below)
```

> **Only pay for what you load.** A skill or agent costs only its short description until it is
> used; a rule loads its full text whenever a matching file is read. Pick per artifact rather
> than whole packs when you want a lean context. Rules install as standalone, path-scoped files only this
> way (plugins can carry them only inlined into the skills that `uses:` them), and settings
> (permissions, env, model) only this way — no plugin format can carry them (see
> [the distribution decision](docs/decisions/distribution-channels-2026-09.md)).

Prefer a native integration? Pick your tool below.

<details>
<summary><b>Claude Code (recommended)</b></summary>

**Scaffold** (all kinds, per artifact) — writes `.claude/skills|agents|rules/` and merges
hooks/settings/MCP into `.claude/settings*.json` / `.mcp.json`:

```bash
sigil add skill:csharp/cs-generate-tests          # --target auto-detected (.claude/ → claude)
sigil add kind:mcp --scope project                # config kinds take --scope local|project|user
```

**Marketplace plugin** (local build — a published marketplace is planned) — plugins carry skills
and agents, one plugin per pack:

```bash
sigil build --target claude                       # run inside the sigil repo
claude plugin marketplace add ./dist/claude       # or /plugin marketplace add inside Claude Code
claude plugin install typescript-tooling@sigil --scope project
```

Install plugins at `project` scope: a `user`-scope plugin loads its skill and agent descriptions
in every project on the machine.

</details>

<details>
<summary><b>GitHub Copilot (VS Code / CLI / cloud agent)</b></summary>

Writes `.github/skills/`, `.github/agents/`, `.github/instructions/*.instructions.md` (rules, with
`applyTo:`), and prompt files; MCP merges into `.vscode/mcp.json` and, for Copilot CLI, `.mcp.json`:

```bash
sigil add --target copilot                        # wizard
sigil add skill:python/py-generate-tests --target copilot
```

Commit the generated `.github/` files — Copilot's cloud agent reads repository files, not locally
installed plugins.

</details>

<details>
<summary><b>Other agents (Codex, Cursor, Gemini, …)</b></summary>

No dedicated target yet (Codex and Cursor adapters are planned). Skills follow the open
[Agent Skills](https://agentskills.io/specification) format, and several agents also read
`.claude/skills/` or `.github/skills/` directly — scaffold with `--target claude` or
`--target copilot` and point your agent at those folders.

</details>

## Available artifacts

The catalog ships **149 artifacts** across 5 languages plus shared, stack-agnostic ones. Use `sigil list` to browse; use
`sigil search <query>` to find by keyword.

**Languages:** `csharp` (.NET / C#) · `typescript` · `angular` · `python` · `react` · `shared` (all languages) —
python and react carry full rule/agent/skill coverage on par with csharp/typescript/angular as of
the 2026-08-26 catalog-parity round.

**Packs** (install a curated bundle at once):

| Pack                 | Contents                                                |
| -------------------- | ------------------------------------------------------- |
| `essentials`         | Filesystem MCP, config protection, dev-tool permissions |
| `dotnet-starter`     | xUnit testing skill + deps + essentials                 |
| `dotnet-tooling`     | All cs- skills, agents, and rules                       |
| `typescript-starter` | Generate-tests, document, release skills + essentials   |
| `typescript-tooling` | All ts- skills, agents, and rules                       |
| `angular-starter`    | Generate-tests, generate-component skills + essentials  |
| `angular-tooling`    | All ng- skills, agents, and rules                       |
| `python-starter`     | pytest testing skill + deps + essentials                |
| `react-starter`      | generate-tests skill + deps + essentials                |

**Skills per language (7 each — cs-/ts-/ng-/py-/react-):** generate-tests · scaffold-project ·
document · add-package · audit-deps · release · sync-tests (Angular swaps scaffold-project for
generate-component).

**Agents per language (7 each; Angular adds template-reviewer):** code-reviewer · debugger ·
refactor-specialist · security-auditor · performance-profiler · architecture-reviewer ·
api-compat-reviewer.

**Rules per language (11 each; Angular adds components · rxjs · signals · templates):** async ·
conventions · code-quality · dependencies · documentation · git · logging · security · testing ·
project-layout · one ecosystem rule (nuget/npm/packaging, language-specific).

### Core pre-import skills

| ID                           | Title                         | Language |
| ---------------------------- | ----------------------------- | -------- |
| `csharp/cs-generate-tests`   | Write xUnit Tests for .NET    | C#       |
| `python/py-generate-tests`   | Write pytest Tests for Python | Python   |
| `react/react-generate-tests` | Write React Component Tests   | React    |

### Shared (stack-agnostic) skills

`shared/cli` and `shared/wizard` each carry one reference file per stack (Node/TypeScript,
Python, Go, Rust, .NET) and pull in their path-scoped rule and auditor agent through `uses:`.
`shared/feature` is a user-invoked conductor (`/feature <what to build>`) over
[agent-skills](https://github.com/addyosmani/agent-skills), which you install separately.

| ID               | Title                                             | Pulls in                                       |
| ---------------- | ------------------------------------------------- | ---------------------------------------------- |
| `shared/cli`     | CLI Design (Small-Language Grammar)               | `shared/cli-rules`, `shared/cli-auditor`       |
| `shared/wizard`  | Setup Wizard Design (Front End over CLI Flags)    | `shared/wizard-rules`, `shared/wizard-auditor` |
| `shared/feature` | Feature Conductor (Gated Spec-Driven Development) | — (requires agent-skills)                      |

### Shared agents and rules

| ID                      | Kind  | Scope                                      |
| ----------------------- | ----- | ------------------------------------------ |
| `shared/code-reviewer`  | agent | All languages                              |
| `shared/cli-auditor`    | agent | CLIs (audit; makes no edits)               |
| `shared/wizard-auditor` | agent | Setup wizards (audit; makes no edits)      |
| `shared/clean-code`     | rule  | All files                                  |
| `shared/git`            | rule  | All files                                  |
| `shared/cli-rules`      | rule  | CLI entry points and command modules       |
| `shared/wizard-rules`   | rule  | Wizard engines, flows, and prompt adapters |

### Prompts

| ID                       | Title                         |
| ------------------------ | ----------------------------- |
| `shared/explain-diff`    | Explain a Code Diff           |
| `shared/author-artifact` | Author a New Catalog Artifact |

## Library usage

Sigil is primarily a CLI, but `config-merge`'s pure JSON-merge primitives — the machinery behind
`mcp`/`hook`/`settings` install, drift detection, and repair — are also published as a small,
curated library surface for programmatic use (e.g. a tool that wants to detect or repair drift in
a sigil-managed config file without shelling out to the CLI):

```ts
import { applyMerge, classifyConfigDrift, detectConfigDrift } from 'sigil';
```

Everything else — the pipeline stages, target adapters, wizard, commands — is intentionally not
exported; only `.` and `./package.json` resolve via the package name (`package.json`'s `exports`
map). See `src/index.ts` for the full exported surface and `CLAUDE.md`'s "public library surface"
invariant for why it stays curated rather than exposing all of `dist-cli/`.

## Learn more

| Document                                                               | Purpose                                                   |
| ---------------------------------------------------------------------- | --------------------------------------------------------- |
| [docs/index.md](docs/index.md)                                         | Documentation hub — one line per doc, command cheat-sheet |
| [docs/guides/consuming.md](docs/guides/consuming.md)                   | Install skills into a project — wizard, `add`, `list`     |
| [docs/guides/authoring.md](docs/guides/authoring.md)                   | Add new skills, rules, or languages to the catalog        |
| [docs/guides/operations.md](docs/guides/operations.md)                 | Build targets, CI gate, `release` command                 |
| [docs/reference/spec.md](docs/reference/spec.md)                       | Frontmatter schema, platform mapping, CLI flags           |
| [docs/reference/troubleshooting.md](docs/reference/troubleshooting.md) | Common errors and FAQ                                     |
| [CONTRIBUTING.md](CONTRIBUTING.md)                                     | Authoring rules, DRY conventions, PR process              |
| [CHANGELOG.md](CHANGELOG.md)                                           | Version history                                           |
| [CLAUDE.md](CLAUDE.md)                                                 | Build internals and architecture (for code contributors)  |

## License

MIT — Copyright (c) 2026 makudev1719
