---
id: shared/worker-mode-guard
kind: hook
title: "Worker Mode Guard"
description: >-
  While worker mode is on (the file ~/.claude/state/worker-mode exists), blocks Edit, Write,
  MultiEdit and NotebookEdit calls so code changes go through a delegated worker instead of the
  main session. Plan files and anything under ~/.claude stay editable. Does nothing while worker
  mode is off.
event: PreToolUse
matcher: "Edit|Write|MultiEdit|NotebookEdit"
command: node
defaultScope: user
platforms: [claude]
args:
  - "-e"
  - |-
    const fs = require('fs');
    const os = require('os');
    const path = require('path');
    const home = os.homedir();
    if (!fs.existsSync(path.join(home, '.claude', 'state', 'worker-mode'))) process.exit(0);
    let raw = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => (raw += chunk)).on('end', () => {
      let file;
      try {
        const input = JSON.parse(raw).tool_input || {};
        file = input.file_path || input.notebook_path;
      } catch { return; }
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
    });
tags: [workflow, delegation, shared]
---

Fires before every Edit, Write, MultiEdit or NotebookEdit call, but only acts while the flag file
`~/.claude/state/worker-mode` exists. Then it reads `tool_input.file_path` (or `notebook_path`)
from the JSON Claude Code passes on stdin. If the target is not allowed, it exits with code 2,
which Claude Code treats as a block, and says on stderr why and what to do instead.

It runs in exec form (`command: node` with `args`), so no shell sits between Claude Code and the
exit code, and it works the same on Linux, macOS and Windows.

**Turning it on and off:** create or delete the flag file. The `worker-mode on|off|status` script
from [SyncSettings](https://github.com/makubexD/SyncSettings/blob/master/dotfiles/linux/claude/bin/worker-mode)
does that, and shows a `WORKER` badge in its status line.

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
