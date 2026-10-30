---
name: mk-check
description: "Install or verify the DeepSeek worker setup (mk-exec and workflow-report on the PATH, the worker's own Claude Code config, the DeepSeek key and balance, isolation from the main login, worker mode status) and run a short live job. Use only when the user runs /mk-check."
when_to_use: "Run manually as `/mk-check`, `/mk-check --install` or `/mk-check --effort high` before relying on /mk-delegate on a new machine, after changing the DeepSeek key, or when a delegated run fails — e.g. \"is the worker working\", \"set up the DeepSeek worker\", \"why did mk-exec exit 75\". Not for reviewing a delegated result; /mk-delegate does that."
argument-hint: "[--install] [--effort low|medium|high]"
disable-model-invocation: true
---

# /mk-check: check the DeepSeek worker setup

Arguments: $ARGUMENTS

## Install

Do this when the arguments contain `--install`, or when step 1 below finds something missing and
the user agrees. Never overwrite an existing file without showing the user the difference first.

1. Write `~/.local/bin/mk-exec` from [the mk-exec reference](references/mk-exec.md) and
   `~/.local/bin/workflow-report` from [the workflow-report reference](references/workflow-report.md),
   then `chmod +x` both. `~/.local/bin` must be on the PATH.
2. Create `~/.claude-worker` (mode 700) with the `CLAUDE.md` and `settings.json` from
   [the worker-config reference](references/worker-config.md).
3. The key: ask the user to add `export DEEPSEEK_API_KEY=<key>` to `~/.config/claude-workers/env`
   themselves (directory 700, file 600). Don't ask them to paste the key into the chat.

## Steps

Run the checks in as few shell calls as possible, then report a short checklist: one ✓ or ✗ per
line, with the fix for every ✗. Never print the API key.

1. **Installed:** `command -v mk-exec workflow-report claude`, and `~/.claude-worker/CLAUDE.md`
   and `~/.claude-worker/settings.json` exist.
2. **Key:** `~/.config/claude-workers/env` exists with mode 600 and has a key line:
   `grep -cE '^(export )?DEEPSEEK_API_KEY='`. Never `cat` it.
3. **Isolation:** `env | grep -c '^ANTHROPIC_'` in this session prints 0, and `~/.claude-worker`
   holds no `.credentials.json`. Only the `mk-exec` child process may get the DeepSeek endpoint.
4. **Worker mode:** if a `worker-mode` command is on the PATH, run `worker-mode status`. Otherwise
   report whether the flag file the `shared/worker-mode-guard` hook checks exists, if that hook is
   installed.
5. **Live test:** make a throwaway repo (`mktemp -d`), `git init`, and commit an empty `README.md`
   and a `CLAUDE.md` with the rule `Every line added to README.md must end with
   " (project rules loaded)".` Then run `mk-exec --effort <level, default low> <dir> "Append the line
   'mk-check ok' to README.md, following this repo's rules. Change nothing else. Then run: cat
   README.md"`. It passes if the exit code is 0, `README.md` contains `mk-check ok (project rules
   loaded)` (the worker read the project's own instructions), the summary shows a `project config:`
   line naming that file, `git status --short` shows only `README.md`, and the log dir named on the
   summary's last line holds `stream.jsonl`, `meta.json`, `diff.patch` and `summary.txt`. Report the
   model, effort, tokens, duration, the `cost≈` estimate from the summary and the balance from the
   banner, then delete the throwaway repo. Exit 75 means a key or balance problem; exit 2 means a
   missing key or a dirty tree.

   Known and expected, so don't flag them: `stderr.log` has an `unrecognized_model` line for
   `deepseek-*[1m]` (Claude Code doesn't know DeepSeek model names, and `[1m]` gives the worker its 1M
   context), and the transcript's own `total_cost_usd` is 0 for the same reason. `mk-exec` estimates
   the cost from the token counts and DeepSeek's prices instead. The balance updates with a delay, so
   one small run often shows no change.
