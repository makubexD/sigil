---
id: shared/feature
kind: skill
name: feature
title: Feature Conductor (Gated Spec-Driven Development)
description: >-
  Drive one feature end to end with approval gates — clarify (interview / ideas / quality bar),
  spec, plan, TDD build with docs updated in every task, review, close-out. Conducts the
  agent-skills collection (addyosmani/agent-skills); does not replace it. Use only when the user
  explicitly runs /feature or asks for the gated feature flow.
whenToUse: >-
  Run manually as `/feature <what to build>`, `/feature resume` or `/feature status` when the user
  wants a whole feature taken from idea to committed code under explicit approval gates — e.g.
  "run the feature flow for X", "spec, plan and build X with gates", "resume the feature run".
  Not for a typo or one-line fix, a bug (write a failing test first instead), or reviewing someone
  else's diff.
argumentHint: "<what to build> | resume | status"
disableModelInvocation: true
tags:
  - workflow
  - spec-driven-development
  - tdd
---

# /feature: gated conductor for agent-skills

**Request:** {sigil:arguments} (if empty, ask what to build)

## Rules for every phase

- **Gates:** at every GATE, stop and wait. Only "approve", "go", "yes" (or equivalent)
  counts. A hedged reply ("looks ok I guess") is NOT approval.
- **Dependency:** phases call skills and agents from agent-skills (addyosmani/agent-skills),
  named here by their bare name (`spec-driven-development`, `code-reviewer`). In Claude Code they
  are namespaced `agent-skills:<name>`; elsewhere they use the bare name. If they aren't available
  in this session, say so, suggest the install for the current tool, and stop:
  - Claude Code: `claude plugin marketplace add addyosmani/agent-skills`, then
    `claude plugin install agent-skills@addy-agent-skills --scope user`
  - Copilot CLI: `copilot plugin install addyosmani/agent-skills`
  - VS Code and other agents: `npx skills add addyosmani/agent-skills` (skills only — copy the
    agent personas from its `agents/` folder separately, see its Copilot setup guide)
- **Never push. Never force anything.** Commits are local and one per task.
- **Project rules win.** Read {sigil:conventions-file} (and docs/DECISIONS.md or ADRs, if
  present) before Phase 2. Where a skill's generic advice conflicts with a recorded project
  decision, follow the project and say so.
- **Mode hints:** Phases 0-3 are drafted in conversation and write nothing (plan mode, where
  the tool has one). SPEC, `tasks/todo.md` and the "Plan:" commit are written only after GATE 3
  is approved and edit permission is granted. Phases 4-6 need edit permission. If the current
  mode doesn't match, say which mode to switch to and continue. [`references/examples.md`](references/examples.md) has
  the mode map for Claude Code and VS Code.
- **Live state** lives in `tasks/todo.md` from GATE 3 on: after each task or phase, update its
  checkbox and a one-line `Status:` header, so `/feature resume` works in a new session.

## Arguments

- `resume` (once `tasks/todo.md` exists): read `tasks/todo.md` and SPEC*.md, report where things stand, continue from the
  next unchecked item (still honouring gates).
- `status`: report phase, tasks done/remaining and open questions. Change nothing.
- Anything else: a new feature. If `tasks/todo.md` has unchecked tasks for different
  work, stop and ask before overwriting.

## Phase 0: Size check

Classify the request: **trivial** (one file, obvious) → say so and suggest a plain plan-mode
plan instead, then stop. **Bug** → suggest the `test-driven-development` skill's Prove-It
pattern (a failing test first), then stop. **Feature** → continue. GATE 0 only if you
recommend stopping.

## Phase 1: Clarify (before the spine; run only what applies, and say which and why)

| Signal | Invoke | Output |
| --- | --- | --- |
| Unclear *why*, *for whom* or *what done looks like*; or the user says "interview me" | `interview-me` | Confirmed intent statement |
| Direction known, approach open; or the user wants options | `idea-refine` | Chosen variant (+ `docs/ideas/<name>.md` if confirmed) |
| No `CONSTRAINTS.md` and no written quality bar | `constraint-driven-development` | `CONSTRAINTS.md` |

