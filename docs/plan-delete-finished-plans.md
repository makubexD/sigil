# Plan: delete finished plans

Deletes the four finished plan files named in the project memory, and repoints the two references to them. Nothing else
changes: no code behaviour, no catalog, no generated files. The plans stay readable with `git show 5b29fa4:docs/<plan>`.

Stays: `docs/plan-opencode-target.md` (Phase F is open), `docs/plan-cursor-target.md` and `docs/plan-cursor-target-f.md`
(Phase F paused).

## Step 1: Delete the four plans and repoint their references `[inline: tiny edit, two lines and four deletions]`

Files:

- Delete `docs/plan-ado-install-input.md`, `docs/plan-claude-md-trim.md`, `docs/plan-opencode-eval.md`,
  `docs/plan-opencode-target-e.md`.
- `docs/plan-opencode-target.md:94`: drop the link, so the line reads "Done 2026-11-04: `shared/ado` moved to `azcli`, so
  OpenCode has all 4 of 4 servers."
- `scripts/probe-opencode.mjs:7-9`: replace "It answers the cases of docs/plan-opencode-target-e.md and the OpenCode rows
  that need no model" with "It answers the OpenCode rows that need no model", keeping the ADR path on the next line, and
  rewrap the comment.

Test:

```bash
! git grep -nE 'plan-(ado-install-input|claude-md-trim|opencode-eval|opencode-target-e)\b' -- . ':!docs/plan-delete-finished-plans.md' && npm run format:check && npm run lint
```

## Step 2: Delete this plan `[inline: tiny edit, one deletion]`

Run it last, in the finish commit, so `plan-next` still reads the plan from history. Delete
`docs/plan-delete-finished-plans.md`.

Test:

```bash
test ! -e docs/plan-delete-finished-plans.md
```
