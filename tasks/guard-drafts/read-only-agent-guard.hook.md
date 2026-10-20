---
id: shared/read-only-agent-guard
kind: hook
title: 'Read-only Agent Guard'
description: >-
  Blocks Bash commands that edit files, change git state or install packages when a catalog
  reviewer, auditor or profiler runs them. Those agents have Bash for read-only checks only;
  other agents and the main session are not affected.
event: PreToolUse
matcher: 'Bash'
command: node
args:
  - '-e'
  - |-
    const READ_ONLY = new Set([
      'code-reviewer',
      'cs-api-compat-reviewer', 'cs-architecture-reviewer', 'cs-code-reviewer',
      'cs-performance-profiler', 'cs-security-auditor',
      'ng-api-compat-reviewer', 'ng-architecture-reviewer', 'ng-code-reviewer',
      'ng-performance-profiler', 'ng-security-auditor', 'ng-template-reviewer',
      'py-api-compat-reviewer', 'py-architecture-reviewer', 'py-code-reviewer',
      'py-performance-profiler', 'py-security-auditor',
      'react-api-compat-reviewer', 'react-architecture-reviewer', 'react-code-reviewer',
      'react-performance-profiler', 'react-security-auditor',
      'ts-api-compat-reviewer', 'ts-architecture-reviewer', 'ts-code-reviewer',
      'ts-performance-profiler', 'ts-security-auditor',
    ]);
    let raw = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => (raw += chunk)).on('end', () => {
      let input;
      try { input = JSON.parse(raw); } catch { return; }
      const agent = String(input.agent_type ?? '').split(':').pop();
      const command = input.tool_input && input.tool_input.command;
      if (!READ_ONLY.has(agent) || typeof command !== 'string') return;
      const hit = writes(command);
      if (hit) {
        process.stderr.write(
          'sigil-hook: ' + agent + ' makes no edits; blocked "' + hit + '". ' +
            'Report the change instead of making it.\n',
        );
        process.exitCode = 2;
      }
    });
    function writes(original) {
      // Quoted text and arithmetic are data, not shell syntax: a ">" there redirects nothing.
      const command = original
        .replace(/'[^']*'|"(?:\\.|[^"\\])*"/g, '""')
        .replace(/\$\(\([^)]*\)\)/g, '0');
      const at = '(?:^|[;&|(`]\\s*|\\$\\(\\s*)';
      const rules = [
        /(?:^|[^0-9&>])>{1,2}(?!\s*&)(?!\s*(?:\/dev\/null|\$null|nul)\b)\s*[^\s>&|;]/i,
        new RegExp(at + '(?:sudo\\s+)?(rm|rmdir|mv|cp|mkdir|touch|chmod|chown|ln|tee|truncate|dd|install|unlink)\\b'),
        new RegExp(at + '(Remove-Item|Set-Content|Add-Content|Out-File|New-Item|Move-Item|Copy-Item|Rename-Item|Clear-Content)\\b', 'i'),
        /\bsed\b[^|;&]*\s-[a-zA-Z]*i/,
        /\bperl\b[^|;&]*\s-[a-zA-Z]*i/,
        /\bgit\s+(?:(?:add|commit|push|pull|checkout|switch|reset|restore|rebase|merge|cherry-pick|revert|am|rm|mv|clean|init|clone)(?![\w-])|stash(?=\s*$|\s*[;&|)]|\s+-|\s+(?:push|pop|apply|drop|clear|save|store|branch|create)\b)|apply(?![\w-])(?![^|;&]*--(?:check|stat|numstat|summary)\b)|tag\s+(?!-l\b|--list\b|-n\d*\b|-v\b|--verify\b|--contains\b|--no-contains\b|--points-at\b|--merged\b|--no-merged\b|--sort\b|--format\b)\S|worktree\s+(?:add|remove|move|prune|lock|unlock|repair)\b|remote\s+(?:add|remove|rm|rename|set-url|set-head|set-branches|prune)\b|branch\s+-[dDmMcC]|config\s+(?!--get|-l\b|--list)\S)/,
        /\b(npm|pnpm|yarn|bun)\s+(i|install|ci|add|remove|rm|uninstall|update|up|upgrade|publish|version|link|unlink|dedupe|prune|init|create)\b/,
        /\bnpm\s+audit\s+fix\b/,
        /\b(pip3?|uv\s+pip|poetry|pipenv)\s+(install|uninstall|add|remove|update|lock)\b/,
        /\bdotnet\s+(add|remove|new|publish|format(?![^|;&]*--verify-no-changes)|tool\s+(install|update|uninstall)|nuget\s+push)\b/,
        /\s--(fix|write)\b/,
        /\bprettier\b[^|;&]*\s-w\b/,
        /\b(black|isort)\b(?![^|;&]*--check)/,
        /\bruff\s+format\b(?![^|;&]*--check)/,
        /\b(node|python3?|py|deno|bun|ruby|perl|pwsh|powershell)\s+(-e|--eval|-c|-p|-Command)\b/i,
      ];
      for (const rule of rules) {
        const m = command.match(rule);
        if (m) return m[0].trim();
      }
      return undefined;
    }
tags: [safety, reviewer, shared]
---

Fires before every Bash call. Claude Code passes the call as JSON on stdin, and inside a subagent
the input names the agent in `agent_type` (a plugin agent arrives as `plugin:name`; the prefix is
ignored). When that agent is one of the catalog's reviewers, auditors or profilers, the hook checks
the command and exits with code 2, which Claude Code treats as a block, saying why on stderr. The
agent sees the message and reports the change instead.

Those agents get `Read`, `Grep`, `Glob` and `Bash` and no edit tools; their instructions say Bash
is for read-only commands. Without this hook that is only an instruction.

It runs in exec form (`command: node` with `args`), so no shell sits between Claude Code and the
exit code (see `shared/protect-config` for why that matters on Windows).

**Blocked**, for those agents only:

- output redirection to a file (`>`, `>>`; `2>&1` and `/dev/null` stay allowed)
- `rm`, `mv`, `cp`, `mkdir`, `touch`, `chmod`, `ln`, `tee` and similar, and the PowerShell
  cmdlets that write or remove items
- in-place edits: `sed -i`, `perl -i`, `--fix`, `--write`, `prettier -w`, `black`, `isort` and
  `ruff format` without `--check`, `dotnet format` without `--verify-no-changes`
- git commands that change the working tree, the index, refs or config (`git status`, `diff`,
  `log`, `show`, `stash list`, `tag -l` stay allowed)
- package installs and removals (npm, pnpm, yarn, bun, pip, uv, poetry, dotnet)
- inline interpreters (`node -e`, `python -c`, …), which can write anything

**Not covered — this is a denylist, not a sandbox:**

- a script file or tool that writes on its own (`npm run <script>`, a test runner's snapshot
  update, a profiler's output file)
- the main session and any agent not named above, including `cli-auditor` and `wizard-auditor`,
  whose briefs run the program under audit in a temporary directory
- agents from sigil's Claude Code plugin, unless this hook is also installed with `sigil add`;
  the plugin carries no hooks
- a missing `node`, or input it can't parse: the hook then lets the call through

Use the sandbox or `permissions.deny` rules where a hard boundary is required.
