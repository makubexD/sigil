# SPEC: `shared/feature` conductor skill

## Objective
Ship the `/feature` gated conductor (addyosmani/agent-skills spec-driven flow) as catalog skill
`shared/feature`, installable with `sigil add shared/feature` or the new `spec-driven` pack, emitting
on Claude (`.claude/skills/feature/`) and Copilot (`.github/skills/feature/`).

## Out of scope
- Changing agent-skills itself; removing the user-level `~/.claude/skills/feature`.
- New lexicon terms or emit-spec changes; Codex/Cursor targets.

## Success criteria
- Claude output: `disable-model-invocation: true`, `argument-hint`, `$ARGUMENTS`, `references/examples.md`.
- Copilot output: `**Arguments:**` line, "the request you were given", no `$ARGUMENTS` / `CLAUDE.md` /
  `disable-model-invocation`; `references/examples.md` present.
- `npm run check`, `sigil validate`, `sigil sync --check` green.

## Riskiest assumption
agent-skills skills/agents resolve by bare name outside Claude Code; the body degrades gracefully
("if unavailable, say so and stop").

## Open questions
- Non-Claude install instruction for agent-skills: verify against its README.
