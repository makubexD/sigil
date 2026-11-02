---
id: shared/worker-mode-guard
kind: hook
title: "Worker Mode Guard"
description: >-
  While worker mode is on (the file ~/.claude/state/worker-mode exists), blocks file edits so code
  changes go through a delegated worker instead of the main session. Plan files and anything under
  ~/.claude stay editable. Does nothing while worker mode is off.
event: before-tool
matcher: edit
script: |-
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const home = os.homedir();
  if (process.env.MK_WORKER || !fs.existsSync(path.join(home, '.claude', 'state', 'worker-mode'))) process.exit(0);
  if (!input) return;
  const file = input.files[0];
  if (typeof file !== 'string' || file === '') return;
  const full = path.resolve(file).split(path.sep).join('/');
  const claudeDir = path.join(home, '.claude').split(path.sep).join('/') + '/';
  if (full.startsWith(claudeDir)) return;
  if (/\/docs\/plan-[^/]*\.md$/.test(full) || /\/plans\//.test(full)) return;
  process.stderr.write(
    'Worker mode is on: edit ' + file + ' through the delegated worker (for example /mk-delegate) ' +
    'and review its diff. For a tiny fix or judgment work, ask the user to turn worker mode off ' +
    '(worker-mode off, or delete ~/.claude/state/worker-mode).\n'
  );
  process.exitCode = 2;
defaultScope: user
platforms: [claude]
tags: [workflow, delegation, shared]
---

Fires before every file edit, but only acts while the flag file
`~/.claude/state/worker-mode` exists. Then it reads the file the call names (sigil's hook input).
If the target is not allowed, it exits with code 2, which Claude Code treats as a block, and says
on stderr why and what to do instead.

sigil installs it in exec form (`node -e` with arguments), so no shell sits between Claude Code and the
exit code, and it works the same on Linux, macOS and Windows.

**Turning it on and off:** create or delete the flag file. The `worker-mode on|off|status` script
from [SyncSettings](https://github.com/makubexD/SyncSettings/blob/master/dotfiles/linux/claude/bin/worker-mode)
does that, and shows a `WORKER` badge in its status line.

**Never blocks the worker:** `mk-exec` sets `MK_WORKER=1` for its headless Claude Code run, which
loads project hooks too, so a project-scope install of this hook doesn't stop the worker it exists
for.

**Still editable while it's on:**
- Plan files: `docs/plan-*.md` and anything in a `plans/` folder, so the lead session can still
  write the spec it delegates
- Everything under `~/.claude` (settings, agents, memory)

**Not covered:**
- Writes made through the Bash tool (`sed -i`, redirects) or MCP tools. Pair it with an instruction
  not to route around it, as `shared/mk-delegate` does.
- A missing `node` on the PATH Claude Code runs with: the hook then fails without blocking. Input it
  can't parse is also let through.

Install it at `user` scope so one switch covers every project. Worker mode is a personal choice
about how you work, not a project setting.
