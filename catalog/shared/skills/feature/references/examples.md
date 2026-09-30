# /feature: real prompts and which mode to use

The mode map covers Claude Code and VS Code Copilot; in other tools use the closest
read-only and edit-allowed modes.

## Mode map

| Phase | Claude Code | VS Code Copilot | Why |
| --- | --- | --- | --- |
| 0 size, 1 clarify, 2 spec, 3 plan | **Plan mode** (`Shift+Tab` until `⏸ plan mode on`, or `claude --permission-mode plan`) | **Plan** agent | Read-only: nothing is edited while you're still deciding |
| Accept the plan | Dialog → **"Yes, and use auto mode"** | Hand off to **Agent** | Writes SPEC/tasks and starts building |
| 4 build, 5 review, 6 close-out | **Auto mode** | **Agent** | Edits and local commits; "never push" still holds |
| A ⚠ task you want to watch line by line | **Manual** or **acceptEdits** for that task only | **Agent** with tool approval on | You see every command or diff |
| Never | `bypassPermissions` | Auto-approve all tools | No protection at all |

Tip: put limits in your first message ("don't push", "don't touch src/auth/"). Limits stated in
the conversation are honoured for the rest of the run.

## New feature, requirements fuzzy (runs interview-me)

Mode: **Plan**
```
/feature the CLI should warn me when a config profile points at a missing credential,
before the first deploy fails. Not sure if this belongs in doctor, status, or a pre-check.
Don't push. Interview me first if you need to.
```
Expect: Phase 1 runs interview-me (for whom? when? warn or refuse?) → GATE 1.

## Direction clear, approach open (runs idea-refine)

Mode: **Plan**
```
/feature add JSON output to `mytool status` so scripts can consume it. Give me 2-3 design
variants (flag vs subcommand vs env var) before we spec anything.
```
Expect: idea-refine offers variants and you pick one → spec.

## New repo with no quality bar (runs constraint-driven-development)

Mode: **Plan**
```
/feature first real feature for this repo: CSV import for the locations table.
We have no written quality bar yet - set one up before specifying.
```
Expect: CONSTRAINTS.md is proposed (coverage floor, lint/type gates) and enforced in Phase 4.

## Everything clear (Phase 1 skipped)

Mode: **Plan**
```
/feature add `mytool profiles rename <old> <new>` that updates the registry and every
project that references the old name. Tests first. Don't push.
```

## Sensitive work (⚠ tasks)

Mode: **Plan**, then **Manual** for ⚠ tasks
```
/feature teach `mytool fix` to also remove stale credential entries for the wrong account.
This touches credential storage: mark every task that writes it as risky,
and run each of those one at a time with me watching.
```

## Resuming in a new session

Mode: whatever phase you're in (the skill tells you if it's wrong)
```
/feature resume
```
```
/feature status
```

## Nudging mid-run

```
approve                                  # passes a gate
no - split task 3 so the parser change lands before the CLI change
skip idea-refine, I already know the approach
the docs-drift check flagged README line 140: fix it the way the code behaves, not the spec
```

## Not a /feature

| You want | Use instead |
| --- | --- |
| Typo or one-line fix | Just ask, with edits allowed |
| Bug | `test-driven-development` (failing test first) |
| Review someone's diff | `code-review-and-quality` |
| Pre-release go/no-go | `shipping-and-launch` |
