#!/usr/bin/env node
/**
 * Flags adjacent JSDoc/TSDoc block comments in src/**\/*.ts.
 *
 * Two `/** ... *\/` blocks back-to-back (no code between them) is never intentional in
 * this codebase — it is the signature of a doc comment left behind when a new
 * declaration was inserted above the one it actually documents (see
 * docs/decisions/clean-code-audit-2026-07.md, "misplaced doc comments" — ~20 shipped
 * instances found post-hoc because nothing in tsc/eslint/prettier/tests can see this).
 *
 * No AST needed: a closing `*​/` line immediately followed by an opening `/**` line is
 * the entire signature. Exits 1 and prints file:line for each hit.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const SRC_DIR = path.resolve(__dirname, '../src');
const CLOSE_RE = /^\s*\*\/\s*$/;
const OPEN_RE = /^\s*\/\*\*/;

/** Recursively collects every .ts file under `dir`. */
function collectTsFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectTsFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

/** Returns 1-based line numbers of `*​/` immediately followed by `/**` in `content`. */
function findAdjacentBlocks(content) {
  const lines = content.split('\n');
  const hits = [];
  for (let i = 0; i < lines.length - 1; i++) {
    if (CLOSE_RE.test(lines[i]) && OPEN_RE.test(lines[i + 1])) {
      hits.push(i + 2); // report the line of the second block's opening
    }
  }
  return hits;
}

function run() {
  const files = collectTsFiles(SRC_DIR);
  let total = 0;

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8');
    const hits = findAdjacentBlocks(content);
    for (const line of hits) {
      const rel = path.relative(process.cwd(), file).replace(/\\/g, '/');
      console.error(`  ${rel}:${line}  adjacent doc comment blocks — likely misattributed`);
      total++;
    }
  }

  if (total > 0) {
    console.error(`\n${total} adjacent doc-comment block(s) found. See the header of this script.`);
    process.exit(1);
  }
}

run();
