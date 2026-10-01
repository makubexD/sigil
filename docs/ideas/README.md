# Ideas: spec-ready briefs for known gaps

> **Back to:** [README](../../README.md) · [Documentation index](../index.md) · [Decisions](../decisions/)

Each file here is a brief for one gap between what sigil does today and what the maintainer wants:
interactive use for non-terminal users, publishing to marketplaces (including your own), and more
AI tools. A brief follows the SPEC shape: Objective, Evidence (with `file:line` citations),
Out of scope, Success criteria, Riskiest assumption, Open questions. Where the
[distribution-channels ADR](../decisions/distribution-channels-2026-09.md) already plans the work,
the brief links to it instead of restating it.

## Picking one up

Run the `spec-driven` pack's feature conductor on the file:

```
/feature docs/ideas/<name>.md
```

It clarifies, specs, plans, builds with TDD, reviews and closes out under approval gates
(`catalog/shared/skills/feature/SKILL.md`). Re-verify the Evidence section first: line numbers
drift and a brief may describe code that has since changed.

## Close-out

When a brief ships, its still-true, non-obvious facts move to their permanent home (README,
`docs/decisions/`, `CLAUDE.md`) and the brief is deleted or moved into `docs/decisions/`
(feature skill, Phase 6: nothing is lost, nothing is duplicated; `docs/ideas` is kept only if the
user wants it kept).

## Briefs

| File                                                               | Summary                                                            | Status   |
| ------------------------------------------------------------------ | ------------------------------------------------------------------ | -------- |
| [friendlier-errors.md](friendlier-errors.md)                       | Short "did you mean" for mistyped ids instead of the whole catalog | proposed |
| [own-marketplace-metadata.md](own-marketplace-metadata.md)         | Configurable marketplace name, owner, author, license              | proposed |
| [manifest-catalog-source.md](manifest-catalog-source.md)           | Manifest records which catalog installed an artifact               | proposed |
| [publish-claude-marketplace.md](publish-claude-marketplace.md)     | Publish the Claude marketplace from CI with a drift gate           | proposed |
| [copilot-plugin-channel.md](copilot-plugin-channel.md)             | Copilot plugin channel; consistent agent layout for build and add  | proposed |
| [copilot-hooks.md](copilot-hooks.md)                               | Hooks for GitHub Copilot                                           | proposed |
| [npm-first-publish.md](npm-first-publish.md)                       | First npm publish and package name                                 | proposed |
| [artifact-proposal-issue-form.md](artifact-proposal-issue-form.md) | GitHub issue form to propose an artifact                           | proposed |
| [import-copilot-layout.md](import-copilot-layout.md)               | `sigil import` from a Copilot `.github/` layout                    | proposed |
| [codex-target.md](codex-target.md)                                 | Codex target (ADR Phase 5)                                         | proposed |
| [cursor-target.md](cursor-target.md)                               | Cursor target (ADR Phase 6)                                        | proposed |
| [gemini-cli-target.md](gemini-cli-target.md)                       | Evaluate a Gemini CLI target                                       | proposed |
| [ui-beyond-terminal.md](ui-beyond-terminal.md)                     | Decide on a catalog browser or other GUI                           | proposed |
