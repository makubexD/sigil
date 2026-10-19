# Phase V: verified facts (2026-10-19)

## Claude Code docs (claude-code-guide agent, cited pages; docs claims, not runtime tests)
- Stop hook blocks via exit 2 (stderr -> model) or JSON `decision: "block"` + `reason`. Exit 0 + stderr: no documented
  path to the model (hooks-guide). => ECC stop-format-typecheck (exit 0) most likely never reaches the model. H2 stands.
- `stop_hook_active` true when a Stop hook already forced a continuation; hooks must exit early on it. Hard cap: 8
  consecutive blocks with no tool call between. Command hook default timeout 600 s, per-hook `timeout` field.
- Skill listing: 1,536 chars per description+when_to_use, truncated. No documented total budget for skills or agents.
  => A2 reject (sigil already checks 1,536 per artifact).
- Path-scoped `.claude/rules` reach subagents (sub-agents.md "Context reaching subagents"); CLAUDE.md too unless
  `omitClaudeMd`; SessionStart additionalContext does NOT. SubagentStart hook exists (matcher on agent name).
  => H3 have (sigil rules are path-scoped files); ponytail's subagent injection solves a problem sigil lacks.

## Catalog checks (orchestrator)
- T1 verified RED: `catalog/shared/skills/feature/SKILL.md:103-104` "show that they fail for the expected reason". The
  `*-generate-tests` skills write tests for existing code, so verified RED does not apply there. => T1 have.
- F5 candidate: `ts-generate-tests/SKILL.md:90-92` "Fix any failures before finishing" (also react :102, py :83 area):
  for existing code a failing generated test may be a real bug; the instruction lets the agent bend the assertion to
  the bug. Fix: say whether the test or the code is wrong; never weaken an assertion to pass; report suspected bugs.

## Panel defect claims, re-checked by the orchestrator against catalog source (2026-10-19)
Numbering follows senior.md. W = would produce a bug; D = debatable.
| ID | Verdict | Evidence read |
|---|---|---|
| F1 | confirmed, class wider | ts-async:58-69; py-async:49-52; ng-rxjs:37 (`mergeMap` fan-out, no concurrency arg); profilers ts:59-65, cs:54 (`Task.WhenAll`), react:84 (principal) |
| F2 | confirmed as duplication/drift, not strict contradiction | react-conventions:27 omits role queries; react-testing:27-28 ranks roles > testid; reviewer:75 per senior (not re-read) |
| F3 | confirmed as class | `npx vitest run` in react-debugger:34,78, react-refactor-specialist:46,88, react-code-reviewer:86, react-add-package:98 (scaffold-project is fine: it chooses vitest) |
| F5 | confirmed W (security) | cs-security:82-85 `StartsWith(safeRoot)` without trailing separator: `/app/data-evil` passes |
| F6 | confirmed W (security) | ts-security:157-158 private ranges omit 169.254/IPv6/0.0.0.0; no resolved-address check |
| F7 | confirmed W (version) | ts-security:90-91 recommends `yaml.safeLoad` (removed in js-yaml 4); auditor:88 flags `yaml.load` (safe default in v4) -> false positive |
| F8 | confirmed, conditional | cs-profiler:54 "use Task.WhenAll" for sequential awaits, no shared-DbContext caveat; py-profiler:75 same for TaskGroup |
| F9 | confirmed W (doctrine) | refactor specialists ng:67, cs:70, py:71, ts:66 "two or more … 80%" vs clean-code:21 "extract on the third" |
| F10 | confirmed W | ng-async:81-86 per-call subscribe races (the race :98-108 forbids); :108 switchMap subscribe has no teardown |
| F11 | confirmed for TS only | ts-async:56-57 "first rejection cancel all work" (Promise.all cancels nothing); py-async:59-61 text is correct |
| F12 | confirmed W | ts-conventions:187,191 + ts-code-reviewer:81 `@ts-expect-error` on `any` (unused directive = compile error); "bare `throw`" invalid JS |
| F13 | confirmed W | cs-async:105 `.WhenBoth()` is not a .NET API |
| F14 | confirmed W (Next 15+) | react-async:65-66 synchronous `params.id` |
| F15 | confirmed (perf) | py-async:29,117 new `httpx.AsyncClient` per call |
| F16 | confirmed D | ng-testing:99, cs-testing:138 fixed 70% floor; py-testing:155 discovers the project's floor |
| F20 | confirmed D | ts-project-layout:23 "~200 lines … split it" |
| F21 | new (orchestrator + principal) | ts-generate-tests:90-92, react-generate-tests:102, py :83 "Fix any failures before finishing" |
| A4 | new (principal) | description-budget.ts:20 `CHAR_BUDGET = 1536` hardcoded; CLAUDE.md says provider limits are KindEmitSpec.limits data |
| H0 | new, low (principal) | protect-config.hook.md:21 fails open on unparsable stdin (`catch { return; }`) |
Not re-checked: F17, F18, F19 (senior), Copilot hooks support (principal: docs/ideas/copilot-hooks.md).

## SME claims re-checked (orchestrator, runs/*.jsonl)
- B1-current T5 declarations 10/3/11; every other arm's T5 values sit in 2–11, most runs 2–5. Confirmed: B1 as a shared baseline handed out a free
  T5 win. T3 = 2/2/2 in all 10 arms: uninformative. `measure.mjs:201` pairs by `task#run` (arbitrary pairing).
