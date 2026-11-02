# Plan: Cursor target, Phase F (plugin channel spike)

Roadmap: [plan-cursor-target.md](plan-cursor-target.md) § Phase F, Decision 7 (the plugin channel stays a spike).
Probe results so far: [cursor-target-2026-11.md](decisions/cursor-target-2026-11.md) § A3, § A8, § Phase F probes.
This phase writes no code: it ends in a recorded go or no-go. A go gets its own step plan
(`docs/plan-cursor-target-f2.md`) for the `plugin` capability rows and the `dist/cursor/` build.

## Status (2026-11-01): paused on Cursor usage

Cursor's free usage limit stopped the probes partway through. Step 1 is done, and step 2 and 3 are partly done. The
results so far are merged in the ADR (§ Phase F probes, first PR `docs/cursor-plugin-spike`). Meanwhile, development
goes on with [plan-cursor-followups.md](plan-cursor-followups.md), which needs no Cursor usage.

- **Done:** F1a-F1e, F2a-F2c, F2e, F3a.
- **Open:** F2d (Agent Plugin format), F2f (a `globs` rule after a file read), F3b (marketplace from a `file://` URL),
  F3c (failure scope), then steps 4 and 5.
- **Resume gate:** `agent -p --trust "say ok"` in any scratch repo answers without `ActionRequiredError` (the limit
  reset, or the plan changed). Resume with `/next docs/plan-cursor-target-f.md` on a new branch `docs/cursor-plugin-spike-2`
  from `master`. `plan-next` then picks step 2. Run only its open cases, then step 3's.
- **Fixtures** are not in the repo (the scratchpad is per session). Rebuild them from step 2's description and the
  ADR's fixture paragraph, which also lists the variants: `probe-glob` (`rules/india.mdc`, `globs: "**/*.py"`,
  `alwaysApply: false`, codeword `INDIA-F2`), `probe-bad` (an extra `rules/bad.mdc` with broken frontmatter and an
  unknown `sigilUnknownField` in `plugin.json`), `probe-agentplugin` (root `plugin.json`, `skills/probe-skill` with
  marker `SKILL-F2D`, plus `rules/hotel.mdc`). Run them through `--plugin-dir`, which behaves like the local folder
  (F3a) and leaves nothing to clean up.
- **Budget:** each run is one agent call; the open cases need about 5 runs. Run them in the order F2f, F3c, F2d, F3b, so
  the cases most likely to change the verdict (whether a rule ever loads) come first.

## Sources (re-read 2026-11-01)

- [Cursor plugins](https://cursor.com/docs/plugins) and [plugins reference](https://cursor.com/docs/reference/plugins):
  two formats. An **Agent Plugin** (open standard) has `plugin.json` at the root and carries only skills and MCP. A
  **Cursor Plugin** has `.cursor-plugin/plugin.json` (`name` required, kebab-case) and carries skills, MCP, rules,
  agents, commands, hooks and variables. Folder discovery when a field is absent (`rules/`, `agents/`, `commands/`:
  `.md` / `.mdc` / `.markdown`; `skills/<x>/SKILL.md`; `hooks/hooks.json`; `mcp.json`); a manifest field replaces
  discovery. `.cursor-plugin/marketplace.json` (`name`, `owner`, `plugins[]` with `source`) for multi-plugin repos; the
  per-plugin manifest wins over the marketplace entry. `${CURSOR_PLUGIN_ROOT}` and `${CLAUDE_PLUGIN_ROOT}` expand in
  `mcp.json`.
- **New since A8**: install is a desktop flow (Customize → Install, project or user scope). Local development goes in
  `~/.cursor/plugins/local/<name>/`, loaded after a restart or reload (on Enterprise only when Allow Local Plugin
  Imports is on). A symlink there loads only when it points inside that folder. A marketplace plugin with the same name
  beats the local copy. Team marketplaces are imported from a repo URL in the dashboard.
- A8: the CLI has `agent plugin marketplace add <gitUrl> | list | remove | update` and `--plugin-dir <path>`, no plugin
  install. One `--plugin-dir` plugin with `rules/hotel.mdc` (`alwaysApply: true`) did not reach the model.
- A3 / A8: Cursor already loads skills and MCP servers from Claude Code's installed plugins
  (`~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/`). sigil's Claude plugin inlines each skill's rules into
  its `SKILL.md`, so those rules already ride along.

## The question

A `.cursor-plugin/` build is worth it only if it delivers something the two existing routes don't: sigil's Claude
plugin (skills with inlined rules, MCP) and `sigil add --target cursor` (everything). What only a Cursor plugin could add
is loose rules, agents and hooks installed once per user instead of per project. So the spike asks:

1. Which components of sigil's installed Claude plugin reach Cursor today (skills, MCP, agents, hooks)?
2. Does any CLI route load a Cursor Plugin's rules, agents and skills: `~/.cursor/plugins/local/`, `--plugin-dir` (agents
   and skills, not only the rule A8 tried), or a marketplace added from a git URL?
3. Is the format stable enough to emit: does it match the docs, and does an unknown field or a bad file fail the whole
   plugin or only that component?

## Probe rules (every step)

