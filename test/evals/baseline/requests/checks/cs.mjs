// Runs a hidden C# grader against the project a run left behind (README, Grading).
//
//   node cs.mjs <set> <case>     (cwd: the project)
//
// A case is named `<group>-<what>`. The group's cases (cs/<set>/<group>.cs) are compiled with
// cs/Common.cs against the project, in a temp folder outside it, once per project and group; then the
// case runs with the project as its working directory. A project that does not compile fails every
// case. A few cases read the source and compile nothing (STATIC below). Needs `dotnet` on PATH.
/* global process, console */
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const [set, name] = process.argv.slice(2);
const here = join(dirname(fileURLToPath(import.meta.url)), 'cs');
const project = process.cwd();

const SKIP = new Set(['bin', 'obj', '.git', '.claude', '.github', '.sigil', 'node_modules']);
const sources = (dir = project) =>
  readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    if (SKIP.has(entry.name)) return [];
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return entry.name.endsWith('.cs') ? [path] : [];
  });
/** The project's C# with comments removed, so naming the unsafe call in a comment does not count. */
const code = file =>
  sources()
    .filter(path => !file || basename(path) === file)
    .map(path => readFileSync(path, 'utf8'))
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
const fail = why => {
  console.log(`${name}: ${why}`);
  process.exit(1);
};

const STATIC = {
  'invite-not-system-random'() {
    if (/\bnew\s+Random\b|\bRandom\.Shared\b/.test(code())) fail('codes come from System.Random');
  },
  'invite-constant-time'() {
    if (!/\bFixedTimeEquals\b/.test(code())) fail('codes are not compared in constant time');
  },
  'profiles-configure-await'() {
    const text = code('Profiles.cs');
    const awaits = (text.match(/\bawait\b/g) ?? []).length;
    const configured = (text.match(/\.ConfigureAwait\(\s*false\s*\)/g) ?? []).length;
    if (awaits === 0) fail('Profiles.cs awaits nothing');
    if (configured < awaits) fail(`${configured} of ${awaits} awaits use ConfigureAwait(false)`);
  },
};

if (Object.hasOwn(STATIC, name)) {
  STATIC[name]();
  process.exit(0);
}

const group = name.split('-')[0];
const caseFile = join(here, set, `${group}.cs`);
const runProject = readdirSync(project).find(file => file.endsWith('.csproj'));
if (!existsSync(caseFile)) fail(`no cases for ${set}/${group}`);
if (!runProject) fail('the project has no .csproj at its root');

const work = join(tmpdir(), 'sigil-baseline-graders', `${basename(project)}-${set}-${group}`);
const dll = join(work, 'out', 'Grader.dll');
if (!existsSync(dll)) {
  mkdirSync(work, { recursive: true });
  for (const file of ['Grader.csproj', 'Common.cs']) cpSync(join(here, file), join(work, file));
  cpSync(caseFile, join(work, 'Cases.cs'));
  const build = spawnSync(
    'dotnet',
    [
      'build',
      join(work, 'Grader.csproj'),
      '-c',
      'Release',
      '-nologo',
      '-v',
      'q',
      `-p:RunProject=${join(project, runProject)}`,
      `-p:CaseFile=${join(work, 'Cases.cs')}`,
      '-o',
      join(work, 'out'),
    ],
    { encoding: 'utf8', timeout: 180_000 },
  );
  if (build.status !== 0 || !existsSync(dll)) {
    const errors = `${build.stdout ?? ''}${build.stderr ?? ''}`
      .split('\n')
      .filter(line => /error/i.test(line))
      .slice(0, 3)
      .join('\n');
    fail(`does not compile\n${errors}`);
  }
}
const run = spawnSync('dotnet', [dll, name], { cwd: project, stdio: 'inherit', timeout: 60_000 });
process.exit(run.status ?? 1);
