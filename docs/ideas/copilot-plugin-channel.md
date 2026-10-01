# Copilot plugin channel and consistent agent layout

## Objective

Decide and, if worthwhile, ship a Copilot distribution channel: either prove the existing
Claude-format marketplace loads in Copilot CLI and VS Code (ADR Phase 4,
[distribution-channels-2026-09](../decisions/distribution-channels-2026-09.md) section 6), or add a
Copilot plugin output. Also make `sigil build --target copilot` emit the same agent layout as
`sigil add`. Users install through Copilot's plugin commands or by committing `.github/` files.

## Evidence

- `src/targets/copilot/capabilities.ts:2-5` documents that there is no `plugin` channel and ties it
  to ADR Phase 4; the exported table has only `scaffold` (`:14-25`), with `hook` and `settings`
  `none`.
- `src/targets/copilot/index.ts:101-105` writes all agents into one `.github/AGENTS.md` on build;
  `src/targets/copilot/build-helpers.ts:126-133` comments that it is a sigil layout choice and
  that moving it is "a follow-up, not done".
- `src/targets/copilot/spec/agent.ts:57` makes `add` write `.github/agents/<name>.agent.md`, so the
  two commands produce different agent layouts.
- Web, to verify: [About Copilot plugins](https://docs.github.com/en/copilot/concepts/agents/about-plugins)
  lists custom agents, skills, hooks, MCP and LSP configs, on Copilot CLI, the cloud agent and the
  Copilot app, and does not mention `.claude-plugin` compatibility in the page read.
  [Creating a marketplace](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/plugins-marketplace)
  (search result, not fetched) reportedly accepts `marketplace.json` under `.github/plugin` or
  `.claude-plugin/`.

## Out of scope

- Hooks for Copilot ([copilot-hooks](copilot-hooks.md)).
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