- Each probe runs in a fresh `git init` repo from the scratchpad helper (`mkrepo.sh <fixture>`), never in this repo.
- Runs are `agent -p --trust --output-format stream-json`, model `Auto`, no `--force` unless the step says so.
- Each probe component carries a unique codeword (rule `HOTEL-F<n>`, agent marker, skill marker), so a hit is
  unambiguous. A pass needs the codeword in the model's answer, not just a file read. A probe that reads the file
  itself with a tool counts as a miss.
- Anything written under `~/.cursor/plugins/local/` is removed at the end of the step; record the cleanup.
- Results go to the ADR as `### Phase F probes`, one bold verdict per run, in A8's style.

## Step 1 `[inline: live check measures Cursor]`: what sigil's Claude plugin already delivers

- Confirm with `claude plugin list` which sigil plugins Claude Code has installed and at what version (the cache holds
  `0.3.0`). If none is enabled, install `essentials` from `makubexD/sigil#marketplace` at user scope and record it.
- F1a, skills: ask for the list of available skills; expect sigil's skill names. F1b, an inlined rule: ask for a fact
  only that skill's inlined rule states, with the skill loaded.
- F1c, agents: does a sigil plugin agent appear as a `Task` subagent type? F1d, hooks: does a sigil plugin hook fire
  (pick one with a visible effect, e.g. `hook-protect-config` refusing an edit)?

| Case | Expected if Cursor reads Claude plugins fully | Recorded as                     |
| ---- | --------------------------------------------- | ------------------------------- |
| F1a  | sigil skill names listed                      | holds / fails (A3 says holds)   |
| F1b  | inlined rule fact answered                    | holds / fails                   |
| F1c  | agent available as a subagent                 | holds / fails (no evidence yet) |
| F1d  | hook fires                                    | holds / fails (no evidence yet) |

## Step 2 `[inline: live check measures Cursor]`: a Cursor Plugin in `~/.cursor/plugins/local/`

Fixture plugin `sigil-probe`: `.cursor-plugin/plugin.json` (`name`, `version`, `description`), folder discovery only:
`rules/hotel.mdc` (`alwaysApply: true`, `HOTEL-F2`), `agents/probe-agent.md` (marker `AGENT-F2`, `readonly: true`),
`skills/probe-skill/SKILL.md` (marker `SKILL-F2`). Copy it (no symlink) to `~/.cursor/plugins/local/sigil-probe/`.

| Case | Prompt asks for                                                                  | Pass                          |
| ---- | -------------------------------------------------------------------------------- | ----------------------------- |
| F2a  | every codeword the rules give                                                    | `HOTEL-F2`                    |
| F2b  | the probe-agent subagent's marker                                                | `AGENT-F2` from a `Task` call |
| F2c  | the probe-skill's marker                                                         | `SKILL-F2`                    |
| F2d  | same as F2a, root `plugin.json` (Agent Plugin format) instead, with a skill only | `SKILL-F2`; no rule expected  |

## Step 3 `[inline: live check measures Cursor]`: `--plugin-dir` and the marketplace route

- F3a: the step 2 fixture through `--plugin-dir <folder>`, cases F2a-F2c again (A8 tried only the rule).
- F3b: `agent plugin marketplace add` with a local bare repo URL (`file://…`) holding
  `.cursor-plugin/marketplace.json` and the fixture as `plugins/sigil-probe/`; then `marketplace list`. Record whether
  `file://` is accepted, and whether anything is loadable without the desktop install flow. Remove the marketplace.
- F3c, failure scope: the step 2 fixture plus one malformed component (`rules/bad.mdc` with broken frontmatter) and one
  unknown `plugin.json` field. Pass: `HOTEL-F2` still answered (one bad file doesn't drop the plugin). Only through
  whichever route loaded in step 2 or F3a; skip with a note if none did.

## Step 4 `[inline: owner decision]`: go or no-go

Write `## Phase F: the plugin channel` in the ADR from steps 1-3, and the verdict:

- **Go** when a CLI route loads a Cursor Plugin's rules (F2a or F3a) and its agents or rules add something the Claude
  plugin doesn't (F1c/F1d fail, or loose rules matter). Then write `docs/plan-cursor-target-f2.md`: `plugin` rows in
  `src/targets/cursor/capabilities.ts` (the first `rule: native` on that channel), a `dist/cursor/` build mirroring
  `claude/`'s pack layout, and how it is published (the `marketplace` branch question). Not built in this phase.
- **No-go** when no CLI route loads a plugin's rules, or the Claude plugin already covers what a Cursor plugin would add.
  Record why, and keep `sigil add --target cursor` as the Cursor route.
- **Deferred to Phase G** when only the desktop install flow could work (no CLI route loads anything): G's desktop check
  runs step 2's fixture through Customize → Install and decides.

Stop here for the owner's call if the evidence is mixed (for example, rules load but agents don't).

## Step 5 `[inline: user-facing copy]`: docs

- `docs/setup/cursor.md`: the follow-ups plan already adds what sigil's Claude plugin gives a Cursor user (step 1).
  Add the verdict's one-line consequence there.
- Roadmap § Phase F: a `**Done 2026-11-01**` paragraph with the verdict, and Phase G's line updated if the verdict
  defers anything to it.
- `npx prettier --write` on every touched doc; `npm run check` green.
