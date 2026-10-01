# Publish the Claude marketplace from CI

## Objective

Every release publishes the generated Claude marketplace to a git location users can add with
`/plugin marketplace add <owner>/<repo>`, with a CI gate that fails when the committed output
drifts from `sigil build`. The mechanics and phasing are planned in
[distribution-channels-2026-09](../decisions/distribution-channels-2026-09.md) (section 6,
Phase 0 hygiene and Phase 2 publish); this brief only records the repo-level gap and success checks.

## Evidence

- `.gitignore:3` ignores `dist/`, so the built marketplace is never committed.
- `.github/workflows/` contains only `ci.yml` and `release.yml`; `release.yml` runs build,
  validate, tests and `npm publish` (`release.yml:54-55`) and has no marketplace step.
- `sigil build --target claude --out-dir <dir>` produces a valid marketplace under `<dir>/claude/`
  (verified; `claude plugin validate` passed). See [publishing.md](../guides/publishing.md).
- ADR Phase 0 notes catalog load order was nondeterministic (needed for a CI sync gate); this
  brief must re-check whether Phase 0 shipped before relying on it.

## Out of scope

- Everything the ADR assigns to Phases 0 and 2 beyond the criteria below (not restated here).
- Configurable marketplace identity ([own-marketplace-metadata](own-marketplace-metadata.md)).
- Copilot or other-tool marketplaces.

## Success criteria

- Where the published marketplace lives is decided and documented (branch, tag or separate repo).
- A workflow builds and publishes it on release; a second job fails on drift.
- `/plugin marketplace add <owner>/<repo>` installs a plugin on a clean machine (manual check
  recorded in the PR).
- README Quick Start gains the marketplace route (ADR "every phase adds its details block").
- `npm run ci:local` green (includes `sigil validate` and `sigil sync --check`)

## Riskiest assumption

That the output is byte-stable between identical builds (registry timestamp, artifact order); if
not, a drift gate produces false failures.

## Open questions

- Same repo (a `marketplace` branch) or a dedicated repo?
- Does a release publish need a PAT or a deploy key for the target repo?
- Version the marketplace per sigil release, or independently?
