// Shared loader for the 2026-08-20 catalog audit's analysis scripts.
// Reads catalog/**/*.md into { id, kind, path, frontmatter, body, lines } records.
// Not part of the shipped CLI — audit tooling only, re-run any time via `node <script>.js`.
'use strict';
const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');

const CATALOG_ROOT = path.resolve(__dirname, '..', '..', '..', '..', 'catalog');

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.md')) out.push(full);
  }
  return out;
}

function loadCatalog() {
  const files = walk(CATALOG_ROOT, []);
  const artifacts = [];
  for (const file of files) {
    const raw = fs.readFileSync(file, 'utf8');
    const { data, content } = matter(raw);
    if (!data || !data.id) continue; // skip frontmatter-less reference docs
    artifacts.push({
      id: data.id,
      kind: data.kind,
      path: path.relative(CATALOG_ROOT, file).replace(/\\/g, '/'),
      frontmatter: data,
      body: content,
      lines: raw.split('\n').length,
    });
  }
  return artifacts;
}

module.exports = { loadCatalog, CATALOG_ROOT };
