/**
 * Discover importable artifact files in a source Claude template directory.
 *
 * Recognises the standard portable-template layout:
 *   rules/<prefix>-<topic>.md        → kind: rule
 *   agents/<prefix>-<role>.md        → kind: agent
 *   skills/<prefix>-<verb-noun>/SKILL.md → kind: skill
 *
 * Returns a list of `DiscoveredFile` objects with the kind and parsed frontmatter.
 * README.md and any other file that doesn't match the layout is placed in `unrecognised`.
 *
 * This module is I/O-only (discovery); translation to catalog format lives in translate.ts.
 */
import fs from 'fs';
import path from 'path';

// ─── Types ────────────────────────────────────────────────────────────────────

/** A file found in the source directory and classified as an importable artifact. */
export interface DiscoveredFile {
  /** Absolute path to the source file. */
  sourcePath: string;
  /** Relative path from the source dir root (for display). */
  relativePath: string;
  /** Detected artifact kind. */
  kind: 'skill' | 'agent' | 'rule';
  /** The source slug (folder name for skills, file stem for others, e.g. "cs-generate-tests"). */
  slug: string;
  /** Raw parsed frontmatter from gray-matter. */
  frontmatter: Record<string, unknown>;
  /** Raw body text (everything after the frontmatter block). */
  body: string;
}

/** A file found but not classifiable as a known artifact kind. */
export interface UnrecognisedFile {
  relativePath: string;
  reason: string;
}

