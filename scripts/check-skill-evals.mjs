// Mechanical checks for a skill that has evals under test/evals/<skill>/: no harness tool names in
// the shipped text, size bar, resolvable relative links, and coverage.md rows.
// Reads the catalog as a skill ships: SKILL.md, references/*.md, and each language's stack part as
// references/stack-<stack>.md (stackPartsBySkill). A coverage file `rule:<id>` or `agent:<id>`
// reads that artifact's resolved body (a bare id means `shared/<id>`). A folder with no catalog
// skill is valid when every coverage row names a rule or agent: it evaluates delivered doctrine,
// so only its coverage rows are checked. Needs a current dist-cli/ (npm run build).
// Usage: node scripts/check-skill-evals.mjs [skill...]   (default: every folder under test/evals)
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const catalog = join(repo, 'catalog');
const evalsDir = join(repo, 'test', 'evals');
const { loadLanguages, loadCatalog } = require(join(repo, 'dist-cli', 'load.js'));
const { resolveCatalog } = require(join(repo, 'dist-cli', 'resolve.js'));
const { stackPartsBySkill } = require(join(repo, 'dist-cli', 'load-references.js'));
const { parts } = stackPartsBySkill(catalog, loadLanguages(catalog));
const resolved = resolveCatalog(await loadCatalog(catalog));
const ARTIFACT_REF = /^(rule|agent):(.+)$/;
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

/** coverage.md rows: | item | shipped file, rule:<id> or agent:<id> | phrase that must appear | */
function coverageRows(skill) {
  const table = join(evalsDir, skill, 'coverage.md');
  if (!existsSync(table)) return undefined;
  return readFileSync(table, 'utf8')
    .split(/\r?\n/)
    .map(line => line.split('|').map(c => c.trim()))
    .filter(cells => cells.length >= 5 && cells[2] && cells[2] !== 'file' && !/^-+$/.test(cells[2]))
    .map(cells => ({ item: cells[1], file: cells[2], phrase: cells[3] }));
}

/** The text a coverage row is checked against, or undefined when it does not exist. */
function coverageText(file, files) {
  const ref = ARTIFACT_REF.exec(file);
  if (!ref) {
    const path = files.get(file);
    return path && existsSync(path) ? readFileSync(path, 'utf8') : undefined;
  }
  const id = ref[2].includes('/') ? ref[2] : `shared/${ref[2]}`;
  const artifact = resolved.byId.get(id);
  if (artifact?.kind !== ref[1]) return undefined;
  // Adapters render the title as the delivered file's H1, so it is shipped text too.
  return `# ${artifact.frontmatter.title ?? ''}\n${artifact.resolvedBody ?? artifact.body}`;
}

function checkCoverage(skill, rows, files, fail) {
  for (const { item, file, phrase } of rows) {
    const text = coverageText(file, files);
    if (text === undefined) {
      fail(`coverage: ${item} -> missing file ${file}`);
      continue;
    }
    const wanted = phrase.replace(/^`|`$/g, '').toLowerCase();
    if (!text.replace(/\s+/g, ' ').toLowerCase().includes(wanted))
      fail(`coverage: ${item} -> "${wanted}" not in ${file}`);
  }
}

function check(skill) {
  const failures = [];
  const fail = msg => failures.push(msg);
  const files = shippedFiles(skill);
  const rows = coverageRows(skill);
  if (!existsSync(files.get('SKILL.md'))) {
    const doctrineOnly = rows?.length && rows.every(row => ARTIFACT_REF.test(row.file));
    if (!doctrineOnly) return [`no catalog skill '${skill}'`];
    checkCoverage(skill, rows, files, fail);
    return failures;
  }
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
  if (!rows) return [...failures, 'coverage.md missing'];
  checkCoverage(skill, rows, files, fail);
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
