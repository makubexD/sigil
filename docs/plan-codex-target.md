# Plan: ADR Phase 5, the Codex target (roadmap)

Source: [distribution-channels-2026-09](decisions/distribution-channels-2026-09.md) § 6, Phase 5: "Codex adapter
(`.agents/skills`, `AGENTS.md`, `.codex/agents/*.toml`, `config.toml` merges, Codex plugin)", and the brief
the Codex brief (deleted once this shipped).

This is a phase-level roadmap, not a step plan. Each phase is one branch and one PR, and gets a step-level
`docs/plan-codex-target-<phase>.md` when it starts. A phase that opens with a spike ends the spike in a written
go/no-go, and a recorded no-go counts as done.

Standing procedure: RED first, `npm run ci:local` green, merge on green CI. Close-out per phase: `workflow-report .`,
`/agent-skills:review`, a `CHANGELOG.md` entry, the ADR note updated, and the step plan deleted after merge.

## Summary

The ADR's scope doesn't survive the current docs unchanged. Three findings reorder it:

1. **All 39 catalog agents declare `tools`, and a Codex agent file can't enforce a tool list.** `renderArtifact` refuses
   to render them, as designed. So `.codex/agents/*.toml` is an owner decision (Phase F), not an adapter task.
2. **Only MCP needs TOML.** Hooks have a JSON home (`.codex/hooks.json`), so the riskiest assumption in the brief shrinks
   to one kind and moves late in the order.
3. **`protect-config` would fail open on Codex.** Its parser doesn't read the payload Codex documents for `apply_patch`,
   so a `.env` write would pass with no error (Phase C).

| Phase | Ships                                            | Gate                               |
| ----- | ------------------------------------------------ | ---------------------------------- |
| A     | Probe results and a decision record, no code     | **Done**, see the decision record  |
| B     | `--target codex`: skills, `AGENTS.md` on `build` | Passed: A1, A6                     |
| C     | Hooks in `.codex/hooks.json`                     | Passed: A3-A5                      |
| D     | Config file-format seam, JSON output unchanged   | None                               |
| E     | MCP in `.codex/config.toml`                      | Research spike; A7 passed          |
| F     | Agents                                           | **Decided: no-go**, no code        |
| G     | Codex plugin route                               | **Decided: docs only**, no emitter |

Order: A → B → C, then D → E. F and G depend only on A and B, so they can move. Each phase leaves `ci:local` green and
the target usable for what it has shipped so far; a kind not yet shipped stays `none` in `capabilities.ts`, with its
reason, and selection warns and skips it.

## Decisions

The owner delegated these on 2026-10-31, to be taken as recommended. Results and reasons are in
[codex-target-2026-10](decisions/codex-target-2026-10.md), which overrides this roadmap where they differ.

- **D1, agents.** No agents on Codex.
- **D2, probes.** Run with the real binary against a local mock model, so no OpenAI sign-in was needed. A real model
  choosing a skill remains unproven.
- **D3, TOML dependency.** `smol-toml` for reading only, writing by splicing text.
- **D4, prompts.** `none` on Codex.

Amendments from the probes:

- **Phase C.** `args` isn't honored, so a hook renders as one string per shell: a POSIX-quoted `command` and a `cmd.exe`
  `commandWindows`. A hook that can't be rendered safely for a shell is refused. The Windows form is untested.
- **Phase E.** `{sigil:env:NAME}` in `env` becomes `env_vars` when the key equals `NAME`. Anything else is refused, which
  keeps `shared/ado` off Codex.
- **Phase G.** The setup page documents the marketplace route and warns against hook plugins.

## What is true today (checked 2026-10-31)

### Brief evidence

| Claim                                                 | Result                                                                                                                                                                                                                                                                                     |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `index.ts:19-20` registers only Claude and Copilot    | **Stale.** `src/targets/index.ts:20-22` registers three; `AgentsStandardTarget` was added since. It's the closest template for Phase B                                                                                                                                                     |
| No `codex` directory under `src/targets/`             | Holds                                                                                                                                                                                                                                                                                      |
| "One folder plus `registerTarget()`" (`index.ts:3-7`) | **Too optimistic for this target**, and the text now runs to line 9 ("No other code needs to change"). True for Phase B, apart from the two shared-path fixes below. Hooks and MCP need a new `ConfigRoot` (`src/types.ts:179`, `src/config-utils.ts:67-78`), and TOML needs a format seam |
| YAGNI note on `MarketplaceFormat` and TOML            | Holds, at ADR § 5 (line 191)                                                                                                                                                                                                                                                               |
| Live probe "like the ADR section 7 campaign"          | Holds. The harness is `docs/audits/2026-09-27/tools/live-probe.js`; it drives `claude -p` and `copilot -p`, so it needs a `codex exec` driver                                                                                                                                              |

