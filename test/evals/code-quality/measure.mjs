// Measures one code-quality eval run and compares two arms. See README.md for the protocol.
//
//   node measure.mjs run <dir> --task T1 --arm current --run 1 [--out runs/b0.jsonl] [--sha X] [--model Y]
//   node measure.mjs compare <baseline.jsonl> <candidate.jsonl> [--arm-a X] [--arm-b Y]
//                            [--metric inflation|declarations|loc]
//
// `run` copies the task's hidden tests into <dir>/hidden-test/, runs them with Node, and records
// the hidden-test result, source lines, and inflation: files, value exports and option fields
// beyond the task's requested surface (surface.json), read with the TypeScript compiler API.
// It also records `typeErrors` (strict compile errors in src/) and `suppressions` (@ts-ignore,
// eslint-disable, .skip/.only and the like in src/ and test/).
// `compare` reports the registered task-level statistic first (README, Statistics): per-task means,
// an exact sign-flip test over them, and a sign test across tasks. The run-level sign test, which
// pairs runs by index, follows as a secondary figure.
/* global process, console */
import {
  appendFileSync,
  cpSync,
  existsSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, '..', '..', '..', 'package.json'));
const ts = require('typescript');
const { signTestP, signFlipP, taskMeans } = createRequire(import.meta.url)('./stats.cjs');
const surfaces = JSON.parse(readFileSync(join(here, 'surface.json'), 'utf8'));
const HELD_OUT = new Set(['T5', 'T6']);

function flag(args, name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
}

function sourceFiles(dir) {
  const src = join(dir, 'src');
  if (!existsSync(src)) return [];
  const walk = d =>
    readdirSync(d).flatMap(name => {
      const full = join(d, name);
      return statSync(full).isDirectory() ? walk(full) : [full];
    });
  return walk(src).filter(f => /\.(ts|mts|cts|tsx)$/.test(f) && !/\.test\.[cm]?tsx?$/.test(f));
}

/** Non-blank lines that are not only a comment. */
function countLoc(files) {
  let loc = 0;
  for (const file of files) {
    let inBlock = false;
    for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const line = raw.trim();
      if (inBlock) {
        if (line.includes('*/')) inBlock = false;
        continue;
      }
      if (line === '' || line.startsWith('//')) continue;
      if (line.startsWith('/*')) {
        if (!line.includes('*/')) inBlock = true;
        continue;
      }
      loc++;
    }
  }
  return loc;
}

export function hiddenTests(dir, task) {
  const target = join(dir, 'hidden-test');
  cpSync(join(here, 'fixture-hidden', task), target, { recursive: true });
  // Node 22's --test takes files, not a directory.
  const tests = readdirSync(target).map(name => `hidden-test/${name}`);
  const result = spawnSync(
    process.execPath,
    ['--experimental-transform-types', '--no-warnings', '--test', ...tests],
    {
      cwd: dir,
      encoding: 'utf8',
      timeout: 120_000,
    },
  );
  const out = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  const count = name => Number(new RegExp(`^# ${name} (\\d+)$`, 'm').exec(out)?.[1] ?? 0);
  // Leaf tests only: an indented "not ok" under a failing suite names the check itself.
  const failedTests = [...out.matchAll(/^\s*not ok \d+ - (.+)$/gm)].map(m => m[1].trim());
  return {
    pass: count('pass'),
    fail: count('fail'),
    failedTests,
    timedOut: result.error?.code === 'ETIMEDOUT',
  };
}

