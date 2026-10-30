# Plan: ADR Phase 1, the Claude plugin channel (roadmap)

Source: [distribution-channels-2026-09](decisions/distribution-channels-2026-09.md) § 6, Phase 1: "Family-granular
Claude marketplace via `Pack.select`; hooks/MCP as their own opt-in plugins; prompts as skills; plugin-agent field
guard".

This is a phase-level roadmap, not a step plan. Each phase is one branch and one PR, and gets a step-level
`docs/plan-claude-plugin-channel-<phase>.md` when it starts. A phase that opens with a spike ends the spike in a
written go/no-go, and a recorded no-go counts as done.

Standing procedure: RED first, `npm run ci:local` green, merge on green CI. Close-out per phase: `workflow-report .`,
`/agent-skills:review`, a `CHANGELOG.md` entry, the ADR note updated, and the step plan deleted after merge.

## What is true today (checked 2026-10-30)

- The marketplace lists 13 plugins, built one per pack. `essentials` has none: all of its members are `mcp`, `hook` or
  `prompt`, which the plugin channel marks `none` (`src/targets/claude-code/capabilities.ts`).
- Flipping a capability row is not enough. `pluginMembersByKind` throws until `WRITABLE_PLUGIN_KINDS` has a writer, and
  `provider-kind-coverage` requires a matching `KindEmitSpec` for a whole-file kind.
- **Flipping `hook` or `mcp` to `native` would change every starter.** The five `*-starter` packs and `essentials` list
  `shared/filesystem`, `shared/protect-config` and `shared/reviewer-bash-guard`, so those would land inside those
  plugins, turned on with no separate choice. That contradicts "opt-in".
- `Pack` has no `select` field (`src/packs-config.ts`). The selector grammar is `all`, `pack:`, `kind:` and ids, with
  nothing for a language or a group. `sigil cost` (ADR Phase 1b) does not exist.
- The Claude docs now offer plugin `dependencies`, `userConfig`, `hooks/hooks.json`, `.mcp.json` at the plugin root, and
  `${user_config.KEY}` in MCP config and exec-form hook args.

### "Family" means two things

The ADR says "per language × family" (`ts-review`, `ts-testing`). That was written before `catalog/standard.yaml`
existed, and its families are a different thing: 40 families of at most 5 members, one member per language. Read
literally, language × family is one artifact per plugin: about 15 plugins per language, around 75 in total. The ADR
meant topic groups, and those have no definition in the catalog yet. Phase D settles that with measurements.

## Phases

### Phase A: plugin-agent field guard — done 2026-10-30

Small and independent, so it goes first. Confirm the restriction from the current docs or a live probe, and record
what was found. No catalog agent sets these fields today, so the guard protects future authoring: the Claude plugin
agent spec forbids any key plugins ignore, so `build` fails instead of shipping an agent that silently loses them. If
the restriction no longer holds, this phase ends as a recorded no-go and the ADR line is corrected.

### Phase B: prompts as skills — done 2026-10-30

`explain-diff` and `author-artifact` become plugin skills, reusing the `workflow` plugin shape, which is already
`native`. Expected scope: the `prompt` plugin row, a plugin-channel `KindEmitSpec`, `WRITABLE_PLUGIN_KINDS`, regenerated
`capabilities.md`.

`essentials` returns to the marketplace as a plugin holding only its two prompts, which reverses the v0.2.1 note in
[publish-claude-marketplace-2026-10](decisions/publish-claude-marketplace-2026-10.md#empty-plugins). Its pack
description promises the Filesystem MCP and config protection, so the plugin description must not until Phase C.

Check at step-plan time: the slug-based name gives `/essentials:shared-explain-diff`. Decide whether a plugin name
should drop the `shared-` prefix; `sigil add` keeps its current names either way.

### Phase C: hooks and MCP as opt-in plugins

**Spike first `[inline: probe]`,** in real Claude Code, because these run on the user's machine:

1. A hook in `hooks/hooks.json` fires with sigil's exec-form inline `node -e`, and exit 2 still blocks.
2. `.mcp.json` in a plugin expands `${ADO_ORG}`, and what happens when the variable is unset.
3. `shared/reviewer-bash-guard` blocks a plugin-installed reviewer. Agent names can be `my-plugin:reviewer`; the hook
   already strips the prefix (`agent_type.split(':').pop()`), so this only confirms that against a real plugin agent.
4. A plugin hook or MCP server alongside the same one from `sigil add`: does the hook run twice, and which server wins?
   ADR Phase 2b owns the duplicate guard, so this phase only documents the result.

**Decisions to confirm in the spike:**

- One plugin per artifact, `hook-<name>` and `mcp-<name>`, as the ADR says. Generate them from the catalog rather than
  listing each in `packs.yaml`, which also feeds `sigil add`.
- Pack plugins stop short of `hook` and `mcp`: only the generated plugins carry them, so starters do not change.
  This is the fix for the starter problem above, and a test must pin it.
- `deepseek-worker` may declare `dependencies` on `hook-worker-mode-guard`, since its pack says the hook is part of the
  setup. Starters do not, which keeps them opt-in.
- Keep `{sigil:env:NAME}` and `PORTABLE_MCP_ENV_SYNTAX`. `userConfig` would be a second way to supply values; add it
  only if the spike shows env vars fail for plugin users.
- A plugin update can change a hook command with no review step, unlike `sigil update`. Say so in `consuming.md`.

Close-out includes regenerating `capabilities.md` and removing "plugins can't carry hooks yet" from pack descriptions.

### Phase D: granularity, spike then decide

Spike `[inline: research]`, ending in a go/no-go in the ADR:

1. Measure what an enabled plugin costs per session, in tokens, using a throwaway script rather than building
   `sigil cost`. Compare today's `*-tooling` (8 skills, 7 agents) with a split.
2. Define the unit if the split wins: topic groups per language, and where they live (`Pack.select`, or a `group`
   field on `standard.yaml` families).
3. Weigh the migration. Splitting removes `*-tooling` names people have installed. Decide between keeping them with a
   deprecation note and removing them, and what `/plugin update` does when a plugin disappears.

**My expectation is a no-go or a small split.** Sessions load descriptions, not bodies, and `sigil add` already gives
per-artifact precision. If the saving is small, keeping today's packs and correcting the ADR is the better result.

**If go:** `select` on `Pack`, read through `parsePacksConfig`, resolved by the same code for `sigil add` and `build`,
and a pure `planPlugins()` as the ADR describes. This gets its own step plan.

## Order and release

A → B → C → D. C depends on B only for `essentials`, and D is last because it may change plugin names, so it should
build on the final plugin shapes.

Cut a release after Phase C. That also ships #124 and #125, and it is the point where `essentials` can be installed
from the marketplace in full. The release itself stays the owner's call.

Out of scope: `sigil add --complement` and the duplicate guard (ADR Phase 2b), `sigil cost` (1b), and Copilot's plugin
channel (`docs/ideas/copilot-plugin-channel.md`).
