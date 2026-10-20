const READ_ONLY = new Set(['ts-code-reviewer', 'code-reviewer', 'cli-auditor']);
let raw = '';
process.stdin.setEncoding('utf8');
process.stdin
  .on('data', chunk => (raw += chunk))
  .on('end', () => {
    let input;
    try {
      input = JSON.parse(raw);
    } catch {
      return;
    }
    const agent = String(input.agent_type ?? '')
      .split(':')
      .pop();
    const command = input.tool_input && input.tool_input.command;
    if (!READ_ONLY.has(agent) || typeof command !== 'string') return;
    const hit = writes(command);
    if (hit) {
      process.stderr.write(
        'sigil-hook: ' +
          agent +
          ' makes no edits; blocked "' +
          hit +
          '". ' +
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
    new RegExp(
      at +
        '(?:sudo\\s+)?(rm|rmdir|mv|cp|mkdir|touch|chmod|chown|ln|tee|truncate|dd|install|unlink)\\b',
    ),
    new RegExp(
      at +
        '(Remove-Item|Set-Content|Add-Content|Out-File|New-Item|Move-Item|Copy-Item|Rename-Item|Clear-Content)\\b',
      'i',
    ),
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
