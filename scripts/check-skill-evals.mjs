// Mechanical checks for a skill that has evals under test/evals/<skill>/: no harness tool names in
// the shipped text, size bar, resolvable relative links, and coverage.md rows.
// Reads the catalog as a skill ships: SKILL.md, references/*.md, and each language's stack part as
// references/stack-<stack>.md (stackPartsBySkill). A coverage file `rule:<id>` reads
// catalog/shared/rules/<id>.rule.md. Needs a current dist-cli/ (npm run build).
// Usage: node scripts/check-skill-evals.mjs [skill...]   (default: every folder under test/evals)
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const catalog = join(repo, 'catalog');
const evalsDir = join(repo, 'test', 'evals');
const { loadLanguages } = require(join(repo, 'dist-cli', 'load.js'));
const { stackPartsBySkill } = require(join(repo, 'dist-cli', 'load-references.js'));
const { parts } = stackPartsBySkill(catalog, loadLanguages(catalog));
const TOOL_NAMES =
  /\b(AskUserQuestion|TodoWrite|ExitPlanMode|EnterPlanMode|WebFetch|WebSearch|subagent_type|Agent tool|Task tool|Bash tool|Read tool|Edit tool|Write tool|Grep tool|Glob tool|Claude Code|CLAUDE\.md|copilot-instructions|runSubagent)\b/;

/** The skill as it ships: shipped name (relative to the skill) → source file. */
function shippedFiles(skill) {
  const dir = join(catalog, 'shared', 'skills', skill);
  const files = new Map([['SKILL.md', join(dir, 'SKILL.md')]]);
  const refs = join(dir, 'references');
  if (existsSync(refs)) {
    for (const entry of readdirSync(refs)) {
      if (entry.endsWith('.md') && statSync(join(refs, entry)).isFile())
        files.set(`references/${entry}`, join(refs, entry));
    }
  }
  for (const part of parts.get(skill) ?? []) files.set(`references/${part.name}`, part.file);
  return files;
}

function check(skill) {
  const failures = [];
  const fail = msg => failures.push(msg);
  const files = shippedFiles(skill);
  if (!existsSync(files.get('SKILL.md'))) return [`no catalog skill '${skill}'`];
  for (const [name, file] of files) {
    const text = readFileSync(file, 'utf8');
    const lines = text.split(/\r?\n/);
    lines.forEach((line, i) => {
      const hit = TOOL_NAMES.exec(line);
      if (hit) fail(`${name}:${i + 1} names a harness tool: ${hit[0]}`);
    });
    const cap = name === 'SKILL.md' ? 200 : 220;
    if (lines.length > cap) fail(`${name} has ${lines.length} lines (cap ${cap})`);
    // Links resolve against the shipped layout, not the source folder (stack parts move).
    for (const [, target] of text
      .replace(/```[\s\S]*?```/g, '')
      .matchAll(/\]\(([^)\s#]+)(?:#[^)]*)?\)/g)) {
      if (/^[a-z]+:/i.test(target)) continue;
      const shipped = relative('.', join(dirname(name), target)).replace(/\\/g, '/');
      if (!files.has(shipped)) fail(`${name} links missing ${target}`);
    }
  }
  // coverage.md rows: | item | shipped file or rule:<id> | phrase that must appear |
  const table = join(evalsDir, skill, 'coverage.md');
  if (!existsSync(table)) return [...failures, 'coverage.md missing'];
  for (const line of readFileSync(table, 'utf8').split(/\r?\n/)) {
    const cells = line.split('|').map(c => c.trim());
    if (cells.length < 5 || !cells[2] || cells[2] === 'file' || /^-+$/.test(cells[2])) continue;
    const rule = /^rule:(.+)$/.exec(cells[2]);
    const path = rule
      ? join(catalog, 'shared', 'rules', `${rule[1]}.rule.md`)
      : files.get(cells[2]);
    if (!path || !existsSync(path)) {
      fail(`coverage: ${cells[1]} -> missing file ${cells[2]}`);
      continue;
    }
    const phrase = cells[3].replace(/^`|`$/g, '').toLowerCase();
    if (!readFileSync(path, 'utf8').toLowerCase().includes(phrase))
      fail(`coverage: ${cells[1]} -> "${phrase}" not in ${cells[2]}`);
  }
  return failures;
}

const skills = process.argv.slice(2).length
  ? process.argv.slice(2)
  : readdirSync(evalsDir).filter(e => statSync(join(evalsDir, e)).isDirectory());
let total = 0;
for (const skill of skills) {
  const failures = check(skill);
  total += failures.length;
  for (const f of failures) console.log(`FAIL ${skill}: ${f}`);
  if (failures.length === 0) console.log(`OK: ${skill}`);
}
process.exit(total === 0 ? 0 : 1);
