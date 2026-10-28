---
id: shared/mk-delegate
kind: skill
name: mk-delegate
title: Delegate to the DeepSeek Worker
description: >-
  Hand one mechanical coding task, or one step of a written plan, to the DeepSeek worker (mk-exec:
  a headless Claude Code run on the paid DeepSeek API), then review its diff and rerun its tests
  before accepting. Use only when the user runs /mk-delegate.
whenToUse: >-
  Run manually as `/mk-delegate <task>`, `/mk-delegate step 2 of docs/plan-x.md` or
  `/mk-delegate --effort high <task>` when the user wants a mechanical change (renames, docstrings,
  test conversions, a planned step with exact files and a test command) done by the worker instead
  of the main session — e.g. "send step 2 to the worker", "delegate this rename", "have the worker
  do the test conversion". Not for design, debugging or user-facing copy, and not for anything that
  needs secrets.
argumentHint: "[--effort low|medium|high] <task> | step <N> of <plan file>"
disableModelInvocation: true
uses:
  rules:
    - shared/orchestration
tags:
  - delegation
  - workflow
---

# /mk-delegate: hand a task to the DeepSeek worker

Arguments from the user: {sigil:arguments}

## Steps

1. **Parse effort.** If the arguments start with `--effort <level>`, take it (`low`, `medium` or
   `high`) and drop it from the task. The default is `medium`. A plan step tagged `[worker:<level>]`
   sets it too, and an explicit `--effort` wins. low runs `deepseek-flash` at low effort, medium runs
   `deepseek-flash` at high effort, and high runs `deepseek-v4-pro` at high effort.
2. **Check the task.** If it is empty, ask what to delegate and stop. If it names a plan step
   ("step 2 of docs/plan-x.md"), read that step and use its files, change and test command as the
   spec. If the step is tagged `[inline: …]`, stop and say the main session should do it, quoting
   the reason. If it is judgment work (design, debugging, user-facing copy), say so in one line and
   ask whether to do it in the main session instead. If its result is a model's own behavior (an
   eval or probe run), stop: the worker would measure DeepSeek, not the model under test. Delegating
   the eval files is fine.
3. **Check the repo.** Run `git rev-parse --show-toplevel` and `git status --short`. If it isn't a
   git repo, or the tree is dirty, stop and tell the user to commit or stash first.
4. **Size it.** A worker step is one concern touching at most about 3 files. If the step is
   bigger (several separate changes, a long file-by-file list), split it into sub-steps and send
   them one at a time, reviewing each before the next. Keep the effort level already chosen.
5. **Write the spec** in a few lines: the exact change, the files allowed to change, the test
   command that proves it's done, and any setup it needs (such as loading a Node version manager).
   Name callers outside the allowed files that the change could break, so the worker stops instead
   of leaving them broken. The worker reads the repo's own instructions, rules and project hooks
   itself, so don't restate them; the summary's `project config:` line shows what it loaded. Never
   include secrets, `.env` contents or private data. The worker sends
   everything to DeepSeek, which is not zero-retention.
6. **Delegate.** Print the report line, then run `mk-exec` in the background and wait for the
   completion notification instead of polling:
   `⏵ mk-exec (deepseek <model>, <level> effort): <task in 10 words or fewer>`
   `mk-exec --effort <level> <repo> '<spec>'`
   Read only the summary it prints (40 lines at most, ending with `--- log <dir>`). The full
   transcript is in `<dir>/stream.jsonl` when you need it.
7. **Read the exit code.** 0: review it. 75: a DeepSeek key, balance or rate problem. Stop, report
   the error line and don't retry. 2: a setup problem (dirty tree, missing key); fix it and rerun.
   124: timed out after 15 minutes; treat it as a rejection. `(max turns)`: the step was too big
   and the diff may be partial; review what's there, then split the rest and send it. Any other
   non-zero code: read the errors in the summary and treat it as a rejection.
8. **Review it yourself.** The summary is a claim. Read `git diff`, rerun the test command, and
   check that only the allowed files changed and no tests were deleted or skipped. Its tests cover
   the paths it thought of. Exercise the interactive or error paths it may have skipped.
9. **Report** to the user: accepted or rejected, files changed, test result, model, effort, tokens
   and the log dir. A one-off task: don't commit unless the user asks. A step of a committed plan:
   commit the accepted step and send the next one without asking, since the committed plan is the
   approval. Stop and ask only at an `[inline]` judgment step, a rejection or failure, or the end
   of the phase or plan.
   - Rejected once: resend with a concrete correction.
   - Rejected twice: tell the user and offer to do it in the main session.

## Worker mode

If edits are blocked with "Worker mode is on" (the `shared/worker-mode-guard` hook), don't route
around it by writing files through shell commands such as `sed -i`, heredocs or redirects. Send the
change through this command, or ask the user to turn worker mode off.
