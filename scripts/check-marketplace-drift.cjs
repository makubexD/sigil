#!/usr/bin/env node
/**
 * Proves a published branch tree equals a fresh build of one target.
 *
 * Why this exists: the release workflow publishes a fresh `claude/` build to the `marketplace`
 * branch, and users add that branch as a Claude Code marketplace; it also publishes the
 * `agents-standard` build (minus the root `AGENTS.md`) to the `skills` branch for `npx skills add`.
 * If a branch drifts from the build of its tag — a hand edit, a partial publish, a job that
 * half-ran — users would install something that is not the release. This check builds the current
 * tree into a temp dir and compares it byte-for-byte with the published one, so CI fails on any
 * difference.
 *
 * Usage: node scripts/check-marketplace-drift.cjs [--target <name>] <published-dir>
 *
 * Targets:
 *   claude           (default) the `marketplace` branch: the whole `claude/` build
 *   agents-standard  the `skills` branch: the `agents-standard/` build minus its root `AGENTS.md`
 *
 * `--target` may come before or after the published dir. Exit 0 when equal, 1 on drift, 2 on a
 * usage or build error.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

// Resolve from the script location (scripts/), not the caller's cwd, so the check works from
// any working directory.
const REPO_ROOT = path.resolve(__dirname, '..');
const CLI = path.join(REPO_ROOT, 'dist-cli', 'cli.js');

// The publish step checks out the branch, so `.git/` sits at the published root and is not part of
// the build. Nothing else in the published dir is exempt.
const IGNORED_TOP_LEVEL = new Set(['.git']);

// One row per published branch: the name builders use for the target, the build's output folder,
// the label the messages use, and the entries a published tree intentionally leaves out of the
// fresh build (`skills` installs skills, so the repo-wide `AGENTS.md` stays behind).
const TARGETS = {
  claude: { label: 'marketplace', buildDir: 'claude', omitTopLevel: [] },
  'agents-standard': {
    label: 'skills branch',
    buildDir: 'agents-standard',
    omitTopLevel: ['AGENTS.md'],
  },
};
const DEFAULT_TARGET = 'claude';

function printUsage() {
  console.error(
    'Usage: node scripts/check-marketplace-drift.cjs [--target <name>] <published-dir>',
  );
  console.error('Compares a published branch tree against a fresh build of the same target.');
  console.error('Targets: claude (default; marketplace branch), agents-standard (skills branch).');
}

/**
 * Parses `[--target <name>] <published-dir>`, with `--target` allowed before or after the
 * positional. Returns null when the arguments are unusable: an unknown target, a `--target` with
 * no value, or any positional count other than one.
 */
function parseArgs(argv) {
  let target = DEFAULT_TARGET;
  const positionals = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--target') {
      const value = argv[i + 1];
      if (value === undefined) return null;
      target = value;
      i += 1;
    } else {
      positionals.push(arg);
    }
  }
  if (positionals.length !== 1 || !Object.hasOwn(TARGETS, target)) return null;
  return { target, published: positionals[0] };
}

/**
 * Reads every entry under `root` into a Map of POSIX relative path -> raw Buffer.
 * Directories are walked; every other non-regular entry (symlink, fifo, socket, …) is recorded
 * too, as a marker Buffer — `<non-regular: link>` for a symlink, `<non-regular>` otherwise — so
 * it reports as a path in the diff instead of being silently skipped. Symlinks are never
 * followed. `skipTopLevel` entries are ignored only at the root, so a `.git` deeper in the
 * tree still counts.
 */
function readTree(root, skipTopLevel) {
  const files = new Map();
  const walk = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (dir === root && skipTopLevel.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      const rel = path.relative(root, full).split(path.sep).join('/');
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        files.set(rel, fs.readFileSync(full));
      } else {
        const marker = entry.isSymbolicLink() ? '<non-regular: link>' : '<non-regular>';
        files.set(rel, Buffer.from(marker));
      }
    }
  };
  walk(root);
  return files;
}

/** Classifies every path in either tree: added (published only), removed (build only), changed. */
function diffTrees(published, fresh) {
  const paths = new Set([...published.keys(), ...fresh.keys()]);
  const lines = [];
  for (const rel of [...paths].sort()) {
    const before = published.get(rel);
    const after = fresh.get(rel);
    if (before !== undefined && after === undefined) lines.push(`added   ${rel}`);
    else if (before === undefined && after !== undefined) lines.push(`removed ${rel}`);
    else if (before !== undefined && after !== undefined && !before.equals(after)) {
      lines.push(`changed ${rel}`);
    }
  }
  return lines;
}

/** Builds `--target target` into `tmp` and returns its build folder; exits 2 if that fails. */
function buildFresh(tmp, target) {
  const build = spawnSync(process.execPath, [CLI, 'build', '--target', target, '--out-dir', tmp], {
    cwd: REPO_ROOT,
    stdio: ['ignore', 'ignore', 'inherit'],
    windowsHide: true,
  });
  const freshDir = path.join(tmp, TARGETS[target].buildDir);
  if (build.status !== 0 || !fs.existsSync(freshDir)) {
    console.error('✗ build failed — run `npm run build` first so dist-cli/cli.js exists');
    return null;
  }
  return freshDir;
}

function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed === null) {
    printUsage();
    process.exit(2);
  }

  const published = path.resolve(parsed.published);
  let isDirectory = false;
  try {
    isDirectory = fs.statSync(published).isDirectory();
  } catch (_err) {
    isDirectory = false;
  }
  if (!isDirectory) {
    console.error(`✗ published dir not found or not a directory: ${parsed.published}`);
    printUsage();
    process.exit(2);
  }

  const target = TARGETS[parsed.target];
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sigil-marketplace-drift-'));
  try {
    const freshDir = buildFresh(tmp, parsed.target);
    if (freshDir === null) {
      process.exitCode = 2;
      return;
    }

    const fresh = readTree(freshDir, new Set(target.omitTopLevel));
    const actual = readTree(published, IGNORED_TOP_LEVEL);
    const drift = diffTrees(actual, fresh);

    if (drift.length === 0) {
      console.log(`✓ ${target.label} matches a fresh build (${fresh.size} files)`);
      return;
    }

    console.log(`✗ ${target.label} drift:`);
    for (const line of drift) console.log(line);
    process.exitCode = 1;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

main();