function surfaceReport(dir, task, files) {
  const surface = surfaces[task];
  const rel = f => relative(dir, f).replace(/\\/g, '/');
  const extraFiles = files.map(rel).filter(f => !surface.files.includes(f));
  const program = ts.createProgram(files, {
    allowImportingTsExtensions: true,
    noEmit: true,
    strict: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
  });
  const checker = program.getTypeChecker();
  const extraExports = [];
  const extraTypes = [];
  const exportsByFile = new Map();
  let declarations = 0;
  for (const file of files) {
    const source = program.getSourceFile(file);
    declarations += source ? countDeclarations(source) : 0;
    const moduleSymbol = source && checker.getSymbolAtLocation(source);
    const exported = moduleSymbol ? checker.getExportsOfModule(moduleSymbol) : [];
    exportsByFile.set(rel(file), exported);
    for (const symbol of exported) {
      const target =
        symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
      const isValue = (target.flags & ts.SymbolFlags.Value) !== 0;
      const allowed = (isValue ? surface.values : surface.types)[rel(file)] ?? [];
      if (!allowed.includes(symbol.name))
        (isValue ? extraExports : extraTypes).push(`${rel(file)}:${symbol.name}`);
    }
  }
  const extraOptions = [];
  for (const { file, fn, param, allowed } of surface.options) {
    const symbol = exportsByFile.get(file)?.find(s => s.name === fn);
    const declaration = symbol?.valueDeclaration ?? symbol?.declarations?.[0];
    if (!declaration) continue;
    const signature = checker.getSignaturesOfType(
      checker.getTypeOfSymbolAtLocation(symbol, declaration),
      ts.SignatureKind.Call,
    )[0];
    const parameter = signature?.getParameters()[param];
    if (!parameter) continue;
    const type = checker.getNonNullableType(
      checker.getTypeOfSymbolAtLocation(parameter, declaration),
    );
    for (const prop of checker.getPropertiesOfType(type)) {
      if (!allowed.includes(prop.name)) extraOptions.push(`${fn}.${prop.name}`);
    }
  }
  return {
    extraFiles,
    extraExports,
    extraTypes,
    extraOptions,
    declarations,
    typeErrors: typeErrors(program, files),
  };
}

// The fixture has no @types/node, so a missing Node module or global is the harness's gap, not the run's.
const MISSING_NODE_TYPES = new Set([2307, 2580, 2591, 2592, 2593]);

/** Strict-mode compile errors in the run's own source files. */
function typeErrors(program, files) {
  const own = new Set(files.map(f => resolve(f)));
  return ts
    .getPreEmitDiagnostics(program)
    .filter(d => d.file && own.has(resolve(d.file.fileName)) && !MISSING_NODE_TYPES.has(d.code))
    .length;
}

