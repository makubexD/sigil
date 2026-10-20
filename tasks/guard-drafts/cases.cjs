// Runs guard.js against block/allow cases as a reviewer subagent would call it.
const { spawnSync } = require('child_process');
const path = require('path');
const guard = path.join(__dirname, 'guard.js');
const block = [
  'echo x > src/a.ts',
  'cat a >> b',
  'rm -rf dist',
  'git stash',
  'git stash push -m x',
  'git stash -u',
  'git stash pop',
  'git commit -m "x"',
  'git tag v1.0',
  'git tag -d v1',
  'git worktree add ../x',
  'git remote add o url',
  'git apply p.diff',
  'git branch -D x',
  'git config user.name x',
  'npm install lodash',
  'npm audit fix',
  'sed -i s/a/b/ f',
  'eslint --fix .',
  'prettier -w .',
  'black .',
  'ruff format .',
  'node -e "1"',
  'python -c "1"',
  'dotnet format',
  'Remove-Item x',
  'ls; touch f',
  'x=$(mkdir d)',
  'pip install x',
  'dotnet add package X',
];
const allow = [
  'git stash list',
  'git stash list --help',
  'git stash show -p',
  'git tag',
  'git tag -l',
  'git tag --contains HEAD',
  'git worktree list',
  'git remote -v',
  'git apply --check p.diff',
  'git status',
  'git diff HEAD~1',
  'git log --oneline | head',
  'git branch',
  'git branch -a',
  'git config --get user.name',
  'npm test 2>&1',
  'npm run lint',
  'npx tsc --noEmit',
  'cat f > /dev/null',
  'grep -rn "a > b" src',
  'echo $((1 > 0))',
  'dotnet format --verify-no-changes',
  'black --check .',
  'ruff format --check .',
  'eslint .',
  'npm ls',
  'pip list',
  'node --version',
  'ls 2>&1 | head',
];
let problems = 0;
function run(command, agent = 'ts-code-reviewer') {
  const input = JSON.stringify({ agent_type: agent, tool_name: 'Bash', tool_input: { command } });
  return spawnSync(process.execPath, [guard], { input, encoding: 'utf8' }).status;
}
for (const c of block)
  if (run(c) !== 2) {
    problems++;
    console.log('MISSED', c);
  }
for (const c of allow)
  if (run(c) !== 0) {
    problems++;
    console.log('FALSE BLOCK', c);
  }
if (run('rm -rf x', 'ts-refactor-specialist') !== 0) {
  problems++;
  console.log('BLOCKED a writer agent');
}
if (run('rm -rf x', '') !== 0) {
  problems++;
  console.log('BLOCKED the main session');
}
if (run('rm -rf x', 'sigil:code-reviewer') !== 2) {
  problems++;
  console.log('MISSED plugin prefix');
}
console.log(problems ? `${problems} problem(s)` : 'all cases pass');
