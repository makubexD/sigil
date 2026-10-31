# Distribution channels: per-artifact scaffold vs. plugin marketplaces (2026-09-26)

## Why

Marketplace-style repositories such as `addyosmani/agent-skills` install with two commands
(`/plugin marketplace add …` then `/plugin install …`), keep everything under the tool's own
plugin cache (`~/.claude/plugins/marketplaces/<name>/`), and need no project-side manifest. On the
machine that prompted this review, that marketplace installed **one** plugin carrying all 25
skills, 9 commands and 4 agents. sigil does the opposite: `sigil add` cherry-picks individual
artifacts into the project and records them in `.sigil/manifest.json`.

The question: is sigil's approach still right, or should it follow the marketplace standard —
keeping per-artifact flexibility, multi-AI support, and a low token cost at load time? Follow-ups
in the same session asked (a) whether a large marketplace burns context in every project, (b)
which artifact kinds plugins can carry at all, (c) how to keep the design easy to extend as
targets diverge, and (d) whether a multi-file "self-adopting" skill layout (`gid`'s `cli` and
`wizard` skills) should replace sigil's approach.

## Decision summary

1. **Keep the deterministic CLI and add a published marketplace — split by kind, not competing.**
   Plugins carry _capabilities_ (skill, agent, prompt-as-skill, hook, mcp); `sigil add` carries
   _policy_ (rules, settings) and anything a team or cloud agent must find committed in the repo.
   `sigil add` stays the only per-artifact precision channel.
