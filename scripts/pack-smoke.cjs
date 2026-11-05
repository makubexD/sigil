#!/usr/bin/env node
/**
 * Packs the package exactly as npm would publish it, installs the tarball into a scratch folder,
 * and runs the installed CLI against an empty project.
 *
 * Why this exists: nothing else proves the CLI works from an installed tarball. The local build
 * can pass every test while `files` omits something the CLI reads at run time (`catalog/`,
 * `packs.yaml`) or the package ships files that should stay on GitHub (audits, decisions, ideas,
 * plans, tests). This check is the only gate that reads a real `npm pack` file list and then
 * exercises `PKG_ROOT` from `node_modules`.
 *
 * `npm pack` runs with `--ignore-scripts`: `prepack` would run `npm run build`, whose clean step
 * deletes `test-compiled/` in the middle of `ci:local`. Run `npm run build` before this script.
 *
 * Usage: node scripts/pack-smoke.cjs
 * Exit 0 when every check passes, 1 when one fails (named in the `pack-smoke: FAILED` line).
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

// Resolve from the script location (scripts/), not the caller's cwd, so the check works from
// any working directory.
const REPO_ROOT = path.resolve(__dirname, '..');
const PKG = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
const IS_WINDOWS = process.platform === 'win32';
const NPM = IS_WINDOWS ? 'npm.cmd' : 'npm';

// Files the installed CLI needs at run time.
const REQUIRED = ['dist-cli/cli.js', 'catalog/', 'packs.yaml'];

// Paths that must stay out of the tarball; they live on GitHub only.
const FORBIDDEN_PREFIXES = [
  'docs/audits/',
  'docs/decisions/',
  'docs/ideas/',
  'docs/plan-',
  'test-compiled/',
  'dist/',
];

/** A failed named check; `main` turns it into the `pack-smoke: FAILED` line. */
class CheckFailure extends Error {
  constructor(name, detail) {
    super(detail);
    this.checkName = name;
  }
}

/** Throws a named check failure. */
function fail(name, detail) {
  throw new CheckFailure(name, detail);
}

/** Runs a command and returns `spawnSync`'s result, never throwing on a non-zero exit. */
function run(command, args, options = {}) {
  return spawnSync(command, args, {
    encoding: 'utf8',
    windowsHide: true,
    ...options,
    // A `.cmd` shim can only be launched through a shell on Windows.
    shell: IS_WINDOWS,
  });
}

/** Adds `✓ <name>` when a check passes. */
function pass(name) {
  console.log(`✓ ${name}`);
}

/** Recursively lists every file path under `dir`. */
function listFiles(dir) {
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...listFiles(full));
    } else {
      found.push(full);
    }
  }
  return found;
}

/**
 * Normalizes `npm pack --json` output into one pack entry. npm prints an array on some versions
 * and an object keyed by package name on others, so accept both, plus a bare entry.
 */
function packEntry(parsed) {
  if (Array.isArray(parsed)) return parsed[0];
  if (parsed && Array.isArray(parsed.files)) return parsed;
  const entries = parsed && typeof parsed === 'object' ? Object.values(parsed) : [];
  return entries.find(entry => entry && Array.isArray(entry.files));
}

function main() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sigil-pack-'));
  try {
    // a. Pack the tarball into the scratch folder.
    const pack = run(NPM, ['pack', '--ignore-scripts', '--json', '--pack-destination', temp], {
      cwd: REPO_ROOT,
    });
    if (pack.error) fail('npm pack', `could not start npm: ${pack.error.message}`);
    if (pack.status !== 0) fail('npm pack', pack.stderr.trim() || `exit ${pack.status}`);

    let parsed;
    try {
      parsed = JSON.parse(pack.stdout);
    } catch (err) {
      fail('npm pack', `unreadable --json output: ${err.message}`);
    }
    const entry = packEntry(parsed);
    if (!entry || !entry.filename) fail('npm pack', 'no tarball entry in --json output');
    const tarball = path.join(temp, entry.filename);
    if (!fs.existsSync(tarball)) fail('npm pack', `tarball not found at ${tarball}`);
    pass('npm pack');

    // b. File list checks, one named check per rule.
    const files = (entry.files || []).map(file => file.path);
    for (const required of REQUIRED) {
      const name = `tarball includes ${required}`;
      const present = required.endsWith('/')
        ? files.some(file => file.startsWith(required))
        : files.includes(required);
      if (!present)
        fail(
          name,
          `no path ${required.endsWith('/') ? `under ${required}` : `equals ${required}`}`,
        );
      pass(name);
    }
    for (const prefix of FORBIDDEN_PREFIXES) {
      const name = `tarball excludes ${prefix}`;
      const found = files.find(file => file.startsWith(prefix));
      if (found) fail(name, `found ${found}`);
      pass(name);
    }

    // c. Install the tarball into a scratch prefix.
    const installRoot = path.join(temp, 'install');
    const install = run(NPM, [
      'install',
      '--prefix',
      installRoot,
      '--no-audit',
      '--no-fund',
      tarball,
    ]);
    if (install.error) fail('npm install tarball', `could not start npm: ${install.error.message}`);
    if (install.status !== 0)
      fail('npm install tarball', install.stderr.trim() || `exit ${install.status}`);
    pass('npm install tarball');

    const bin = path.join(installRoot, 'node_modules', '.bin', IS_WINDOWS ? 'sigil.cmd' : 'sigil');
    if (!fs.existsSync(bin)) fail('installed sigil bin exists', `no binary at ${bin}`);

    // d. The installed bin prints the package version.
    const version = run(bin, ['--version']);
    if (version.error)
      fail('installed sigil --version', `could not start sigil: ${version.error.message}`);
    if (version.status !== 0)
      fail('installed sigil --version', version.stderr.trim() || `exit ${version.status}`);
    const printed = version.stdout.trim();
    if (printed !== PKG.version)
      fail('installed sigil --version', `printed ${printed}, expected ${PKG.version}`);
    pass('installed sigil --version');

    // e. `add` writes into the project, not into the install.
    const project = path.join(temp, 'project');
    fs.mkdirSync(project, { recursive: true });
    const add = run(bin, ['add', 'prompt:shared/explain-diff', '--target', 'claude', '--yes'], {
      cwd: project,
    });
    if (add.error) fail('installed sigil add', `could not start sigil: ${add.error.message}`);
    if (add.status !== 0) fail('installed sigil add', add.stderr.trim() || `exit ${add.status}`);
    const written = listFiles(project).find(file => file.includes('explain-diff'));
    if (!written) fail('installed sigil add', `no explain-diff file under ${project}`);
    pass('installed sigil add');
  } catch (err) {
    if (err instanceof CheckFailure) {
      console.error(`pack-smoke: FAILED ${err.checkName}`);
      if (err.message) console.error(err.message);
      process.exitCode = 1;
      return;
    }
    throw err;
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

main();
