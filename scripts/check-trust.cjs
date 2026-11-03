#!/usr/bin/env node
/**
 * Runs the trust scan (`sigil check --trust`) over every catalog artifact shipped to users.
 *
 * Why this exists: the trust scan is opt-in, so a catalog rule, agent or skill can carry a
 * dangerous command into every consumer project without any other gate noticing. Listing the
 * files with `git ls-files` keeps the scan on source the repo actually owns, and chunking keeps
 * the argument list under the OS limit when the catalog grows.
 *
 * Usage: node scripts/check-trust.cjs
 * Exit 0 when the scan is clean (warnings alone do not fail it), 1 on a violation, a git failure,
 * or an empty file list.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

// Resolve from the script location (scripts/), not the caller's cwd, so the check works from
// any working directory.
const REPO_ROOT = path.resolve(__dirname, '..');
const CLI = path.join(REPO_ROOT, 'dist-cli', 'cli.js');

// One pathspec per artifact kind; the glob magic makes `**` span zero or more directories, so a
// kind nested deeper than `catalog/<lang>/<kind>/` is still found.
const ARTIFACT_GLOBS = [
  ':(glob)catalog/**/*.rule.md',
  ':(glob)catalog/**/*.agent.md',
  ':(glob)catalog/**/SKILL.md',
  ':(glob)catalog/**/*.prompt.md',
  ':(glob)catalog/**/*.workflow.md',
  ':(glob)catalog/**/*.hook.md',
  ':(glob)catalog/**/*.mcp.md',
  ':(glob)catalog/**/*.settings.md',
];

// Well under Linux's 2 MiB ARG_MAX and macOS's 256 KiB; the environment and the script path share
// the same limit, so this leaves ample room.
const MAX_CHUNK_BYTES = 64 * 1024;

/** Lists the tracked artifact files, newest-listing first, or exits 1 when git fails. */
function listArtifactFiles() {
  const result = spawnSync('git', ['ls-files', '-z', '--', ...ARTIFACT_GLOBS], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.error || result.status !== 0) {
    console.error('✗ git ls-files failed — run this from a git checkout of sigil.');
    return null;
  }
  return result.stdout.split('\0').filter(Boolean);
}

/** Groups the files so each `node cli.js check --trust …` invocation stays under the OS limit. */
function chunkFiles(files) {
  const chunks = [];
  let current = [];
  let bytes = 0;
  for (const file of files) {
    const size = Buffer.byteLength(file) + 1;
    if (current.length > 0 && bytes + size > MAX_CHUNK_BYTES) {
      chunks.push(current);
      current = [];
      bytes = 0;
    }
    current.push(file);
    bytes += size;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

function main() {
  const files = listArtifactFiles();
  if (files === null) {
    process.exitCode = 1;
    return;
  }
  if (files.length === 0) {
    console.error('✗ no catalog artifact files found to trust-scan.');
    process.exitCode = 1;
    return;
  }
  if (!fs.existsSync(CLI)) {
    console.error('✗ dist-cli/cli.js not found — run `npm run build` first.');
    process.exitCode = 1;
    return;
  }

  const chunks = chunkFiles(files);
  for (const chunk of chunks) {
    const result = spawnSync(process.execPath, [CLI, 'check', '--trust', ...chunk], {
      cwd: REPO_ROOT,
      stdio: 'inherit',
      windowsHide: true,
    });
    if (result.error) {
      console.error(`✗ trust scan failed to start: ${result.error.message}`);
      process.exitCode = 1;
      return;
    }
    if (result.status !== 0) {
      // A null status means the process died on a signal; treat it like any other failure.
      process.exitCode = result.status === null ? 1 : result.status;
      return;
    }
  }
}

main();