2. **Marketplace granularity: one plugin per pack, plus one per hook or MCP server** (`mcp-<server>`),
   enabled at **project** scope by default. This is the cheapest channel measured. The original
   decision was per language × family (`ts-review`, `ts-testing`); measuring it rejected the split
   ([§9](#9-plugin-granularity-no-go-2026-10-30)).
3. **Architecture: one declarative per-target capability table** that every consumer (selection,
   plugin assembly, complement mode, docs) reads — extend the existing `Target`/`KindEmitSpec`
   model, don't rewrite it.
4. **Reject the LLM-as-installer pattern; adopt its packaging.** A skill whose `adopt` mode makes
   the model write rules/agents into the project spends tokens on every run and has no reliable
   uninstall/drift story. Its _file layout_ — a lean `SKILL.md` with on-demand `references/` — is
   cheaper per invocation than sigil's current output and is supported by every major tool.
5. **Migrate `gid`'s `cli`/`wizard` skills into the catalog** as shared (language-less) skills —
   done in this change (see §7).

## 1. How plugin marketplaces actually work

- **The whole plugin is the on/off unit** in Claude Code, VS Code and Copilot CLI: enablement is
  recorded per plugin (`enabledPlugins`), and none documents a per-skill/agent/hook toggle inside a
  plugin ([Claude — install plugins](https://code.claude.com/docs/en/plugins/install),
  [VS Code — agent plugins](https://code.visualstudio.com/docs/agent-customization/agent-plugins)).
  Only Cursor toggles individual items (e.g. each rule's mode) inside a plugin.
- **Per-item choice through a marketplace therefore means many small plugins** — the pattern of
  [`wshobson/agents`](https://github.com/wshobson/agents) (94 granular, single-purpose plugins) and
  [`anthropics/skills`](https://github.com/anthropics/skills/blob/main/.claude-plugin/marketplace.json)
  (several `strict: false` plugins each selecting a `skills: [...]` subset of one shared tree).
- **`/plugin marketplace add` only clones and registers** the catalog; content reaches context
  only once a plugin is installed _and enabled_, and install scope decides where: `user` = every
  project on the machine, `project`/`local` = that repository only
  ([Claude — install plugins](https://code.claude.com/docs/en/plugins/install)).
- **One Claude-format marketplace is read by several tools**: VS Code detects
  `.claude-plugin/plugin.json`, Copilot CLI loads it as a legacy plugin
  ([GitHub — CLI plugin reference](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-plugin-reference)),
  and OpenAI's plugin tooling (ChatGPT / Codex) reads a legacy-compatible
  `.claude-plugin/marketplace.json`
  ([OpenAI — build plugins](https://developers.openai.com/plugins/build/plugins)). "It loads" is
  not "it behaves identically" — agent frontmatter and hook matchers differ per tool.
- **sigil already builds a Claude marketplace** (`dist/claude/`, one plugin per `packs.yaml` pack),
  but it is unpublished (`dist/` is gitignored), coarse (9 packs), drops prompts/hooks/MCP
  (`plugin-assemble.ts` emits only skill/agent/workflow), and keeps stale pack directories because
  `build` never cleans `dist/`.

## 2. Cost: does a large marketplace burn tokens in every project?

What an **enabled** plugin — or the same artifact scaffolded into `.claude/` — costs per session
([Claude — skills](https://code.claude.com/docs/en/skills),
[Claude — MCP tool search](https://code.claude.com/docs/en/mcp),
[VS Code — agent tools](https://code.visualstudio.com/docs/agents/run/tools),
[Codex — skills](https://learn.chatgpt.com/docs/build-skills)):

| Component               | Always in context                                                | On demand                               |
| ----------------------- | ---------------------------------------------------------------- | --------------------------------------- |
| Skill                   | name + description (listing capped at 1,536 chars)               | body when invoked; references when read |
| Agent                   | name + description                                               | body when invoked                       |
| Hook                    | nothing (only output it emits)                                   | —                                       |
| MCP — Claude            | tool names (schemas deferred via tool search)                    | schemas when searched                   |
| MCP — Copilot / VS Code | every enabled tool schema (128-tool cap)                         | —                                       |
| Rule (`.claude/rules`)  | full body if unscoped                                            | full body when a `paths:` match is read |
| Codex skill listing     | name + description, whole listing ≈ 2 % of context / 8,000 chars | body                                    |

The always-loaded prefix is prompt-cached, so later turns bill at a fraction — but it still
occupies the window, and overlapping descriptions from irrelevant languages hurt dispatch.

**sigil's catalog, measured at the time of writing** (≈ 4 chars/token, script over `catalog/`):
37 skills (~4.4k tok always-on metadata), 39 agents (~3.6k), 62 rules (~57k tok of bodies, avg
~920 each).

| Scenario                                                  | Always-on per session        | Loaded when a matching file is read                           |
| --------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------- |
| A — whole catalog as one plugin, user scope               | **~8k tok in every project** | — (rules only inlined in skills)                              |
| B — family plugins, project scope (e.g. 2 TS families)    | **~0.3–0.6k tok**            | —                                                             |
| C — `sigil add` of all TypeScript skills + agents + rules | ~1.5k tok                    | **~12.6k tok of TS rules**, plus ~1.9k of `**/*` shared rules |

Conclusions:

1. A marketplace is not expensive by itself; a **monolithic plugin enabled at user scope** is.
   Family-granular plugins at project scope are the cheapest option available.
2. **Rules are the real token cost in any channel.** Scaffolded rules load in full; plugin skills
   inline rule text into `SKILL.md`, measured at **~58 % of the ~2.4k tokens a sigil plugin skill
   loads on invocation**.
3. Copilot loads MCP schemas up front, so MCP servers must be their own opt-in plugins.
4. Codex's listing budget makes short descriptions a multi-AI requirement, not a style choice.

## 3. What a plugin can carry, per ecosystem

| sigil kind | Claude plugin                                                      | Copilot plugin (CLI + VS Code)                            | Codex plugin                       | Cursor plugin    | Gemini extension             |
| ---------- | ------------------------------------------------------------------ | --------------------------------------------------------- | ---------------------------------- | ---------------- | ---------------------------- |
| skill      | ✅                                                                 | ✅                                                        | ✅                                 | ✅               | ✅                           |
| agent      | ✅ (ignores `hooks`/`mcpServers`/`permissionMode`/`initialPrompt`) | ✅                                                        | ❌ (native `.codex/agents/*.toml`) | ✅               | ✅ (preview)                 |
| prompt     | ✅ as skill / command                                              | ⚠ "commands", not `.prompt.md`                            | ❌ (prompts deprecated → skills)   | ✅               | ✅ `commands/*.toml`         |
| hook       | ✅                                                                 | ✅ (VS Code ignores matchers)                             | ✅                                 | ✅               | ✅                           |
| mcp        | ✅                                                                 | ✅                                                        | ✅                                 | ✅               | ✅                           |
| rule       | ❌ (write it as a skill)                                           | ⚠ AP1.0 `com.github.copilot/rules/` — format undocumented | ❌                                 | ✅ `rules/*.mdc` | ⚠ one always-on context file |
| settings   | ❌ (only `agent`, `subagentStatusLine`)                            | ❌                                                        | ❌                                 | ❌               | ⚠ env vars / tool excludes   |

Sources: [Claude — plugin manifest reference](https://code.claude.com/docs/en/plugins/manifest-reference),
[GitHub — CLI plugin reference](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-plugin-reference),
[OpenAI — build plugins](https://developers.openai.com/plugins/build/plugins),
[Cursor — plugins reference](https://cursor.com/docs/reference/plugins),
[Gemini CLI — extensions reference](https://geminicli.com/docs/extensions/reference).
The cross-vendor [Agent Plugins](https://agent-plugins.org/) standard makes only skills and MCP
portable, and Claude is not listed among its adopters — so the Claude format stays sigil's primary
marketplace format.

**Consequence:** plugins can carry five of sigil's seven kinds, but **rules and settings are
scaffold-only** for Claude, Copilot and Codex (settings everywhere). Delivering the same artifact
through both channels is harmful: Claude namespaces plugin items, so it loads both copies; Copilot's
first-found wins, so one silently shadows the other. A complement mode must keep them disjoint.

## 4. Multi-file skills and the "self-adopting" pattern

`gid`'s `cli` and `wizard` skills are a short `SKILL.md` plus `references/*.md` (loaded per mode),
`references/stacks/<lang>.md` (one per stack), `assets/<x>-rules.md`, and `assets/adapters/*` —
wrappers for `.claude/rules`, `.claude/agents`, `.github/instructions`, `.github/agents` and an
`AGENTS.md` block that an `adopt` mode has **the model itself** write into the project after
approval.

- **The layout is standard, not over-engineering.** `scripts/`, `references/` and `assets/` with
  on-demand loading are part of the [Agent Skills specification](https://agentskills.io/specification)
  and documented by Claude, VS Code/Copilot, Codex, Cursor and Gemini; the per-stack split is
  Anthropic's recommended domain-specific organization
  ([Claude — skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)).
  Invoking `cli` loads ~1.7k tokens of a ~13k-token folder.
- **The install mechanism is rejected.** Every `adopt` run spends tokens (the model reads the
  templates and generates files; `sigil add` spends none), is model-dependent, is risky for JSON
  config merges, and has no manifest-backed uninstall/update/drift. The two skills also forked 17
  same-named files — the duplication sigil's source model exists to prevent.
- **The packaging is adopted** (roadmap Phase 1c): sigil's loader currently reads only flat
  `references/*.md`; it should read nested `references/`, `assets/`, `scripts/`, and emit rule text
  as on-demand references instead of inlining it into every skill body.

## 5. Architecture: a declarative capability model

Targets differ in what they support per channel, so kind support becomes data, not code:

```ts
type ChannelId = 'scaffold' | 'plugin';
type KindSupport =
  | { mode: 'native'; docs: readonly DocRef[] }
  | { mode: 'via'; as: ArtifactKind | 'inline' | 'reference'; docs: readonly DocRef[] }
  | { mode: 'none'; reason: string; docs: readonly DocRef[] };
type ChannelCapabilities = Readonly<Record<ArtifactKind, KindSupport>>; // every kind, compiler-enforced
interface TargetCapabilities {
  readonly scaffold: ChannelCapabilities;
  readonly plugin?: ChannelCapabilities;
}
```

- `Target` gains `capabilities`; today's `supportedKinds` (19 consumers) becomes a derived helper —
  one declaration instead of a list plus a matrix (DRY), no consumer rewritten (Open/Closed).
- Selection's warn-and-skip, the plugin assembler's kind filter, the wizard and
  `provider-kind-coverage` all read the same table (complement mode will too, in Phase 2b); `via`
  and platform-limit `none` rows carry their `DocRef`, so `sync --stale` flags a provider changing
  support, and the kind × channel docs matrix is generated.
- **Implemented (Phase 1a, 2026-09-27).** Two refinements over the sketch above: `native` rows
  carry no `docs` (their citation already lives on the KindEmitSpec that `provider-kind-coverage`
  requires — repeating it would be a second source), and the matrix
  ([capabilities.md](../reference/capabilities.md)) is generated by `npm run build` with a staleness
  test, the same pattern as `schema/*.json`, rather than by `sigil sync` — no new file-writing path
  in the conformance engine. `dist/` was verified byte-identical before/after (all 197 files, modulo
  the ordering issue noted under Phase 0 and `registry.json`'s timestamp).
- Plugin grouping stays provider-neutral in `packs.yaml`: a `select:` field reuses the existing
  selector grammar, and a pure `planPlugins()` feeds each provider's renderer (Single
  Responsibility).
- YAGNI: a shared `MarketplaceFormat` strategy and a TOML merge primitive are extracted only when
  the Codex adapter supplies the second concrete implementation.
- Adding a target stays "one folder + `registerTarget()`"; each omission is a compile error or a
  failing conformance rule.

## 6. Roadmap (each phase built separately; suggested order 1a → 1c → 1b → 0 → 1 → 2 → 2b → 3 → 4 → 5 → 6)

| Phase | Scope                                                                                                                                                                                                                                                                                      | ⚠                 |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------- |
| 0     | Marketplace hygiene: `build` cleans `dist/<target>/`; prompts emitted (or doc fixed); no empty plugins; refresh `consuming.md`; make catalog load order deterministic (today `AGENTS.md` and `registry.json` order varies between identical builds — a blocker for Phase 2's CI sync gate) | deletes `dist/`   |
| 1a    | Capability model (behaviour-preserving; `dist/` identical before/after); generated capability matrix doc — **done 2026-09-27**                                                                                                                                                             |                   |
| 1c    | Rich skill packaging (nested `references/`, `assets/`, `scripts/` via the trust scanner; one shared resource emitter); rules as references option; un-flatten `cli`/`wizard` stacks                                                                                                        |                   |
| 1b    | `sigil cost` (always-on / on-match / on-invoke tokens) + budget conformance rules                                                                                                                                                                                                          |                   |
| 1     | Family-granular Claude marketplace via `Pack.select`; hooks/MCP as their own opt-in plugins; prompts as skills; plugin-agent field guard                                                                                                                                                   |                   |
| 2     | Publish the marketplace in git + CI sync gate; project-scoped `enabledPlugins` snippet                                                                                                                                                                                                     | CI and git layout |
| 2b    | `sigil add --complement` + duplicate guard against enabled sigil plugins                                                                                                                                                                                                                   |                   |
| 3     | Agent Skills conformance (`name` = directory, ≤64/≤1024 chars) so `npx skills add … --skill x` works                                                                                                                                                                                       |                   |
| 4     | Verify the Claude-format marketplace in VS Code / Copilot CLI; Agent Plugins 1.0 output only if a gap remains                                                                                                                                                                              |                   |
| 5     | Codex adapter (`.agents/skills`, `AGENTS.md`, `.codex/agents/*.toml`, `config.toml` merges, Codex plugin)                                                                                                                                                                                  |                   |
| 6     | Cursor adapter (`.cursor/rules/*.mdc`, agents, commands, hooks, MCP; Cursor plugin — the one format that carries rules)                                                                                                                                                                    |                   |

"No empty plugins" (Phase 0) is done as of 2026-10-30
([publish-claude-marketplace-2026-10](publish-claude-marketplace-2026-10.md#empty-plugins)), and
`build` cleaning `dist/<target>/` before it writes is done as of 2026-10-30. Phase 1's plugin-agent
field guard is done as of 2026-10-30: `build` fails when a plugin agent would carry a field Claude
plugins ignore. Prompts as plugin skills is done as of 2026-10-30: `essentials` returns to the
marketplace as a plugin carrying only `/essentials:explain-diff`. `author-artifact` stays out until
npm publish, because it needs the `sigil` CLI. Hooks and MCP as their own opt-in plugins is done as
of 2026-10-30: `build` generates one plugin per artifact, and pack plugins carry neither kind
([§8](#8-hooks-and-mcp-as-plugins-2026-10-30)). The family-granular split and `Pack.select` are a recorded
no-go as of 2026-10-30 ([§9](#9-plugin-granularity-no-go-2026-10-30)), which closes Phase 1.

Every phase that creates an install route adds its `<details>` block to the README Quick Start (the
agent-skills layout adopted in this change: fastest path, individual picks, a cost/limits callout,
then one collapsible section per tool) plus a `docs/setup/<tool>.md` page.

## 7. Done in this change

- **Shared skills**: `SkillSchema.language` is optional (as it already was for every other kind);
  the now-dead `requiresLanguage` descriptor flag is removed; `sigil new`'s wizard offers "shared"
  for skills.
- **Migrated `gid`'s skills** (source untouched): `shared/cli` and `shared/wizard` (the `adopt` mode
  removed; `references/stacks/*` flattened to `references/stack-*.md` until Phase 1c; paths made
  skill-root-relative), their rules `shared/cli-rules` / `shared/wizard-rules` (conservative default
  `appliesTo` globs) and auditor agents `shared/cli-auditor` / `shared/wizard-auditor` (no edit
  tools; they preload their skill and find its `references/auditor.md` by a fixed search order, not
  a hard-coded install path). The adapters were dropped — sigil's targets emit those files.
- **Install audit (2026-09-27).** A real `sigil add` of both skills, their deps, `shared/protect-config`
  and `shared/allow-dev-tools` into a scratch project was audited file by file against the official
  Claude Code docs and every linked source. Install mechanics were correct. What it found, and the
  fix:
  - migration leftovers (`stacks/` paths), a hijacked `fuget.org` link and a dead API link, and
    about 35 accuracy fixes in the migrated content;
  - agents could not preload a skill: added `claude: { skills }`;
  - the auditors' fallback paths needed the `{sigil:skills-dir}` lexicon term;
  - agent descriptions that claimed "read-only" while granting Bash: reworded;
  - `shared/protect-config` never blocked: it read an env var Claude Code doesn't set. It now
    reads the stdin JSON and runs in exec form (hooks gained `args`), so exit code 2 survives
    PowerShell;
  - `add` stacked a second copy of a re-installed hook, and `update` ignored config fragments the
    catalog changed: both now replace the recorded fragment (`replaceMerge`);
  - `update` stripped every Boundary section and `add` left dependencies out of it: both now use
    the same co-install set;
  - `update` restored a missing config fragment from the manifest's own copy, and
    `.sigil/manifest.json` is committed, so an edited manifest could plant any hook command:
    `update` now writes only the catalog's op for a recorded destination and skips one the catalog
    doesn't have (`update` and `uninstall` also refuse a recorded path outside its root);
  - rule globs loaded for the skills' own markdown: scoped to source files;
  - `validate` gained the skill-local path check (the minimal slice of Phase 1c's lint; it checks
    `references/<file>`, `assets/`, `scripts/`, not bare folder names like `stacks/`, which can't be
    told apart from project paths).

  Follow-ups, not done:
  - external-link checking (link rot and lapsed domains need the network, so they belong in
    `sync --stale`-style CI, not `validate`);
  - enforcing agents' no-edit promise (a deny rule or sandbox, Claude-only, needs a design);
  - `${CLAUDE_SKILL_DIR}` in skill bodies (no Copilot equivalent);
  - `shared/protect-config`'s script is inline in `args`, so Claude Code's block message prints the
    whole script before the `sigil-hook:` reason. Shipping it as a file needs hooks that can ship
    files.
  - replacing a fragment still _reverses_ the recorded copy, removing items that are still
    exactly as recorded, so a user's own identical entry (or one an edited manifest names) can be
    removed. The fix is to record only what sigil actually added;
  - a catalog change that widens `permissions.allow` or changes a hook command applies with just
    "✓ updated". It should print the fragment diff and ask, or need `--force` when not
    interactive.

- **Live-prompt campaign (2026-09-27/28).** The install audit proved the files were right; this
  checked that they change what the models do. `docs/audits/2026-09-27/tools/live-probe.js` wiped
  the target folder, installed 7 catalog combinations (shared config kinds; TypeScript; Python; C#;
  TS + Angular; TS + React; Python + TS + the shared CLI skills), added small legacy code with
  seeded defects, and sent real prompts through `claude -p` and `copilot -p`.
  - **Worked on both providers:** skill and agent dispatch across languages, reviewers catching
    5–6 of 6 seeded defects, the hook and the settings, and rules loading per their globs.
  - **Fixed:**
    - Copilot MCP: sigil wrote only `.vscode/mcp.json`, which Copilot CLI never reads; it now also
      writes `.mcp.json`. Uninstalling one target no longer removes a server the other still uses.
    - Copilot instruction files had no `description`, which Copilot CLI's instruction index shows
      to the model.
    - Cross-stack rule globs.
    - A legacy-code line in the rules: models had copied `console.log`.
    - 15 agent descriptions that never named their language.
    - Three no-op `git` allow entries.
  - **Learned about the providers:**
    - Copilot CLI lists path-specific instructions and lets the model open them. It doesn't
      inject them.
    - Its `auto` model routes each request to a different model.
    - A plain "check this for bugs" doesn't dispatch a reviewer agent on either provider.

  Findings, evidence and cost: [`docs/audits/2026-09-27/findings.md`](../audits/2026-09-27/findings.md).

- **README Quick Start** restructured in the agent-skills style, listing only routes that work today.

## 8. Hooks and MCP as plugins (2026-10-30)

Spike on Claude Code 2.1.314. Each probe ran as `claude -p --plugin-dir` in a throwaway project with
`--setting-sources project,local`, and the hook probes used the real catalog commands. MCP probes used a local mock
server that records its argv, env and cwd.

| Question                                           | Result                                                                                                                                                                                                                                                                                                 |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Exec-form `node -e` in `hooks/hooks.json`; exit 2? | Works. `protect-config` blocked `.env` (exit 2, file absent) and allowed `.env.example`. The control without the plugin wrote `.env`.                                                                                                                                                                  |
| `${ADO_ORG}` in a plugin `.mcp.json`, set          | Expanded in `args` and `env`.                                                                                                                                                                                                                                                                          |
| Same, unset                                        | The server still starts, with the literal text `${ADO_ORG}` as its argument and `${ADO_MCP_PERSONAL_TOKEN}` as its token. `mcp list` says Connected and showed no warning, although the docs promise one. A project `.mcp.json` behaves the same at startup, so a plugin is no worse than `sigil add`. |
| `reviewer-bash-guard` against a plugin agent       | Blocks. `agent_type` is `probe-agents:cs-code-reviewer`, and the guard allowed `git status --short` from the same agent. The control without the guard created the file.                                                                                                                               |
| Same hook from a plugin and from settings          | Runs twice. Settings files dedupe among themselves (project + local ran once). Same `command` with different `args` stays two hooks, so sigil's `node` hooks do not swallow each other.                                                                                                                |
| Same MCP server name, different endpoint           | Both run, so the tools appear twice (`mcp__ado__…` and `mcp__plugin_<plugin>_ado__…`).                                                                                                                                                                                                                 |
| Same endpoint, different name                      | The plugin server is dropped and the project server wins. A `sigil add` copy of the same artifact is this case once its values expand alike.                                                                                                                                                           |

Extra checks, added because the catalog depends on them:

- **`shared/filesystem` passes `"."`.** A plugin server's cwd is the session directory, not the plugin folder, and
  `CLAUDE_PROJECT_DIR` matches it, so `.` means the same thing as it does from `sigil add`.
- **`dependencies`:** a bare name loads when the dependency is present. When missing, the dependent plugin is disabled
  with `Dependency "hook-log" is not installed`.
- **Error text:** a blocked hook returns its whole command to the model (1.6K for `protect-config`, 7.4K for
  `reviewer-bash-guard`). A settings hook does the same (1.5K measured), so this is not new to plugins.
- **`claude plugin validate --strict` passes** for both shapes with `author` and `license`, which sigil's manifests
  carry. README and icon findings are directory advice and do not fail it.

Not covered:

- `/plugin install` from a marketplace, including auto-install of a dependency, because `marketplace add` writes to
  the user's settings. `--plugin-dir` does not exercise it. It is left for the owner's clean-machine check after the
  next release.
- An interactive session. Everything ran under `-p`.
- The shipped reviewer agents' own refusal: `dotnet-tooling:cs-code-reviewer` declined the test command, so the guard
  was tested with a same-named spike agent. The guard reads only `agent_type`.
- User-scope and local-scope MCP duplicates, and the real ADO server against a literal `${ADO_ORG}`.

Decisions:

1. **One generated plugin per artifact**, `hook-<basename>` and `mcp-<basename>`, never listed in `packs.yaml`, which
   also feeds `sigil add`. Seven at the time: `hook-protect-config`, `hook-reviewer-bash-guard`,
   `hook-worker-mode-guard`, `mcp-ado`, `mcp-context-mode`, `mcp-filesystem`, `mcp-maku-jam`. The marketplace went from
   14 plugins to 21. An artifact whose `platforms` excludes `claude` gets none. A generated name equal to a pack name
   fails the build.
2. **Pack plugins never carry `hook` or `mcp`.** `PACK_PLUGIN_KINDS` holds what a pack plugin writes, separate from
   `WRITABLE_PLUGIN_KINDS`. Without this, flipping those kinds to `native` would have put `shared/filesystem`,
   `shared/protect-config` and `shared/reviewer-bash-guard` inside every starter, turned on with no separate choice.
   Starters are unchanged, and a test pins that.
3. **`deepseek-worker` depends on `hook-worker-mode-guard`** through the optional `pluginDependencies` pack field,
   holding catalog ids. Each id must be listed in that pack's `artifacts` and be a `hook` or `mcp`, and emits a bare
   name, which resolves in the same marketplace. Starters declare none, which keeps them opt-in.
4. **Keep `{sigil:env:NAME}` and `PORTABLE_MCP_ENV_SYNTAX`; no `userConfig`.** Set variables work and unset ones behave
   as `sigil add` does, so `userConfig` would only be a second way to supply values. Because nothing warns the user, a
   generated MCP plugin's description names the variables it needs, derived with `envTokenNames`.
5. **Duplicates are documented, not guarded** (Phase 2b owns the guard). Running a blocking hook twice is harmless,
   because all three hooks are deterministic checks. `consuming.md` says what happens.
6. **`consuming.md` says a plugin update can change a hook command with no review step**, unlike `sigil update`.

## 9. Plugin granularity: no-go (2026-10-30)

**Decision: keep today's packs.** Don't split `*-tooling`, and don't add `Pack.select`, a `group` field or
`planPlugins()`. No plugin name changes, so there is no migration.

Each case ran as a one-turn `claude -p --plugin-dir` session on Claude Code 2.1.314 (Sonnet) in an empty project, with
`--setting-sources project,local` and `--strict-mcp-config`. The figure is the first request's total input tokens,
cached or not, minus a session with no plugin (14,786). Two runs of each case matched exactly; `empty` ran once. The
split was four throwaway plugins cut from `typescript-tooling`.

| Plugins enabled                   | Skills | Agents | Added per session |
| --------------------------------- | ------ | ------ | ----------------- |
| `empty` (a manifest only)         | 0      | 0      | 0                 |
| `typescript-starter`              | 3      | 1      | 444               |
| `typescript-tooling`              | 8      | 7      | 2,546             |
| Split: `ts-testing`               | 2      | 0      | 361               |
| Split: `ts-review`                | 0      | 5      | 963               |
| Split: `ts-project`               | 6      | 0      | 882               |
| Split: `ts-debug`                 | 0      | 2      | 302               |
| Split: `ts-testing` + `ts-review` | 2      | 5      | 1,324             |
| All five `*-tooling` plugins      | 41     | 36     | 12,556            |

Why it is a no-go:

1. **The best realistic saving is about 1.2k tokens** (`ts-testing` + `ts-review` against `typescript-tooling`), or
   0.6 % of a 200k window, and it sits in the cached prefix, so later turns bill it at a fraction.
2. **Agent dependencies cut across the groups.** In every language, 5 or 6 of the 8 or 9 skills name an agent in
   `uses`, and `ts-generate-tests` needs the reviewer, so `ts-testing` alone (361) is not a usable unit. A plugin
   `dependencies` entry pulls in the whole of `ts-review`. `ts-project` needs it too, which leaves about 1,845 by
   adding the two rows, a saving of about 700.
3. **Starters already are the small unit.** `typescript-starter` adds 444, less than the split's testing and review
   pair, and `sigil add` remains the per-artifact channel.
4. **Install scope matters about eight times more.** Five `*-tooling` plugins at user scope add 12.6k to every
   project; enabling only the matching one per project saves about 10k. `claude plugin install` defaults to `user`.
5. **The split has a real cost.** Four groups across five languages turn 5 plugins into 20, take the marketplace from
   21 to 36, and need the Boundary sections and a plugin dependency graph kept right across groups.

What else this showed:

- **The listing is not truncated at this size.** The five `*-tooling` plugins hold 34,739 chars of descriptions, which
  at `typescript-tooling`'s rate predicts about 12,520 tokens against the 12,556 measured. The split's four parts sum
  to 2,508. So 41 skills and 36 agents all appear to reach the session in full.
- **§2's estimate of 4 chars/token runs low for this listing.** `typescript-tooling` has 7,066 chars of description
  text and adds 2,546 tokens, about 2.8 chars/token once the listing's own text is counted. The split's ~0.3–0.6k in
  §2 holds for one small group, and `ts-review` is past it.
- **Every `*-tooling` plugin is the same shape** (6.4k–7.5k chars of descriptions, 15–17 artifacts), so the TypeScript
  result carries to the other four. Only TypeScript was measured live.

Not covered:

- Whether a smaller listing improves dispatch. §2 says overlapping descriptions hurt it, but that concerned other
  languages' artifacts, which one `*-tooling` plugin doesn't add. Revisit if a live probe shows a `*-tooling` plugin
  misdispatching where a narrower set doesn't.
- An interactive session, and models other than Sonnet.
- What `/plugin update` does when a plugin disappears. No plugin is removed, so nothing depends on the answer; a future
  removal must test it first.

Follow-up, not done: `consuming.md` installs plugins with the default scope, which is `user`, while decision 2 says
project scope. Point 4 above is the reason to change that example.

## Appendix — fixes worth making in the original `gid` skills

- Make paths relative to the skill root (`references/auditor.md`, not `../../references/auditor.md`).
- Keep references one level deep from `SKILL.md` (the adapters README chained to further files).
- Add a table of contents to reference files over 100 lines (`grammar.md`, `findings.md`,
  `contract.md`).
- The `{{AUDITOR}}` wrapper path breaks when the skill is installed as a plugin or at user scope.
