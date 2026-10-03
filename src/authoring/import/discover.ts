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
import type { Dirent } from 'fs';
import { SKILL_FILENAME } from '../../paths';
import { parseMarkdown, stemOf } from './parse-markdown';
import { readReferences } from '../../load-references';
import type { ReferenceFile } from '../../types';

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
  /** A skill's flat references/*.md files, read by the same rules the catalog loader applies. */
  references?: ReferenceFile[];
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

// ─── Main export ──────────────────────────────────────────────────────────────

/** Classifies one directory entry within a flat kind dir (rules/ or agents/). */
type ClassifyResult = { discovered?: DiscoveredFile; unrecognised?: UnrecognisedFile };

/** Builds a DiscoveredFile record for a flat-kind (rule/agent) source markdown file. */
function buildFlatKindDiscoveredFile(
  filePath: string,
  relativePath: string,
  kind: 'rule' | 'agent',
): DiscoveredFile {
  const slug = stemOf(filePath);
  const { frontmatter, body } = parseMarkdown(filePath);
  return { sourcePath: filePath, relativePath, kind, slug, frontmatter, body };
}

function classifyFlatKindEntry(
  entry: Dirent,
  dir: string,
  dirName: string,
  kind: 'rule' | 'agent',
): ClassifyResult {
  if (!entry.isFile() || !entry.name.endsWith('.md')) {
    if (entry.name === 'README.md') return {};
    return {
      unrecognised: { relativePath: path.join(dirName, entry.name), reason: 'Not a .md file' },
    };
  }
  const filePath = path.join(dir, entry.name);
  const relativePath = path.join(dirName, entry.name);
  return { discovered: buildFlatKindDiscoveredFile(filePath, relativePath, kind) };
}

/** Discovers a flat kind directory (`rules/` or `agents/`) — one `.md` file per artifact. */
function discoverFlatKindDir(
  sourceDir: string,
  dirName: string,
  kind: 'rule' | 'agent',
): DiscoverResult {
  const discovered: DiscoveredFile[] = [];
  const unrecognised: UnrecognisedFile[] = [];
  const dir = path.join(sourceDir, dirName);
  if (!fs.existsSync(dir)) return { discovered, unrecognised };

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const result = classifyFlatKindEntry(entry, dir, dirName, kind);
    if (result.discovered) discovered.push(result.discovered);
    if (result.unrecognised) unrecognised.push(result.unrecognised);
  }
  return { discovered, unrecognised };
}

/** Builds a DiscoveredFile record for one `skills/<name>/SKILL.md` source file. */
function buildSkillDiscoveredFile(skillFile: string, skillName: string): DiscoveredFile {
  const { frontmatter, body } = parseMarkdown(skillFile);
  return {
    sourcePath: skillFile,
    relativePath: path.join('skills', skillName, SKILL_FILENAME),
    kind: 'skill',
    slug: skillName,
    frontmatter,
    body,
  };
}

/** Classifies one directory entry within `skills/` — a per-skill subdirectory. */
function classifySkillEntry(entry: Dirent, skillsDir: string): ClassifyResult {
  if (!entry.isDirectory()) {
    return {
      unrecognised: {
        relativePath: path.join('skills', entry.name),
        reason: 'Expected a directory per skill (skills/<name>/SKILL.md)',
      },
    };
  }
  const skillFile = path.join(skillsDir, entry.name, SKILL_FILENAME);
  if (!fs.existsSync(skillFile)) {
    return {
      unrecognised: {
        relativePath: path.join('skills', entry.name),
        reason: `Missing ${SKILL_FILENAME} inside skill directory`,
      },
    };
  }
  return { discovered: buildSkillDiscoveredFile(skillFile, entry.name) };
}

/** Discovers `skills/<name>/SKILL.md` — one directory per artifact. */
function discoverSkillsDir(sourceDir: string): DiscoverResult {
  const discovered: DiscoveredFile[] = [];
  const unrecognised: UnrecognisedFile[] = [];
  const skillsDir = path.join(sourceDir, 'skills');
  if (!fs.existsSync(skillsDir)) return { discovered, unrecognised };

  for (const entry of fs.readdirSync(skillsDir, { withFileTypes: true })) {
    const result = classifySkillEntry(entry, skillsDir);
    if (result.discovered) {
      const { file, notShipped } = withReferences(result.discovered, skillsDir);
      discovered.push(file);
      unrecognised.push(...notShipped);
    }
    if (result.unrecognised) unrecognised.push(result.unrecognised);
  }
  return { discovered, unrecognised };
}

/** Folder entries of a skill that import brings over; everything else is reported. */
const SHIPPED_SKILL_ENTRIES = new Set([SKILL_FILENAME, 'references']);
const NOT_SHIPPED =
  'not imported: a skill ships only SKILL.md and flat references/*.md (flatten per-stack folders into references/stack-<x>.md)';

/**
 * Attaches a skill's references (same rules as the catalog loader) and lists what it carries that
 * can't ship — nested reference folders, assets/, scripts/, other files — so import reports them
 * instead of dropping them silently.
 */
function withReferences(
  file: DiscoveredFile,
  skillsDir: string,
): { file: DiscoveredFile; notShipped: UnrecognisedFile[] } {
  const skillDir = path.join(skillsDir, file.slug);
  const { references, skipped } = readReferences(skillDir);
  const relative = (p: string) => path.join('skills', path.relative(skillsDir, p));
  const extras = fs
    .readdirSync(skillDir)
    .filter(name => !SHIPPED_SKILL_ENTRIES.has(name))
    .map(name => ({ relativePath: path.join('skills', file.slug, name), reason: NOT_SHIPPED }));
  const refs = skipped.map(s => ({
    relativePath: relative(s.path),
    reason: `not imported: ${s.reason}`,
  }));
  return { file: { ...file, references }, notShipped: [...refs, ...extras] };
}

/**
 * Root-level files we intentionally skip: README.md is documentation, not an artifact —
 * silently skipped. Any other root-level .md is unexpected and reported as unrecognised.
 */
function discoverRootLevelUnrecognised(sourceDir: string): UnrecognisedFile[] {
  const unrecognised: UnrecognisedFile[] = [];
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    if (entry.name === 'README.md') continue;
    unrecognised.push({
      relativePath: entry.name,
      reason: 'Root-level .md file — not a recognised artifact location',
    });
  }
  return unrecognised;
}

/**
 * Walk `sourceDir` and classify every Markdown file as an artifact kind.
 * Files that don't match any known layout are collected in `unrecognised`.
 *
 * @param sourceDir  Absolute path to the source Claude template directory (e.g. _Others/.ClaudeDotNet).
 */
export function discoverFiles(sourceDir: string): DiscoverResult {
  const rules = discoverFlatKindDir(sourceDir, 'rules', 'rule');
  const agents = discoverFlatKindDir(sourceDir, 'agents', 'agent');
  const skills = discoverSkillsDir(sourceDir);
  const rootUnrecognised = discoverRootLevelUnrecognised(sourceDir);

  return {
    discovered: [...rules.discovered, ...agents.discovered, ...skills.discovered],
    unrecognised: [
      ...rules.unrecognised,
      ...agents.unrecognised,
      ...skills.unrecognised,
      ...rootUnrecognised,
    ],
  };
}
