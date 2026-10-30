#!/usr/bin/env node
/**
 * Proves a published marketplace tree equals a fresh `--target claude` build.
 *
 * Why this exists: the release workflow publishes a fresh `claude/` build to the `marketplace`
 * branch, and users add that branch as a Claude Code marketplace. If the branch drifts from the
 * build of its tag — a hand edit, a partial publish, a job that half-ran — users would install
 * something that is not the release. This check builds the current tree into a temp dir and
 * compares it byte-for-byte with the published one, so CI fails on any difference.
 *
 * Usage: node scripts/check-marketplace-drift.cjs <published-dir>
 * Exit 0 when equal, 1 on drift, 2 on a usage or build error.
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

// The publish step checks out the marketplace branch, so `.git/` sits at the published root and
// is not part of the build. Nothing else in the published dir is exempt.
const IGNORED_TOP_LEVEL = new Set(['.git']);
const NO_IGNORED_ENTRIES = new Set();

function printUsage() {
  console.error('Usage: node scripts/check-marketplace-drift.cjs <published-dir>');
  console.error('Compares a published marketplace tree against a fresh `--target claude` build.');
}

/**
 * Reads every regular file under `root` into a Map of POSIX relative path -> raw Buffer.
 * `skipTopLevel` entries are ignored only at the root, so a `.git` deeper in the tree still counts.
 */
function readTree(root, skipTopLevel) {
  const files = new Map();
  const walk = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (dir === root && skipTopLevel.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        files.set(path.relative(root, full).split(path.sep).join('/'), fs.readFileSync(full));
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

/** Builds `--target claude` into `tmp` and returns `<tmp>/claude`; exits 2 if that fails. */
function buildFresh(tmp) {
  const build = spawnSync(
    process.execPath,
    [CLI, 'build', '--target', 'claude', '--out-dir', tmp],
    { cwd: REPO_ROOT, stdio: ['ignore', 'ignore', 'inherit'], windowsHide: true },
  );
  const freshDir = path.join(tmp, 'claude');
  if (build.status !== 0 || !fs.existsSync(freshDir)) {
    console.error('✗ build failed — run `npm run build` first so dist-cli/cli.js exists');
    return null;
  }
  return freshDir;
}

function main() {
  const args = process.argv.slice(2);
  if (args.length !== 1) {
    printUsage();
    process.exit(2);
  }

  const published = path.resolve(args[0]);
  let isDirectory = false;
  try {
    isDirectory = fs.statSync(published).isDirectory();
  } catch (_err) {
    isDirectory = false;
  }
  if (!isDirectory) {
    console.error(`✗ published dir not found or not a directory: ${args[0]}`);
    printUsage();
    process.exit(2);
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sigil-marketplace-drift-'));
  try {
    const freshDir = buildFresh(tmp);
    if (freshDir === null) {
      process.exitCode = 2;
      return;
    }

    const fresh = readTree(freshDir, NO_IGNORED_ENTRIES);
    const actual = readTree(published, IGNORED_TOP_LEVEL);
    const drift = diffTrees(actual, fresh);

    if (drift.length === 0) {
      console.log(`✓ marketplace matches a fresh build (${fresh.size} files)`);
      return;
    }

    console.log('✗ marketplace drift:');
    for (const line of drift) console.log(line);
    process.exitCode = 1;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

main();
