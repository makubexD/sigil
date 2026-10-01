# Codex target (OpenAI)

## Objective

Add a `codex` target so `sigil add --target codex` and `sigil build --target codex` deliver the
catalog to OpenAI Codex. Scope, file layout (`.agents/skills`, `AGENTS.md`,
`.codex/agents/*.toml`, `config.toml` merges, Codex plugin) and sequencing are planned in
[distribution-channels-2026-09](../decisions/distribution-channels-2026-09.md) (section 6,
Phase 5; capability matrix in section 3). This brief does not restate them.

## Evidence

- `src/targets/index.ts:19-20` registers only `ClaudeCodeTarget` and `CopilotTarget`; no `codex`
  directory exists under `src/targets/`.
- The extension recipe is "one folder plus `registerTarget()`" (`src/targets/index.ts:3-7`;
  `docs/reference/architecture.md` Extension model).
- ADR section 5 notes the YAGNI rule: a shared `MarketplaceFormat` strategy and a TOML merge
  primitive are extracted when Codex supplies the second implementation.

## Out of scope

- Cursor and Gemini ([cursor-target](cursor-target.md), [gemini-cli-target](gemini-cli-target.md)).
- Everything the ADR assigns to other phases.

## Success criteria

- Acceptance is the ADR Phase 5 scope, split into stages that each ship green.
- `src/targets/codex/capabilities.ts` declares every kind (compile-enforced) and the generated
  `docs/reference/capabilities.md` is current.
- `provider-kind-coverage`, `declared-but-unemitted` and lexicon rules pass for the new target.
- A real `codex` run (live probe like the ADR section 7 campaign) confirms skills load.
- `npm run ci:local` green (includes `sigil validate` and `sigil sync --check`)

## Riskiest assumption

That Codex's TOML config can be merged without a new merge primitive that touches the invariants
around `serialize()`/`canonicalize()` and home-directory backups.

## Open questions

- Does Codex read project `.agents/skills` today (to verify against OpenAI docs)?
- Where do Codex hooks and MCP configs live, and are they project-scoped?
- Is the Codex plugin format stable enough to target?
