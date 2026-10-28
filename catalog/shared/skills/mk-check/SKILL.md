---
id: shared/mk-check
kind: skill
name: mk-check
title: Check the Free Worker Setup
description: >-
  Verify the free-worker setup (oc-exec on the PATH, OpenCode installed, only the two allowed free
  models pinned, worker mode status) and run a short live job on DeepSeek, or on the GLM fallback.
  Use only when the user runs /mk-check.
whenToUse: >-
  Run manually as `/mk-check` or `/mk-check --fallback` before relying on /mk-delegate on a new
  machine, after updating OpenCode, or when a delegated run fails or hangs — e.g. "is the free
  worker working", "check the OpenCode setup", "why did the worker time out". Not for reviewing a
  delegated result; /mk-delegate does that.
argumentHint: "[--fallback]"
disableModelInvocation: true
uses:
  agents:
    - shared/mk-worker
tags:
  - delegation
  - workflow
---

# /mk-check: check the free-worker setup

Arguments: {sigil:arguments}

## Steps

Run the checks in as few shell calls as possible, then report a short checklist: one ✓ or ✗ per
line, with the fix for every ✗.

1. **Installed:** `command -v oc-exec` and `opencode --version`. OpenCode often comes from a Node
   version manager, so load it first if needed (for nvm: `source ~/.nvm/nvm.sh`). Also confirm the
   `mk-worker` agent is available to you.
2. **Pinned models:** `grep -E 'model=' "$(command -v oc-exec)"` shows only
   `opencode/deepseek-v4.1-flash-free` and `opencode/glm-5.3-flash-free`. Anything else is a ✗:
   other free models may keep data for training.
3. **Empty stdin:** the `opencode run` line in `oc-exec` ends with `< /dev/null`. Without it, a run
   started in the background waits for input until it times out.
4. **Worker mode:** if a `worker-mode` command is on the PATH, run `worker-mode status`. Otherwise
   report whether the flag file the `shared/worker-mode-guard` hook checks exists, if that hook is
   installed.
5. **Live test:** make a throwaway repo (`mktemp -d`), `git init`, and commit an empty `README.md`.
   Then run
   `oc-exec <dir> "Append the line 'mk-check ok' to README.md. Change nothing else." > <dir>.log 2>&1`
   and `grep -m1 'oc-exec: model=' <dir>.log; tail -5 <dir>.log`. Add `--fallback` as the first
   argument when the arguments contain `--fallback`. It passes if `README.md` contains
   `mk-check ok` and `git status --short` shows only `README.md`. Report the model from the banner
   and how long the run took, then delete the throwaway repo and its log.

This check runs `oc-exec` directly instead of handing off to `mk-worker`, so it costs no helper agent.
