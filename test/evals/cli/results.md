# Eval results (2026-09-24)

Fresh general-purpose agents, no conversation context, graded against key.md.
S3 and S4 suites re-run independently by the orchestrator.

| Scenario           | Old skill (baseline)                                  | New skill                                                                                                                                                                                            |
| ------------------ | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1 audit           | pass (~11/12, callers named, no edits)                | pass (12/12 with evidence; caught `--help` after a full deploy line running the deploy; refused to run destructive commands)                                                                         |
| S2 design          | fail: exit codes 1 = usage, 2 = operational           | pass (0/1/2/130, --yes, --dry-run, progressive help, no code)                                                                                                                                        |
| S3 refactor        | fail: tests written after all edits; exit 1 for usage | pass: 17 characterization tests green before first edit; one id at a time; deprecation table + exact warning; ci.sh/README migrated with a docs test written first; CHANGELOG; 53/53 (re-run: 53/53) |
| S4 build           | not supported                                         | pass: declarations drive parser + help; test-first per slice; exit 2 + suggestions; 67/67 (re-run: 68/68)                                                                                            |
| S5 stack (click)   | not supported                                         | pass: verified by running click 8.4.1; found 4 click-vs-contract gaps, now in stacks/python.md                                                                                                       |
| S6 adopt           | not supported                                         | pass: Copilot + AGENTS.md only, stamped, markers; wording fix for user-only skill folded into adapters/README.md                                                                                     |
| Portability script | fail (non-spec keys, 34 coverage gaps)                | pass (20 files)                                                                                                                                                                                      |

## After the Phase 5 review fixes

| Scenario           | Result                                                                                                                                                                        |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1 audit (re-run)  | pass: read dispatch before running anything; did not run `deploy` or `users remove`; every output-changing fix classed BREAKING; full target tree; lowercase deprecation line |
| S6 adopt (re-run)  | pass: per-path ownership decisions; AGENTS.md block appended, rest untouched; absolute auditor path flagged as machine-local                                                  |
| S7 narrow (new)    | pass: class/callers/impact stated before editing; test written and failing before the first edit; deprecation path kept; ci.sh migrated; command reference; 6/6 (re-run: 6/6) |
| Portability script | pass; now also rejects angle brackets in the description (verified against a planted `<noun>`)                                                                                |

Process notes (agent behavior, not skill defects): S4 wrote one throwaway file outside its
allowed folders and deleted it. S4/S3 ran the auditor brief themselves (a subagent cannot
spawn another), which is the skill's documented fallback.

Not verified: Copilot CLI and Grok are not installed here, so no run in those harnesses.
Only Windows; no real-terminal prompt or Ctrl-C paths.

## Re-run 2026-10-07 (catalog build, `dist/claude/plugins/cli-builder/skills/cli`)

Fresh general-purpose agent (Opus 5.5), run directory `sigil-v1-probe/s1`, graded against key.md.

| Scenario | Result       | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| -------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| S1 audit | pass (11/12) | D1, D2, D4–D12 found with evidence; ci.sh and README named as callers; approval block holds 8 BREAKING and 2 COMPATIBILITY findings; fixture unchanged (sha256). D3 is partial: it added a `release` group but kept `deploy` top-level as the daily verb, which grammar.md allows ("a few top-level verbs for the primary workflow"). The key and the skill disagree on D3. It rated D5, D9 and D11 BREAKING instead of UX, and gave a stream or exit-code change as the reason. It caught `deploy --help` running the action. |

Metrics: 72.6k tokens, 5 tool calls, 73 s.

Improvement found: to record output, the audit wrote `o.txt` and `e.txt` into the project and then deleted them. The cli `references/auditor.md` has no rule saying to run probes in a temporary directory; the wizard auditor has one (steps 2–3).