export interface DiscoverResult {
  discovered: DiscoveredFile[];
  unrecognised: UnrecognisedFile[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Parse a markdown file with simple frontmatter.
 *
 * We do NOT use gray-matter here because the source Claude template files contain
 * unquoted description strings with colons (e.g., "description: Fix: the bug"),
 * which strict YAML parsers reject. Instead we parse the frontmatter line-by-line:
 *   - A line with `key: value` → key = value (string; everything after the first `: `)
 *   - Special-case: boolean true/false, simple numeric scalars
 *   - A line that looks like `key:` with YAML indented children (e.g. `paths:`) → collect as array
 *
 * This is intentionally tolerant: accuracy matters more than strict YAML compliance
 * for the source-import path.
 */
function parseMarkdown(filePath: string): { frontmatter: Record<string, unknown>; body: string } {
  const raw = fs.readFileSync(filePath, 'utf-8');

  // Must start with ---
  if (!raw.startsWith('---')) {
    return { frontmatter: {}, body: raw };
  }

  // Find closing ---
  const rest = raw.slice(3);
  const closeIdx = rest.indexOf('\n---');
  if (closeIdx === -1) {
    return { frontmatter: {}, body: raw };
  }

  const frontmatterText = rest.slice(0, closeIdx);
  const body = rest.slice(closeIdx + 4); // skip \n---

  // Parse frontmatter line by line
  const fm: Record<string, unknown> = {};
  const lines = frontmatterText.split('\n');
  let i = 0;
  while (i < lines.length) {
    // lines[i] is guaranteed to exist since i < lines.length
    const line: string = lines[i] ?? '';
    // Skip blank lines
    if (!line.trim()) { i++; continue; }

    // Indented line (part of a previous list) — handled inline below
    if (line.startsWith('  ') || line.startsWith('\t')) { i++; continue; }

    // Match "key: value" or "key:" (bare)
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) { i++; continue; }

    const key = line.slice(0, colonIdx).trim();
    const rawVal = line.slice(colonIdx + 1);
    const valStr = rawVal.trimStart();

    if (!key) { i++; continue; }

    // Check if next lines are indented list items (e.g. paths:, tools:)
    const listItems: string[] = [];
    if (valStr === '' || valStr === '\n') {
      // Collect indented child lines
      let j = i + 1;
      while (j < lines.length && ((lines[j] ?? '').startsWith('  ') || (lines[j] ?? '').startsWith('\t'))) {
        let item = (lines[j] ?? '').trim();
        // Strip "- " list-item marker
        if (item.startsWith('- ')) item = item.slice(2);
        // Strip surrounding YAML quotes so "**/*.cs" stays as **/*.cs
        if ((item.startsWith('"') && item.endsWith('"')) ||
            (item.startsWith("'") && item.endsWith("'"))) {
          item = item.slice(1, -1);
        }
        listItems.push(item);
        j++;
      }
      if (listItems.length > 0) {
        fm[key] = listItems;
        i = j;
        continue;
      }
    }

    // Scalar value
    if (valStr === 'true') { fm[key] = true; }
    else if (valStr === 'false') { fm[key] = false; }
    else if (valStr !== '' && !isNaN(Number(valStr))) { fm[key] = Number(valStr); }
    else {
      // Strip surrounding quotes if present
      if ((valStr.startsWith('"') && valStr.endsWith('"')) ||
          (valStr.startsWith("'") && valStr.endsWith("'"))) {
        fm[key] = valStr.slice(1, -1);
      } else {
        fm[key] = valStr;
      }
    }
    i++;
  }

  return { frontmatter: fm, body };
}

function stemOf(filePath: string): string {
  return path.basename(filePath).replace(/\.md$/, '');
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Walk `sourceDir` and classify every Markdown file as an artifact kind.
 * Files that don't match any known layout are collected in `unrecognised`.
 *
 * @param sourceDir  Absolute path to the source Claude template directory (e.g. _Others/.ClaudeDotNet).
 */
export function discoverFiles(sourceDir: string): DiscoverResult {
  const discovered: DiscoveredFile[] = [];
  const unrecognised: UnrecognisedFile[] = [];

  const rulesDir = path.join(sourceDir, 'rules');
  const agentsDir = path.join(sourceDir, 'agents');
  const skillsDir = path.join(sourceDir, 'skills');

  // ── rules/ ────────────────────────────────────────────────────────────────
  if (fs.existsSync(rulesDir)) {
    for (const entry of fs.readdirSync(rulesDir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.md')) {
        if (entry.name !== 'README.md') {
          unrecognised.push({
            relativePath: path.join('rules', entry.name),
            reason: 'Not a .md file',
          });
        }
        continue;
      }
      const filePath = path.join(rulesDir, entry.name);
      const slug = stemOf(filePath);
      const { frontmatter, body } = parseMarkdown(filePath);
      discovered.push({
        sourcePath: filePath,
        relativePath: path.join('rules', entry.name),
        kind: 'rule',
        slug,
        frontmatter,
        body,
      });
    }
  }

  // ── agents/ ───────────────────────────────────────────────────────────────
  if (fs.existsSync(agentsDir)) {
    for (const entry of fs.readdirSync(agentsDir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.md')) {
        if (entry.name !== 'README.md') {
          unrecognised.push({
            relativePath: path.join('agents', entry.name),
            reason: 'Not a .md file',
          });
        }
        continue;
      }
      const filePath = path.join(agentsDir, entry.name);
      const slug = stemOf(filePath);
      const { frontmatter, body } = parseMarkdown(filePath);
      discovered.push({
        sourcePath: filePath,
        relativePath: path.join('agents', entry.name),
        kind: 'agent',
        slug,
        frontmatter,
        body,
      });
    }
  }

  // ── skills/ ───────────────────────────────────────────────────────────────
  if (fs.existsSync(skillsDir)) {
    for (const entry of fs.readdirSync(skillsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        unrecognised.push({
          relativePath: path.join('skills', entry.name),
          reason: 'Expected a directory per skill (skills/<name>/SKILL.md)',
        });
        continue;
      }
      const skillFile = path.join(skillsDir, entry.name, 'SKILL.md');
      if (!fs.existsSync(skillFile)) {
        unrecognised.push({
          relativePath: path.join('skills', entry.name),
          reason: 'Missing SKILL.md inside skill directory',
        });
        continue;
      }
      const { frontmatter, body } = parseMarkdown(skillFile);
      discovered.push({
        sourcePath: skillFile,
        relativePath: path.join('skills', entry.name, 'SKILL.md'),
        kind: 'skill',
        slug: entry.name,
        frontmatter,
        body,
      });
    }
  }

  // ── Root-level files we intentionally skip ────────────────────────────────
  // README.md is documentation, not an artifact — silently skipped.
  // Any other root-level .md is unexpected.
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    if (entry.name === 'README.md') continue;
    unrecognised.push({
      relativePath: entry.name,
      reason: 'Root-level .md file — not a recognised artifact location',
    });
  }

  return { discovered, unrecognised };
}
