// Feeds each shell line from the guarded agents' bodies (and their skills' references) to guard.js.
const fs = require('fs'),
  path = require('path'),
  { spawnSync } = require('child_process');
const guard = path.join(__dirname, 'guard.js');
const names = new Set(process.argv[2].split(' '));
const files = require('child_process')
  .execSync('git ls-files catalog', { encoding: 'utf8' })
  .split('\n')
  .filter(f => f.endsWith('.agent.md'));
let n = 0;
for (const f of files) {
  const text = fs.readFileSync(f, 'utf8');
  const name = (text.match(/^name: (\S+)/m) || [])[1];
  if (!names.has(name)) continue;
  const lines = [];
  for (const block of text.matchAll(/```(?:bash|sh|shell|powershell|pwsh)?\r?\n([\s\S]*?)```/g))
    lines.push(...block[1].split(/\r?\n/).filter(l => l.trim() && !l.trim().startsWith('#')));
  for (const m of text.matchAll(/`([^`\n]{4,})`/g))
    if (
      /^(npx|npm|git|dotnet|python|py|node|pip|uv|ruff|eslint|tsc|pytest|osv|semgrep|bandit|madge)\b/.test(
        m[1],
      )
    )
      lines.push(m[1]);
  for (const command of lines) {
    n++;
    const r = spawnSync(process.execPath, [guard], {
      input: JSON.stringify({ agent_type: 'ts-code-reviewer', tool_input: { command } }),
      encoding: 'utf8',
    });
    if (r.status !== 0)
      console.log(
        name + ': ' + command + '  <-- ' + r.stderr.trim().replace(/^.*blocked/, 'blocked'),
      );
  }
}
console.log(n + ' commands checked');
