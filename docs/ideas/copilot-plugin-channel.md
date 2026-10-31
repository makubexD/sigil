# Copilot plugin channel and consistent agent layout

## Objective

Decide and, if worthwhile, ship a Copilot distribution channel: either prove the existing
Claude-format marketplace loads in Copilot CLI and VS Code (ADR Phase 4,
[distribution-channels-2026-09](../decisions/distribution-channels-2026-09.md) section 6), or add a
Copilot plugin output. Also make `sigil build --target copilot` emit the same agent layout as
`sigil add`. Users install through Copilot's plugin commands or by committing `.github/` files.

The manual test ran on 2026-10-30, and the owner chose a narrowed Route A:
[copilot-plugin-channel-2026-10](../decisions/copilot-plugin-channel-2026-10.md). The remaining work
is in the roadmap, [plan-copilot-plugin-channel](../plan-copilot-plugin-channel.md).

## Evidence

Re-verified 2026-10-30.

- `src/targets/copilot/capabilities.ts:2-5` documents that there is no `plugin` channel and ties it
  to ADR Phase 4; the exported table has only `scaffold` (`:14-26`). `hook` is `native` since #102;
  `settings` stays `none`.
- `src/targets/copilot/index.ts:121-125` writes all agents into one `.github/AGENTS.md` on build.
  The cause is `COMPILED_FILE_KINDS` (`src/targets/copilot/target-helpers.ts:140`), which omits
  `agent`: a fresh build writes no file to `.github/agents/`, and one 195 KB `AGENTS.md` for 39
  catalog agents. (The "follow-up, not done" comment at `build-helpers.ts:58-64` is about moving that
  file to the repo root, not about per-file agents.)
- `src/targets/copilot/spec/agent.ts:59` makes `add` write `.github/agents/<name>.agent.md`, so the
  two commands produce different agent layouts.
- [About Copilot plugins](https://docs.github.com/en/copilot/concepts/agents/about-plugins) lists
  custom agents, skills, hooks, MCP and LSP configs, and extensions, on VS Code, Copilot CLI, the
  Copilot app and the cloud (repository settings).
- The [CLI plugin reference](https://docs.github.com/en/copilot/reference/cli-plugin-reference)
  confirms `.claude-plugin/` for both `marketplace.json` and `plugin.json`, last in the lookup order.
  VS Code names a Claude format and warns that support for a format doesn't guarantee every component
  works ([reference](https://code.visualstudio.com/docs/agents/reference/agent-plugin-reference)).

## Out of scope

- Hooks for Copilot through `sigil add`, which shipped
  ([copilot-hooks-2026-10](../decisions/copilot-hooks-2026-10.md)). Hook _plugins_ were in the manual
  test.
- Other tools (Codex, Cursor, Gemini).
- Rules as plugin content (the ADR matrix marks it undocumented for Copilot).

## Success criteria

- A recorded manual test: add the sigil Claude marketplace in Copilot CLI and VS Code, list what
  loads (skills, agents) and what silently does not.
- A decision recorded in `docs/decisions/`: rely on the Claude format, or add a Copilot emitter.
- `build --target copilot` and `add --target copilot` agree on agent files, or the difference is
  documented as intended; `provider-kind-coverage` still passes.
- `docs/reference/capabilities.md` regenerated if a `plugin` row is added.
- `npm run ci:local` green (includes `sigil validate` and `sigil sync --check`)

## Riskiest assumption

That Claude-format plugins behave acceptably in Copilot: agent frontmatter and tool names differ
(ADR section 1: "it loads" is not "it behaves identically").

## Open questions

- Does Copilot's skill discovery honour the same description-length budget as Claude's?
- Does the cloud agent (not only CLI/VS Code) install plugins from a repo marketplace?
- Should build output drop `.github/AGENTS.md` for per-file agents?