Order when several apply: interview-me → idea-refine → constraints. If none apply, say
"clear enough, skipping Phase 1" with one line of evidence. If CONSTRAINTS.md exists, read
it and follow it for the rest of the run.
**GATE 1:** a restatement of intent in ≤3 lines + chosen approach + quality bar in force.

## Phase 2: Spec

Invoke `spec-driven-development`, feeding it the Phase 1 output; keep the spec in the
conversation (or the plan file) until GATE 3.
**GATE 2:** a 5-line summary (objective · out of scope · success criteria · riskiest
assumption · open questions) + spec path(s).

## Phase 3: Plan

Invoke `planning-and-task-breakdown`. Every task must also list its
**Docs:** line: which of README / docs/DECISIONS.md or ADR / {sigil:conventions-file} / help
text / CHANGELOG the task changes, or `none` with a reason. Mark ⚠ any task touching
credentials, auth, git config or hooks, secrets, deletions, or anything `git revert` can't undo.
**GATE 3:** one line per task: `[⚠] title - Docs: ...`.
After approval (and with edit permission), write SPEC and `tasks/todo.md`, then commit them
alone ("Plan: <feature>").

## Phase 4: Build (TDD, docs in the same commit)

For each task in dependency order:

1. **RED:** following `test-driven-development`, write the test(s) for the acceptance
   criteria. Run them and **show that they fail for the expected reason**. A test that
   passes before the code exists proves nothing: fix the test.
2. **GREEN:** the minimum code to pass (`incremental-implementation`).
3. **REFACTOR** with tests green. Then run the full suite + build/typecheck + CONSTRAINTS checks.
4. **DOCS:** apply the task's Docs line now, following `documentation-and-adrs`.
   Behaviour → README/help. A non-obvious *why* → DECISIONS/ADR. A new rule for agents →
   {sigil:conventions-file} (one line, only if the agent would otherwise get it wrong). Docs
   describe what the code does *now*, never plans.
5. **COMMIT** code + tests + docs + todo checkbox together. Stage by name; never `git add -A`.

⚠ tasks: before starting, run `doubt-driven-development` and wait for an explicit go on
that task alone. Unmarked tasks run back to back without stopping.
Stop and ask if a test can't be made to pass, the build breaks without an obvious fix,
or the spec doesn't cover a decision (`debugging-and-error-recovery`).

## Phase 5: Review (runs in parallel)

In ONE turn, launch together (one after another if the tool has no subagents):
- the agent-skills `code-reviewer` agent: five-axis review of the diff since the "Plan:" commit.
- a fresh-context general-purpose subagent, **docs-drift check**: "Compare README,
  {sigil:conventions-file}, docs/ and --help output against the code on this branch. List every
  statement that is now false, missing, or describes intent rather than behaviour. Cite
  file:line on both sides."
- the agent-skills `security-auditor` agent **only if** any task was ⚠.

Merge the reports. Fix Critical/Required items (TDD again for behaviour changes), fix all
docs drift, and list what's left. **GATE 5:** findings fixed · findings deferred (with reasons).

## Phase 6: Close-out (the step agent-skills lacks)

1. Move every still-true, non-obvious fact from SPEC*.md / CAPABILITY-MAP.md / docs/ideas
   to its permanent home (README, DECISIONS/ADR, {sigil:conventions-file}). Nothing gets lost;
   nothing is duplicated.
2. Grep for references, then delete SPEC*.md, CAPABILITY-MAP.md and tasks/. Keep
   CONSTRAINTS.md and docs/ideas if the user wants them kept.
3. If agent memory is in use, save only facts the repo does not record (preferences,
   decisions from conversation), not code facts.
**GATE 6:** what moved where · what was deleted · the final commit message. Commit after approval.

Finish with: tasks done, tests added, commits (hash + title), docs touched, deferred items.

Real prompt examples and mode guidance: [`references/examples.md`](references/examples.md) (read it only when the user
asks how to use this skill).
