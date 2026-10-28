---
id: shared/reviewer-bash-guard
kind: hook
title: "Reviewer Bash Guard"
description: >-
  Blocks write-shaped Bash commands (file writes and redirects, in-place edits, git commits and
  checkouts, package installs, fixers and formatters) when a read-only reviewer or auditor
  subagent runs them. The main session and every other agent are not affected.
event: PreToolUse
matcher: Bash
command: node
args:
  - "-e"
  - |-
    const READ_ONLY = /^(?:[a-z0-9-]+-)?(?:code-reviewer|security-auditor|architecture-reviewer|api-compat-reviewer|template-reviewer)$/;
    const MUTATORS = new Set(['rm', 'rmdir', 'mv', 'cp', 'mkdir', 'touch', 'chmod', 'chown', 'chgrp', 'ln', 'truncate',
      'dd', 'install', 'unlink', 'rsync', 'shred', 'tee', 'patch', 'wget', 'eval', 'rimraf']);
    const INLINE = { node: /^(-e|--eval|-p|--print)$/, python: /^-c$/, python3: /^-c$/, ruby: /^-e$/,
      perl: /^-([a-zA-Z]*i|e|E)/, bash: /^-[a-zA-Z]*c/, sh: /^-[a-zA-Z]*c/, zsh: /^-[a-zA-Z]*c/ };
    const GIT_WRITE = new Set(['commit', 'push', 'add', 'rm', 'mv', 'checkout', 'switch', 'restore', 'reset', 'rebase',
      'merge', 'cherry-pick', 'revert', 'clean', 'apply', 'am', 'pull', 'init', 'clone', 'gc', 'prune', 'worktree',
      'submodule', 'mergetool']);
    const PKG_WRITE = new Set(['install', 'i', 'ci', 'add', 'remove', 'rm', 'uninstall', 'un', 'link', 'unlink',
      'update', 'up', 'upgrade', 'dedupe', 'prune', 'publish', 'init', 'version', 'pkg', 'set']);
    const RUNNERS = { npm: ['exec', 'x'], pnpm: ['exec', 'dlx'], yarn: ['dlx', 'exec'], bun: ['x'], uv: ['run'],
      poetry: ['run'], pipenv: ['run'], pdm: ['run'], hatch: ['run'] };
    const PY_PKG = new Set(['install', 'uninstall', 'add', 'remove', 'sync', 'lock', 'update', 'upgrade']);
    let raw = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => (raw += chunk)).on('end', () => {
      let input;
      try { input = JSON.parse(raw); } catch { return; }
      if (!input || input.tool_name !== 'Bash' || typeof input.agent_type !== 'string') return;
      if (!READ_ONLY.test(input.agent_type.split(':').pop())) return;
      const command = input.tool_input && input.tool_input.command;
      if (typeof command !== 'string') return;
      const segments = unquote(command).split(/&&|\|\||[;|\n`)]|\$\(/);
      const why = segments.map(segmentReason).find(Boolean);
      if (why) {
        process.stderr.write('sigil-hook: blocked ' + why + ' for read-only agent ' + input.agent_type +
          '. This agent makes no edits; report the change instead of making it.\n');
        process.exitCode = 2;
      }
    });
    // Blanks quoted text so `grep "a > b"` is not a redirect, but keeps $(...) and `...` inside double quotes.
    function unquote(cmd) {
      let out = '';
      for (let i = 0; i < cmd.length; i++) {
        const c = cmd[i];
        if (c === '\\') { out += c + (cmd[i + 1] ?? ''); i++; continue; }
        if (c === "'") { const end = cmd.indexOf("'", i + 1); i = end < 0 ? cmd.length : end; out += "''"; continue; }
        if (c !== '"') { out += c; continue; }
        for (i++; i < cmd.length && cmd[i] !== '"'; i++) {
          if (cmd[i] === '\\') { i++; continue; }
          const close = cmd[i] === '`' ? '`' : cmd[i] === '$' && cmd[i + 1] === '(' ? ')' : '';
          if (!close) continue;
          const start = close === '`' ? i + 1 : i + 2;
          const end = cmd.indexOf(close, start);
          out += ' ; ' + cmd.slice(start, end < 0 ? cmd.length : end) + ' ; ';
          i = end < 0 ? cmd.length : end;
        }
        out += "''";
      }
      return out;
    }
    function segmentReason(seg) {
      const re = /(>>?)(\|?)(&?)\s*([^\s;&|<>()]*)/g;
      for (let m; (m = re.exec(seg)); ) {
        const target = m[4];
        if (m[3] === '&' || target === '' || /^\/dev\/(null|stdout|stderr|fd\/\d+)$/.test(target)) continue;
        return 'a redirect into ' + target;
      }
      const t = seg.trim().split(/\s+/).filter(Boolean);
      while (t.length && (/^[A-Za-z_][A-Za-z0-9_]*=/.test(t[0]) || ['sudo', 'env', 'command', 'nohup', 'time', 'exec'].includes(t[0]))) t.shift();
      // Runners (npx, pnpm dlx, uv run, …) start another command: check that one instead.
      for (;;) {
        if (['npx', 'bunx', 'uvx'].includes(t[0])) t.shift();
        else if ((RUNNERS[t[0]] || []).includes(t[1])) t.splice(0, 2);
        else break;
        while (t.length && t[0].startsWith('-')) t.shift();
      }
      if (t.length === 0) return '';
      const cmd = t[0].split('/').pop();
      return writes(cmd, t.slice(1)) ? '`' + t.join(' ') + '`' : '';
    }
    function writes(cmd, args) {
      const has = (...flags) => args.some(a => flags.includes(a));
      const sub = args.find(a => !a.startsWith('-'));
      if (MUTATORS.has(cmd)) return true;
      if (INLINE[cmd] && args.some(a => INLINE[cmd].test(a))) return true;
      if (cmd === 'sed' && args.some(a => /^(-[a-zA-Z]*i|--in-place)/.test(a))) return true;
      if (cmd === 'git') return gitWrites(args);
      if (['npm', 'pnpm', 'yarn', 'bun'].includes(cmd)) return PKG_WRITE.has(sub) || (sub === 'audit' && has('fix'));
      if (['pip', 'pip3', 'uv', 'poetry', 'pipenv', 'conda'].includes(cmd)) return args.some(a => PY_PKG.has(a));
      if (['python', 'python3'].includes(cmd) && has('-m')) return args.some(a => PY_PKG.has(a));
      if (cmd === 'dotnet') {
        if (sub === 'format') return !has('--verify-no-changes');
        return ['add', 'remove', 'new', 'tool', 'workload', 'nuget'].includes(sub) || (sub === 'sln' && has('add', 'remove'));
      }
      if (cmd === 'ng') return ['add', 'generate', 'g', 'update', 'new', 'deploy'].includes(sub);
      if (cmd === 'ruff' && sub === 'format') return !has('--check', '--diff');
      if (cmd === 'black' || cmd === 'isort') return !has('--check', '--diff', '--check-only');
      if (cmd === 'autopep8' || cmd === 'yapf' || cmd === 'gofmt') return has('-i', '--in-place', '-w');
      if (cmd === 'cargo') return ['add', 'remove', 'install', 'update', 'fix', 'new', 'init', 'publish'].includes(sub) || (sub === 'fmt' && !has('--check'));
      if (cmd === 'go') return ['get', 'install', 'fmt', 'generate', 'mod'].includes(sub);
      if (cmd === 'curl') return has('-o', '-O', '--output', '--remote-name', '--output-dir');
      if (cmd === 'find') return has('-delete', '-exec', '-execdir', '-ok', '-okdir', '-fprint');
      if (cmd === 'xargs') return args.some(a => MUTATORS.has(a.split('/').pop()));
      return args.some(a => a === '--fix' || a === '--write' || a.startsWith('--fix=') || a.startsWith('--write='));
    }
    function gitWrites(args) {
      let i = 0;
      while (i < args.length && args[i].startsWith('-')) i += ['-C', '-c', '--git-dir', '--work-tree'].includes(args[i]) ? 2 : 1;
      const sub = args[i];
      const rest = args.slice(i + 1);
      if (GIT_WRITE.has(sub)) return true;
      if (sub === 'stash') return !['list', 'show'].includes(rest[0]);
      if (sub === 'remote') return ['add', 'remove', 'rm', 'rename', 'set-url', 'set-head', 'prune'].includes(rest[0]);
      if (sub === 'notes') return ['add', 'append', 'edit', 'remove', 'copy', 'merge', 'prune'].includes(rest[0]);
      if (sub === 'config') return rest.some(a => /^--(unset|add|replace-all|edit|rename-section|remove-section)/.test(a) || a === '-e') ||
        rest.filter(a => !a.startsWith('-')).length >= 2;
      if (sub === 'branch' || sub === 'tag') {
        if (rest.some(a => a === '-l' || a === '--list')) return false;
        const valued = ['--contains', '--no-contains', '--merged', '--no-merged', '--points-at', '--sort', '--format'];
        return rest.some((a, k) => ['-d', '-D', '-m', '-M', '-c', '-C', '-f', '--delete', '--move', '--copy', '--force'].includes(a) ||
          (!a.startsWith('-') && !valued.includes(rest[k - 1])));
      }
      return false;
    }
platforms: [claude]
tags: [security, safety, review, shared]
# version:       # per-artifact semver (optional; package version is the default)
---

<!-- Describe what this hook does and when it fires. The command: above is executed. -->

Fires before every Bash tool call. The hook reads the caller's `agent_type` from the call's JSON
on stdin. Only the read-only review agents are checked: names ending in `code-reviewer`,
`security-auditor`, `architecture-reviewer`, `api-compat-reviewer` or `template-reviewer`, with or
without a plugin prefix (`my-plugin:cs-code-reviewer`). These agents carry Bash to run builds,
tests, linters and audits, and they make no edits. For anyone else, including the main session,
the hook lets the call through. When a checked agent runs a write-shaped command, the hook exits
with code 2, which blocks the call, and says on stderr which agent ran what.

The command is split on `&&`, `||`, `;`, `|`, newlines and `$(…)`, and each part is checked, so
`git diff && rm x` is blocked. Quoted text is ignored, so `grep "a > b"` is not a redirect, but a
`$(…)` inside double quotes is still checked.

It sits beside `shared/protect-config`, which guards the Edit and Write tools for everyone. This
hook covers the other way a review agent could change files.

**Blocked for the review agents:**
- Redirects into a file (`>`, `>>`, `&>`); `/dev/null` and copies such as `2>&1` are allowed
- File commands: `rm`, `mv`, `cp`, `mkdir`, `touch`, `chmod`, `ln`, `tee`, `patch`, `dd`, `rsync`,
  `rimraf`, `wget`, `eval`, and `xargs` or `find -exec` / `-delete` running them
- The same commands started through a runner: `npx`, `pnpm dlx` / `exec`, `npm exec`,
  `yarn dlx`, `bun x`, `uvx`, and `uv` / `poetry` / `pipenv` / `pdm` / `hatch run`
- In-place edits (`sed -i`, `perl -i`) and inline code (`node -e`, `python -c`, `bash -c`,
  `sh -c`)
- git commands that change the repository or the working tree: `commit`, `push`, `add`,
  `checkout`, `restore`, `reset`, `stash`, `clean`, `apply`, `merge`, `rebase`, `pull`, and
  creating or deleting branches and tags. `diff`, `log`, `show`, `status` and `blame` stay allowed.
- Package changes: `npm` / `pnpm` / `yarn` installs, adds and removals, `npm audit fix`,
  `pip install`, `dotnet add` / `new` / `tool`, `ng add` / `generate`, `cargo add` / `install`
- Fixers and formatters that write: `--fix`, `--write`, `ruff format`, `black`, `dotnet format`
  without `--verify-no-changes`. Their check modes stay allowed.

**Not covered — use other controls for these:**
- Commands that write as a side effect of their job: `ng build`, `tsc` without `--noEmit`,
  `dotnet build`, test runners that write caches or snapshots
- Indirection: `npm run <script>`, `make`, shell scripts in the repository, and aliases. The hook
  sees only the command line, not what it starts.
- Obfuscated commands: variables, base64, `printf` piped into a shell, and nested quoting tricks
- Writes through MCP tools, and any agent outside the five review families
- Other providers: only Claude Code tells a hook which agent made the call, so this hook ships for
  Claude Code only
- Input the hook can't parse is let through. If `node` is not on the PATH the agent runs with,
  the hook can't start and the call goes through.

Install it at `project` scope to guard everyone who clones the repository; `local` scope guards
only you.