### ADR claims against the current docs

- Still right: skill listing budget, prompts deprecated, agents as `.codex/agents/*.toml`, rules and settings
  scaffold-only.
- **The Codex plugin column's hook cell needs a qualifier.** The packaging guide limits lifecycle hooks to "manually
  installed Codex desktop plugins", and excludes plugins with hooks from the public directory.
- **The agents row hides the real constraint**, the missing tool restriction (Phase F).
- The `developers.openai.com/codex/*` pages redirect to `learn.chatgpt.com/docs/*`. New `DocRef`s use the
  `learn.chatgpt.com` address. The plugin packaging guide stays on `developers.openai.com/plugins/build/plugins`.

### Open questions, answered

**Does Codex read project `.agents/skills`? Yes.** It scans `.agents/skills` in every directory from the working
directory up to the repository root, and also reads `$HOME/.agents/skills` and `/etc/codex/skills`. Same-named skills
aren't merged; both can appear. ([Build skills](https://learn.chatgpt.com/docs/build-skills)) The docs tie trust to
`.codex/` layers and don't mention it for skills, so A1 tests an untrusted project.

**Where do hooks and MCP live, and are they project-scoped? Both have project and user scope, in trusted projects only.**

| Kind  | Project                                            | User                                            | Format                            |
| ----- | -------------------------------------------------- | ----------------------------------------------- | --------------------------------- |
| Hooks | `<repo>/.codex/hooks.json` or `.codex/config.toml` | `~/.codex/hooks.json` or `~/.codex/config.toml` | JSON, or inline `[hooks]` TOML    |
| MCP   | `.codex/config.toml`                               | `~/.codex/config.toml`                          | TOML only: `[mcp_servers.<name>]` |