const SUPPRESSION =
  /@ts-(ignore|expect-error|nocheck)|eslint-disable|\b(it|test|describe)\.(skip|only|todo)\(|\{\s*(skip|only|todo)\s*:/g;

/** Markers that lower the bar (type or lint suppressions, skipped or focused tests) in src/ and test/. */
function suppressions(dir) {
  const walk = d =>
    existsSync(d)
      ? readdirSync(d).flatMap(name => {
          const full = join(d, name);
          return statSync(full).isDirectory() ? walk(full) : [full];
        })
      : [];
  return [...walk(join(dir, 'src')), ...walk(join(dir, 'test'))]
    .filter(f => /\.[cm]?tsx?$/.test(f))
    .reduce((n, f) => n + (readFileSync(f, 'utf8').match(SUPPRESSION)?.length ?? 0), 0);
}

/** Top-level declarations: functions, classes, interfaces, type aliases, enums, and variables. */
function countDeclarations(source) {
  let count = 0;
  for (const statement of source.statements) {
    if (ts.isVariableStatement(statement)) count += statement.declarationList.declarations.length;
    else if (
      ts.isFunctionDeclaration(statement) ||
      ts.isClassDeclaration(statement) ||
      ts.isInterfaceDeclaration(statement) ||
      ts.isTypeAliasDeclaration(statement) ||
      ts.isEnumDeclaration(statement)
    )
      count++;
  }
  return count;
}

function run(args) {
  const dir = resolve(args[0]);
  const task = flag(args, 'task');
  if (!surfaces[task]) throw new Error(`unknown task ${task}`);
  const files = sourceFiles(dir);
  const tests = hiddenTests(dir, task);
  const surface = surfaceReport(dir, task, files);
  const record = {
    date: new Date().toISOString().slice(0, 10),
    task,
    arm: flag(args, 'arm', 'unknown'),
    run: Number(flag(args, 'run', 1)),
    sha: flag(args, 'sha', null),
    model: flag(args, 'model', null),
    ...tests,
    testsOk: tests.fail === 0 && tests.pass > 0,
    loc: countLoc(files),
    suppressions: suppressions(dir),
    ...surface,
    inflation:
      surface.extraFiles.length + surface.extraExports.length + surface.extraOptions.length,
  };
  const out = flag(args, 'out');
  if (out) appendFileSync(out, `${JSON.stringify(record)}\n`);
  console.log(JSON.stringify(record));
}

function readRuns(file, arm) {
  return readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map(line => JSON.parse(line))
    .filter(r => !arm || r.arm === arm);
}

function compare(args) {
  const a = readRuns(args[0], flag(args, 'arm-a'));
  const b = readRuns(args[1], flag(args, 'arm-b'));
  // Lower is better for every metric: inflation (surface), declarations (fragmentation), loc.
  const metric = flag(args, 'metric', 'inflation');
  const key = r => `${r.task}#${r.run}`;
  const byKey = new Map(a.map(r => [key(r), r]));
  const tally = {
    wins: 0,
    losses: 0,
    ties: 0,
    testsA: 0,
    testsB: 0,
    heldOutTestsA: 0,
    heldOutTestsB: 0,
    pairs: 0,
  };
  const rows = [];
  for (const rb of b) {
    const ra = byKey.get(key(rb));
    if (!ra) continue;
    tally.pairs++;
    if (rb[metric] < ra[metric]) tally.wins++;
    else if (rb[metric] > ra[metric]) tally.losses++;
    else tally.ties++;
    tally.testsA += ra.testsOk ? 1 : 0;
    tally.testsB += rb.testsOk ? 1 : 0;
    if (HELD_OUT.has(rb.task)) {
      tally.heldOutTestsA += ra.testsOk ? 1 : 0;
      tally.heldOutTestsB += rb.testsOk ? 1 : 0;
    }
    rows.push(
      `${key(rb).padEnd(6)} inflation ${ra.inflation} -> ${rb.inflation}  declarations ${ra.declarations ?? '?'} -> ${rb.declarations ?? '?'}  loc ${ra.loc} -> ${rb.loc}  tests ${ra.testsOk ? 'ok' : 'FAIL'} -> ${rb.testsOk ? 'ok' : 'FAIL'}`,
    );
  }
  const decided = tally.wins + tally.losses;
  console.log(rows.sort().join('\n'));
  console.log(`\n${taskLevel(a, b, metric)}`);
  console.log(
    `\nrun level (secondary; pairs runs by index): pairs ${tally.pairs}: candidate lower ${metric} ${tally.wins}, higher ${tally.losses}, ties ${tally.ties}` +
      `\none-sided sign test p = ${decided ? signTestP(tally.wins, decided).toPrecision(3) : 'n/a'} over ${decided} decided pairs` +
      `\nhidden tests ok: baseline ${tally.testsA}/${tally.pairs}, candidate ${tally.testsB}/${tally.pairs}` +
      ` (held out: ${tally.heldOutTestsA} -> ${tally.heldOutTestsB})`,
  );
}

/**
 * The registered primary statistic: each task counts once, by its mean over runs. The sign-flip
 * test keeps magnitude; the sign test across tasks is the coarser check dotnet/skills uses.
 */
function taskLevel(a, b, metric) {
  const meansA = taskMeans(a, metric);
  const meansB = taskMeans(b, metric);
  const tasks = [...meansB.keys()].filter(t => meansA.has(t)).sort();
  const diffs = tasks.map(t => meansA.get(t) - meansB.get(t));
  const lower = diffs.filter(d => d > 0).length;
  const higher = diffs.filter(d => d < 0).length;
  const totalA = tasks.reduce((s, t) => s + meansA.get(t), 0);
  const totalB = tasks.reduce((s, t) => s + meansB.get(t), 0);
  const change = totalA ? `${(((totalB - totalA) / totalA) * 100).toFixed(1)}%` : 'n/a';
  return [
    ...tasks.map(
      t =>
        `${t.padEnd(4)} mean ${metric} ${meansA.get(t).toFixed(2)} -> ${meansB.get(t).toFixed(2)}`,
    ),
    `task level (primary): ${tasks.length} tasks, candidate lower in ${lower}, higher in ${higher}` +
      `, total ${totalA.toFixed(2)} -> ${totalB.toFixed(2)} (${change})`,
    `exact sign-flip p = ${signFlipP(diffs).toPrecision(3)}` +
      `; sign test across tasks p = ${lower + higher ? signTestP(lower, lower + higher).toPrecision(3) : 'n/a'}`,
  ].join('\n');
}

// Run as a script, not when selftest.mjs imports hiddenTests. Compare real paths: on Windows argv[1]
// can be an 8.3 short path while import.meta.url is the long one.
const invoked = process.argv[1] && realpathSync(process.argv[1]);
if (invoked === realpathSync(fileURLToPath(import.meta.url))) {
  const [command, ...rest] = process.argv.slice(2);
  if (command === 'run') run(rest);
  else if (command === 'compare') compare(rest);
  else {
    console.error(
      'usage: node measure.mjs run <dir> --task Tn [...] | compare <a.jsonl> <b.jsonl>',
    );
    process.exit(2);
  }
}
