---
id: shared/mk-delegate
kind: skill
name: mk-delegate
title: Delegate to the Free Worker
description: >-
  Hand one mechanical coding task, or one step of a written plan, to the free worker (the mk-worker
  agent: OpenCode on DeepSeek V4.1 Flash Free), then review its diff and rerun its tests before
  accepting. Use only when the user runs /mk-delegate.
whenToUse: >-
  Run manually as `/mk-delegate <task>` or `/mk-delegate step 2 of docs/plan-x.md` when the user
  wants a mechanical change (renames, docstrings, test conversions, a planned step with exact files
  and a test command) done by the free worker instead of the main session — e.g. "send step 2 to
  the free worker", "delegate this rename", "have the worker do the test conversion". Not for
  design, debugging or user-facing copy, and not for anything that needs secrets.
argumentHint: "<task> | step <N> of <plan file>"
disableModelInvocation: true
uses:
  rules:
    - shared/orchestration
  agents:
    - shared/mk-worker
tags:
  - delegation
  - workflow
---

# /mk-delegate: hand a task to the free worker

Task from the user: {sigil:arguments}

## Steps

1. **Check the task.** If it is empty, ask what to delegate and stop. If it names a plan step
   ("step 2 of docs/plan-x.md"), read that step and use its files, change and test command as the
   spec. If it is judgment work (design, debugging, user-facing copy), say so in one line and ask
   whether to do it in the main session instead.
2. **Check the repo.** Run `git rev-parse --show-toplevel` and `git status --short`. If it isn't a
   git repo, or the tree is dirty, stop and tell the user to commit or stash first.
3. **Write the spec** in a few lines: the exact change, the files allowed to change, and the test
   command that proves it's done. Never include secrets, `.env` contents or private data. The
   worker sends everything to a third-party service.
4. **Delegate.** Print the report line, then hand the repo path and the spec to the `mk-worker`
   agent:
   `⏵ mk-worker (opencode/deepseek-v4.1-flash-free, low effort): <task in 10 words or fewer>`
5. **Review it yourself.** The agent's report is a claim. Read `git diff`, rerun the test command,
   and check that only the allowed files changed and no tests were deleted or skipped. Its tests
   cover the paths it thought of. Exercise the interactive or error paths it may have skipped.
6. **Report** to the user: accepted or rejected, files changed, test result, which model ran and
   whether the fallback was used. Don't commit unless the user asks.
   - Rejected once: resend with a concrete correction.
   - Rejected twice: tell the user and offer to do it in the main session.

## Worker mode

If edits are blocked with "Worker mode is on" (the `shared/worker-mode-guard` hook), don't route
around it by writing files through shell commands such as `sed -i`, heredocs or redirects. Send the
change through this command, or ask the user to turn worker mode off.