- Codex loads project `.codex/` layers only for trusted projects, and skips project config, hooks and rules otherwise.
  ([Config basics](https://learn.chatgpt.com/docs/config-file/config-basic),
  [Advanced configuration](https://learn.chatgpt.com/docs/config-file/config-advanced))
- A hook also needs its own review: new or changed hooks are skipped until trusted through `/hooks`, by hash.
  ([Hooks](https://learn.chatgpt.com/docs/hooks))
- MCP: [Model Context Protocol](https://learn.chatgpt.com/docs/extend/mcp?surface=cli). The docs describe a `.mcp.json`
  for plugins only, not for a project.
- Neither kind documents a personal per-project file, so sigil's `local` scope has no Codex destination.

**Is the plugin format stable enough to target? For skills and MCP, probably, once probed. For hooks, no.**

- For stable: the portable root `plugin.json` declares a versioned Agent Plugins schema (1.0.0), and none of the
  plugin, skill, hook or subagent pages carries an Experimental or Beta label.
  ([Feature maturity](https://learn.chatgpt.com/docs/feature-maturity) defines the labels but doesn't list features.)
- Against: the format is mid-migration. The
  [packaging guide](https://developers.openai.com/plugins/build/plugins) makes root `plugin.json` canonical and calls
  `.codex-plugin/plugin.json` a compatibility fallback, while the [hooks page](https://learn.chatgpt.com/docs/hooks)
  still documents `.codex-plugin/plugin.json`. The guide says to use the desktop app to install and test a local
  plugin, and the [plugins page](https://learn.chatgpt.com/docs/plugins) says CLI `/plugins` installs from a configured
  marketplace. The IDE extension doesn't support plugins.
- Not established: how long the format has held. The changelog came back as navigation text, so this answer rests on the
  docs as they stand today and has no release history behind it.

The practical answer is Phase G: the docs say OpenAI tooling reads `.claude-plugin/marketplace.json`, so sigil's
published marketplace may already load. Probe that before building anything.

### Other facts the phases rely on

- **Agents.** Agent files require `name`, `description` and `developer_instructions`. They "inherit the parent's
  permissions, provider, and MCP servers", `sandbox_mode` in one doesn't override the parent, and instructions "don't
  create a separate read-only sandbox". The only capability switches are `features.shell_tool`, `apps`, `plugins`,
  `memories` and `request_permissions_tool`. ([Subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents))
- **Catalog agents.** All 39 set `tools`, and `src/targets/tool-restriction.ts` refuses to render any of them for a spec
  that can't carry it. 29 grant no write tool but do grant `Bash`; 10 grant write tools and `Bash`. So disabling the
  shell tool fits none of them.
- **Hook handlers.** The documented command handler has `command`, plus an optional Windows-only `commandWindows`. No
  `args` field is documented, and `protect-config` is `command: node` with a multi-line `args` script.
- **Hook payloads.** `Bash` and `apply_patch` use `tool_input.command`, and the `Edit|Write` matcher reaches `apply_patch`
  through an alias. `protect-config` handles a string `tool_input` or `ti.file_path ?? ti.path`, so an object holding
  `command` yields no file to check.
- **Hooks are a guardrail.** The docs say to treat them as "a useful guardrail, not a complete enforcement boundary".
- **Config writers.** All three (`add`, `update`, `uninstall`), the home-backup check and drift assume JSON:
  `execute-config.ts:37,72`, `update-config-io.ts:21,44`, `uninstall-config.ts:38,58`, `config-utils.ts:94`.
- **MCP env.** `EnvSyntax` (`src/targets/env-reference.ts`) assumes a string form. The Codex docs describe forwarding by
  name (`env_vars`) and no `${NAME}` expansion. `shared/ado` is the only catalog server that needs this, and it uses the
  token in `args` too.
- **Two targets, one path.** `codex` and `agents-standard` would both write `.agents/skills/<name>/SKILL.md`. No two
  targets share a whole-file path today. `removeEntries` (`src/manifest/mutate-remove.ts:50-52`) only keeps paths owned by
  the same target, so uninstalling one would delete the other's file.
- **Listing budget.** Codex's skill listing uses at most 2% of the context window, or 8,000 characters when the window is
  unknown, and shortens descriptions first. The 45 rendered skills total 8,283 characters of names and descriptions,
  before file paths. A per-project install fits; a whole-catalog install may be shortened. It's a documentation note, not
  a check.
- **`AGENTS.md`.** Codex stops at 32 KiB by default (`project_doc_max_bytes`). The current build is about 6.3 KiB. Codex's
  `.rules` files are command-approval rules, unrelated to sigil's `rule` kind, and sigil emits none.
  ([AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md),
  [Rules](https://learn.chatgpt.com/docs/agent-configuration/rules))

## Phases

### Phase A: live probe

**Gate: live `codex`, needs D2. No `src/` change.** Route: inline, because the result is Codex's own behavior and the
worker is DeepSeek.

Hand-built fixtures in a scratch project, each with a control. Results go in a new
`docs/decisions/codex-target-2026-10.md`, with the Codex version, and later phases change if a result differs from
the docs.

| #   | Question                                                                                                                                                                    | Decides |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| A1  | Does a skill in `.agents/skills` load and get invoked, in a trusted and in an untrusted project?                                                                            | B       |
| A2  | Does a `.codex/agents/*.toml` file with a kebab-case `name` load, and does trust gate it? Can such an agent still edit?                                                     | F       |
| A3  | Does `hooks.json` accept `args`? If not, which single-string form keeps exit code 2?                                                                                        | C       |
| A4  | What does `tool_input` really hold for an `apply_patch` add, update and delete?                                                                                             | C       |
| A5  | In `codex exec`, does an unreviewed project hook run, get skipped, or warn?                                                                                                 | C       |
| A6  | Does Codex read the rendered `AGENTS.md` and name it as an instruction source?                                                                                              | B       |
| A7  | Does project `config.toml` start a stdio server, and is `${NAME}` expanded in `env` or `args`?                                                                              | E       |
| A8  | With `codex plugin marketplace add makubexD/sigil --ref marketplace`, what do the CLI and a plugin install load? Do Claude-lexicon bodies, agents and hook plugins survive? | G       |

Done when every row has an observed result, or a stated reason it couldn't be run.

### Phase B: the target, with skills and `AGENTS.md`

**Acceptance needs A1 and A6.** Route: mostly `[worker:medium]`, modelled on `src/targets/agents-standard/`.

`src/targets/codex/` with `capabilities.ts` (every kind), lexicon, skill `KindEmitSpec` with Codex's own `docs:`,
metadata, derived contracts, and `registerTarget()`.

| Kind                   | Mode here                                               |
| ---------------------- | ------------------------------------------------------- |
| `skill`                | `native`                                                |
| `rule`                 | `via: inline`, repo-wide ones in `AGENTS.md` on `build` |
| `prompt`               | `none`, deprecated (D4)                                 |
| `agent`, `hook`, `mcp` | `none` until their phases, with the reason              |
| `workflow`, `settings` | `none`                                                  |

Also in this phase:

- **The shared path.** `removeEntries` must keep a path any remaining entry owns, whatever its target, and `add` must not
  report an identical file from the other target as a conflict. This needs the same lexicon values as `agents-standard`,
  pinned by a test that the two render byte-identical skills. Decide it in the step plan if they can't match.
- **Overlap notes.** `alsoLoads` on Codex for `agents-standard`, and `codex` added to Copilot's list
  (`src/targets/copilot/index.ts:106`), so `sigil status` reports double loading.
- **Docs.** `docs/setup/codex.md` and a README Quick Start `<details>` block, which the ADR requires of every new install
  route, plus the listing-budget note. Add `codex` where tests hand-list providers (`PROVIDER_DIRS` in
  `test/targets/provider-registry.test.ts:23`).

`sigil add` won't write `AGENTS.md`: it's usually user-owned, and `partitionFiles` never touches an existing file without
`--overwrite`. A managed block inside it is out of scope, so `add` delivers rules only inside skills, as
`agents-standard` does.

Done when `sigil add --target codex` and `sigil build --target codex` work, `capabilities.md` is current,
`provider-kind-coverage`, `declared-but-unemitted` and the lexicon rules pass, and a real `codex` session loads an
installed catalog skill.

### Phase C: hooks in `.codex/hooks.json`

**Gate: live probe A3, A4, A5.** Route: judgment for the `args` form and the catalog fix, `[worker:medium]` for the rest.

- A `codex-home` `ConfigRoot` (`$CODEX_HOME`, default `~/.codex`), wired through `config-utils.ts`, so user installs get
  the home backup.
- A hook op builder and destination resolver: project `.codex/hooks.json`, user `$CODEX_HOME/hooks.json`. `local` scope
  is refused with a clear error, never redirected to a committed file.
- Events Codex doesn't document are refused, as Copilot's `UNALIASED_EVENTS` does.
- `args` rendered in whatever form A3 proves, or written out as a script file if no inline form keeps exit code 2 on both
  shells. Windows behavior needs its own check, since this is why `protect-config` moved to exec form.
- **`protect-config` reads `tool_input.command`.** RED test first: an `apply_patch` payload writing `.env` must exit 2.
  Copilot's string form must keep working. This changes `sigil add` output for all targets, so it gets a changelog entry.

Only `protect-config` ships to Codex; the other two hooks are `platforms: [claude]`.

The setup page and `afterInstallHint` must say that a project hook does nothing until the project is trusted and the hook
is reviewed in `/hooks`. A guard that silently isn't running is the failure this target must not hide. It matches what
the owner found on Copilot with an untrusted folder.

Done when a live `codex` session denies an `apply_patch` write to `.env`, allows a control file, and uninstall leaves the
user's hooks intact.

### Phase D: a config file-format seam

**No gate.** Route: judgment for the interface, `[worker:medium]` for the migration.

A behavior-preserving refactor, so TOML lands on a tested boundary. The config writers, the home-backup check and the
uninstall read go through one format interface, keyed by destination, with JSON as the only implementation. `serialize()`
stays JSON's only disk writer, and `canonicalize()` keeps hashing fragments.

Done when `dist/` is byte-identical before and after, and every existing config test passes unchanged.

### Phase E: MCP in `.codex/config.toml`

**Gate: research spike, live probe A7, D3.** The spike ends in a go/no-go in the decision record. Route: judgment for the
writer.

This is the brief's riskiest assumption, now confined to MCP. A user's `config.toml` holds comments and hand-kept
ordering, so parsing and re-serializing the file would break "merge into user-owned config, never overwrite".

Recommended, for the spike to confirm or reject:

- Sigil owns whole `[mcp_servers.<key>]` tables and splices their text. Everything else in the file stays byte-for-byte.
- `smol-toml` reads the file for conflict and drift checks. It's one new runtime dependency among seven, so D3 is the
  owner's call. The spike also records what it costs to write a minimal reader instead.
- A hand-kept table with the same key is reported as a conflict, not replaced.

Invariants that must hold, and need a `CLAUDE.md` update: the fragment is still hashed with `canonicalize()`; a home write
still calls `ensureHomeBackup` first; `replaceMerge` and `classifyConfigDrift` work on the parsed table. A TOML writer is a
new disk writer beside `serialize()`, and the invariant must say so.

Env handling follows A7. If Codex has no expansion, `{sigil:env:NAME}` in `env` maps to `env_vars = ["NAME"]` where the
names match, and anything else is refused. `shared/ado` then stays off Codex, or is restricted with `platforms:`, and
`mcpEnvCaveat` says why. A secret is never written into the file.

`local` scope is refused, as in Phase C. The spike may end in a no-go; then `mcp` stays `none`, with a reason.

Done when install, update, drift restore and uninstall round-trip a commented `config.toml` with only sigil's table
changed, and a live `codex` session starts a catalog server.

### Phase F: agents

**Gate: owner decision D1, live probe A2.** Route: judgment.

The ADR lists `.codex/agents/*.toml`, but the tool-restriction invariant forbids it for every catalog agent as things
stand. Rendering needs one of:

| Option                        | Effect                                                                                                                                                                                               |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. No agents on Codex**     | `agent: none`, citing Subagents. No invariant change. Users lose the reviewers on Codex, and skills still work                                                                                       |
| 2. Advisory restriction       | The spec turns `tools` into written instructions, with a visible warning. 29 agents without write tools could then edit whenever the parent session can. The invariant must be rewritten to allow it |
| 3. `platforms:` on each agent | The refusal's own hint. Same result as 1, with 39 edits to catalog source                                                                                                                            |

**Recommended: option 1, recorded as a no-go in the ADR.** The invariant exists to stop an agent silently gaining tools,
and the docs state that the file can't prevent it. Reopen if Codex adds a per-agent sandbox or tool list. Option 2 is
the only way to deliver agents, and it's the owner's call to make: `Bash` already makes those 29 agents softer than their
list suggests on other tools, so the gap may be acceptable if it's documented.

With option 1 this phase is an ADR note and no code. With option 2 it's a TOML agent spec, a `declared-but-unemitted`
mapping, a `tool-restriction-coverage` change and the invariant edit, and it gets its own step plan.

### Phase G: Codex plugin route

**Gate: live probe A8. May end as a recorded no-go.** Route: judgment, following ADR Phase 4 and
[copilot-plugin-channel-2026-10](decisions/copilot-plugin-channel-2026-10.md).

Sigil publishes a Claude-format marketplace on the `marketplace` branch, and the docs say OpenAI reads
`.claude-plugin/marketplace.json`. So the question comes first: what already works?

- If skills load and read correctly: document the route in `docs/setup/codex.md` and add no emitter.
- The likely gap is prose, because Claude plugin bodies carry Claude's lexicon. Agents won't load, and hook plugins are
  limited to manually installed desktop plugins.
- Only a gap the owner won't accept justifies an emitter: a `plugin` channel row for skills and MCP, root `plugin.json`,
  `.agents/plugins/marketplace.json`. That's when `MarketplaceFormat` is extracted, per ADR § 5. Hooks stay out.

Done when the route is documented with probe evidence, or the emitter ships and a live install loads a skill.

## Close-out

After the last phase: update ADR § 3 and § 6, delete the Codex brief (deleted once this shipped) and its `docs/ideas/README.md`
row, record the Codex version every result was measured on, and run `npm run ci:local`.

## Out of scope

Cursor and Gemini targets, a managed block in a user's `AGENTS.md`, `agents/openai.yaml` metadata, `sigil import --from
codex`, Codex's `.rules` command policies, and the public plugin directory.
