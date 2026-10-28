# Plan: audit rows 15–18 (roadmap)

Source: `docs/audits/2026-10-16/results.md` rows 15–18. On 2026-10-19 the owner said to start them ("Start"). This is a
phase-level roadmap. Each phase is one branch and one PR. A phase starts with a spike that ends in a written go/no-go.
Only a "go" gets a step-level `docs/plan-audit-rows-15-18-<phase>.md`, which the user reviews before anything is built.
A recorded "no-go" counts as done.

Standing procedure: RED first, `npm run ci:local` green, merge on green CI. Close-out per phase:
`workflow-report sigil`, `/agent-skills:review`, the row in `results.md` set to `done (PR #N)` or `no-go` with the
evidence, a `CHANGELOG.md` entry, and the phase's step plan deleted after merge.

## TODO

- [x] **Phase 0, housekeeping** (`chore/close-status-backlog`): `results.md` row 13 cites PR #92,
      `docs/plan-status-backlog.md` is removed, and `evals:check` now forces the TAP reporter on Node 23+.
- [x] **Open question for the owner**: `docs/ideas/ci-test-speed.md` said "done (2026-10-03)" but was still in
      `docs/ideas/`. Owner chose to move it: now `docs/decisions/ci-test-speed-2026-10.md`.
- [ ] **Phase 1, row 17: Copilot hook target** (brief `docs/ideas/copilot-hooks.md`). Merged in PR #102; only the
      owner live check is open.
  - [x] Spike `[inline: research]`: check the Copilot hooks docs for the file path, schema, event names, matchers,
        stdin/stdout shape, and whether exit 2 blocks the call. Write `docs/decisions/copilot-hooks-2026-10.md`, which
        also decides where the source of truth lives. Done 2026-10-28: go; `event` stays as authored (Copilot accepts
        Claude's PascalCase names), not a neutral vocabulary.
  - [x] Owner probe: which `tool_input` key Copilot CLI passes for `create` / `edit` — replaced by step 1:
        `protect-config` accepts both `file_path` and `path`.
  - [x] If go, step plan. Expected scope: `src/targets/copilot/capabilities.ts` makes `hook` `native`; the emitter
        reuses `replaceMerge`, `previousOpFor`, and `ensureHomeBackup` / `isHomeScopedRoot`; an `aggregateDocs`
        citation; `ownedBy` dropped for `hook` only in `src/kinds.ts`; RED tests for the `add`, `update` and
        `uninstall` round trip.
  - [ ] Live check by the owner: `shared/protect-config` blocks a `.env` write in Copilot CLI.
- [x] **Phase 2, row 15: reviewer Bash guard**. Merged in PR #105.
  - [x] Spike `[inline: research + probe]`: can a PreToolUse hook see the subagent? Route (a) is
        `agent_type` / `agent_id` in the hook input. Route (b) is a subagent frontmatter `hooks:` field, which would
        need a new `claude:` field on the agent spec. Record the go/no-go in `results.md`. Done 2026-10-28: go,
        route (a) (`docs/decisions/reviewer-bash-guard-2026-10.md`); scope widened to all 21 read-only agents that
        carry Bash. The step plan was deleted after merge.
  - [x] If go, step plan: `shared/reviewer-bash-guard` denies write-shaped Bash for the code-reviewer and
        security-auditor families, lists its blind spots, and gets tests modelled on
        `test/catalog/protect-config-hook.test.ts`. Add it to packs. Done: 21 agents (scope widened from the
        code-reviewer and security-auditor families).
- [x] **Phase 3, row 16: H1 bar-lowering guard and H2 Stop typecheck**. No-go, recorded in PR #109; the
      spike plan was deleted with it.
  - [x] Spike `[inline: eval, run with the model under test]`: run a pressure task and record `suppressions` and
        `typeErrors`. The worker may write the eval files but never runs the probe. Done 2026-10-28: pressure tasks
        P1 and P2, a Haiku screen registered as H15 and H16 (`test/evals/code-quality/results.md`). 0 suppressions
        and 0 type errors in 20 runs; Haiku escalated instead of silencing, so the Sonnet stage did not run.
  - [x] No-go, not built (H15 failed). H1 only if suppressions appear: ask only on unjustified forms, diff old
        content against new, and match Edit, MultiEdit and Bash.
  - [x] No-go, not built (H16 failed). H2 only if type errors appear: a Stop hook runs the typecheck it finds for
        the stack.
- [ ] **Phase 4, row 18: C1–C5 coverage**
  - [ ] Spike `[inline: eval design]`: one probe task per area (Node runtime, ASP.NET/EF, FastAPI/Django, React
        perf/security, API/DB/observability/e2e). The worker may write the task files.
  - [ ] Probe runs `[inline: run with the model under test, no rules loaded]`. Write the misses to
        `test/evals/coverage-probe/results.md`.
  - [ ] Prose only for confirmed misses, placed where the catalog-layout rule says, each with a RETIRED or IMPLIES
        guard. A clean area is recorded as "no gap".

## Out of scope

The 14 briefs in `docs/ideas/`. They stay as backlog.
