# Plan: the Antigravity target (roadmap)

Phases, not steps. Each phase gets its own step-level plan, `docs/plan-antigravity-target-<phase>.md`, when it starts.
The evidence is the decision record [antigravity-target-2026-11.md](decisions/antigravity-target-2026-11.md) (the
eval, plan [plan-antigravity-eval.md](plan-antigravity-eval.md)). Its verdict is **go, staged, with target id
`antigravity`**. Probe ids (P1-P6, U1-U7) refer to that record's probe log, and V1-V7 to
[target-neutrality-regression-2026-11.md](decisions/target-neutrality-regression-2026-11.md).

## Ground rules

These are [Rules for every target](reference/architecture.md#rules-for-every-target), repeated so each phase plan
starts from them:

1. **The catalog stays provider-neutral.** Every Antigravity difference is resolved in the layer that parses or emits
   it (`KindEmitSpec`, `ToolDialect` and tier table, `ProviderLexicon`, `EnvSyntax`, `McpDialect`, `ConfigKindTable`,
   hook translation, `capabilities.ts`), never in `catalog/`, the zod schema, or `load` / `validate` / `resolve`. A
   difference no layer carries becomes a new neutral concept in its own phase, never a provider field or literal.
2. **Official sources only.** Every claim cites antigravity.google (or the Google Developers Blog). Where the docs and
   `agy` disagree, the binary decides, and the claim is kept by a live probe. Undocumented means undocumented, until a
   probe settles it.
3. **Documented best practices are data:** limits on `KindEmitSpec.limits`, scopes, trust and approval rules in
   `docs/setup/antigravity.md`. sigil's own backup and merge rules hold.

## Capability rows (target for the end of the roadmap)

| Kind     | Scaffold                                  | Plugin            | Phase |
| -------- | ----------------------------------------- | ----------------- | ----- |
| skill    | native                                    | native            | B, F  |
| rule     | native (`.agents/rules/`, always_on only) | native (`rules/`) | B, F  |
| mcp      | native                                    | native            | C, F  |
| agent    | native                                    | native            | D, F  |
| hook     | native, after Phase H                     | native, after H   | E, F  |
| prompt   | none (P3: no argument substitution)       | none              | n/a   |
| settings | none (the CLI owns its settings file)     | none              | n/a   |

## Phases

| Phase | Ships                                                                 | Gate                                                           |
| ----- | --------------------------------------------------------------------- | -------------------------------------------------------------- |
| A     | Setup note: what reaches Antigravity today with no target             | none (P1, P6)                                                  |
| B     | `--target antigravity`: skills and rules (done 2026-11-02)            | P1, P2, U5; B1 (scoped rules skipped)                          |
| C     | MCP in `.agents/mcp_config.json` and the user file                    | P5                                                             |
| D     | Agents in `.agents/agents/`                                           | U3, and tool names re-probed                                   |
| H     | Neutral hook I/O contract, events and matchers, for every hook target | V1, V2; owner signs off the contract                           |
| E     | Antigravity hooks in `.agents/hooks.json`                             | H merged; P4 re-run                                            |
| F     | Antigravity plugin channel, sigil's own builder                       | U7; a probe that an installed plugin's skill reaches a session |
| G     | Live check, the ADR updated, the brief cut, the probe script kept     | B-F merged                                                     |

### Phase A: setup note (done 2026-11-02)

Shipped `docs/setup/antigravity.md` with no code: `sigil add --target agents-standard` (or `codex`) writes
`.agents/skills/` with each skill's rules inlined, and `sigil build` for those targets writes the root `AGENTS.md` with
the repo-wide rules (`add` does not, A1). Antigravity loads both (P1, P2, A1). Nothing written for Claude reaches it
(P6). The page carries the print-mode approval note and the 20,000-token rules budget; MCP's Ask approval waits for
Phase C, since no MCP reaches Antigravity yet. Plan: [plan-antigravity-target-a.md](plan-antigravity-target-a.md).

### Phase B: the target, with skills and rules (done 2026-11-02)

Shipped `--target antigravity` (`src/targets/antigravity/`). Skills go to `.agents/skills/` through the open-standard
skill spec with Antigravity's lexicon, and `codex`, `agents-standard` and `antigravity` refuse a second owner of those
files (`sharesSkillFilesWith`). Copilot's and Cursor's overlap notes cover them. Repo-wide rules go to
`.agents/rules/<id>.md` with `trigger: always_on`, with the 24,000-byte limit as an error on a new `bytes` limit unit.
**No `AGENTS.md`**, on `add` or `build`: Antigravity also loads a root `AGENTS.md`, so a rule in both would load twice,
and the manifest tracks the rule files (this amends the earlier "repo-wide rules in `AGENTS.md`").

**Scoped rules are skipped.** B1 found no `trigger: glob` rule attaching after a read, an edit or a later turn, so the
rule spec's new `KindEmitSpec.skipReason` skips one, with that reason, and the skills that use it carry it inline. The
spec still renders the documented `trigger: glob` form, and the rule-globs agreement test checks it, so a later `agy`
that attaches glob rules needs only `skipReason` deleted, after a re-run of B1. Prompts stay `none` (U1, P3). A live
check after the phase returned the codewords of an installed rule and skill. Plan:
[plan-antigravity-target-b.md](plan-antigravity-target-b.md).

### Phase C: MCP (done 2026-11-02)

`.agents/mcp_config.json` (project) and `~/.gemini/config/mcp_config.json` (user, with the `.sigil.bak` backup) through
a `ConfigKindTable` and an `McpDialect`. `${NAME}` is not expanded (P5), but the server inherits `agy`'s environment,
so an identity entry (`NAME: {sigil:env:NAME}`) is dropped and still works; any other env token is skipped with its
reason. That behavior is a new neutral dialect value, `envSyntax: 'inherited'`, not an Antigravity branch. C1 showed
every documented entry shape loads (a `type` is accepted but not written) and that `.mcp.json` is not read; a live check
(C2) ran a sigil-installed `shared/filesystem` and removed it with `uninstall`. `shared/ado` stays off this target: its
organization is a token in `args`. Plan: [plan-antigravity-target-c.md](plan-antigravity-target-c.md).

### Phase D: agents (done 2026-11-02)

`.agents/agents/<name>.md` through a `names` `ToolDialect` and a tier table (`flash_lite`, `flash`, `pro`). D1 showed
the documented tool names load and work, one per tool (`multi_replace_file_content` excepted), with the binary's
`read_file` / `write_file` / `edit_file` a parallel set, so the dialect writes the documented names. An agent with no
`tools` gets no write tool (U3), so an absent catalog list writes the full one. `tools` is a YAML block list (U7). A live
check (D2) ran a sigil-installed `typescript/ts-code-reviewer`: it reviewed and wrote no file. Plan:
[plan-antigravity-target-d.md](plan-antigravity-target-d.md).

### Phase H: neutral hook contract (all hook targets) (done 2026-11-02)

Every hook target now takes one neutral contract (`docs/decisions/neutral-hook-contract-2026-11.md`). A catalog hook
names a neutral `event` and `matcher` (`*`, or neutral tools joined with `|`), and each target maps both through its
own hook tool table; the PascalCase events and Claude's tool names still load as legacy aliases, flagged by
`sync --check`. A hook that reads its input is a `script:` called with one `input` argument (`event`, `tool`,
`files`, `command`, `agent`, `cwd`), built by each target's `HookInputDialect`, so catalog scripts no longer read a
provider's stdin. The three catalog hooks are rewritten against it, and a deny regression test runs per target.
Every installed hook's command changes once: run `sigil update`. Plan:
[plan-antigravity-target-h.md](plan-antigravity-target-h.md).

### Phase E: Antigravity hooks (done 2026-11-02)

`.agents/hooks.json` and `~/.gemini/config/hooks.json`, one top-level key per hook named after its id, with the
default object-spread merge so a user's other hooks are never touched. Events and matchers come from Phase H's
tables: `before-tool`, `after-tool`, `session-start` and `stop` map, the rest are skipped with the reason. E1 showed a
default session reports `write_file` / `edit_file` / `read_file`, so the hook table names those and the documented
names both. Exit 2 denies on `1.4.12` (P4, E1), though a docs page says a non-zero exit fails open, so the deny test
keeps checking it; a `Stop` hook's exit 2 does not block. Plan: [plan-antigravity-target-e.md](plan-antigravity-target-e.md).

### Phase F: plugin channel (done 2026-11-02)

`sigil build --target antigravity` now writes `dist/antigravity/plugins/<name>/`: one plugin per pack with its
skills, agents and repo-wide rules, and one `hook-<name>` / `mcp-<name>` plugin per hook and MCP server, each with a
closed-schema `plugin.json`. The F1 probe showed a hand-built plugin of that shape delivering every component, both
installed and as a workspace copy. `npm run ci:local` runs `agy plugin validate` on every built plugin, failing on
warnings except the machine-dependent PATH one, and skips where `agy` is absent (CI). Prompts stay `none`, settings
stays `none`. Plan: [plan-antigravity-target-f.md](plan-antigravity-target-f.md).

### Phase G: close-out

A live check of each shipped kind on the current `agy`, the ADR's status updated, the brief
`docs/ideas/antigravity-cli-target.md` deleted and its row removed. The probe fixtures stay as a script, so the probes
re-run in one command on each `agy` update (the ADR's maintenance-cost note). F1h is still open: whether
`agy plugin install` can take a GitHub URL that points at one plugin's subfolder. Phase G answers it before any
release work publishes the plugins on a branch.
