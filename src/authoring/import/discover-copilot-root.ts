/**
 * The whole-folder checks of Copilot discovery: Markdown files that sit directly in `.github/`, and
 * two source files that normalise to one name. Split out of discover-copilot.ts, which reads the
 * kind folders, to keep that file under the repo's module-size limit.
 *
 * @module
 */
import fs from 'fs';
import path from 'path';
import { normPath } from '../../paths';
import type { DiscoveredFile, DiscoverResult, UnrecognisedFile } from './discover';

export const GITHUB_DIR = '.github';
export const README_MD = 'README.md';
const AGENTS_FILE = 'AGENTS.md';
const SINGLE_FILE_NAME = 'copilot-instructions.md';
const SINGLE_FILE_REASON =
  'not imported: single-file instructions are not split into rules; move each into instructions/';
const ROOT_MD_REASON = 'Root-level .md file — not a recognised artifact location';

/** `AGENTS.md` beside a `.github/` directory, reported as split-not-supported. */
function agentsBesideGithub(githubDir: string): UnrecognisedFile | undefined {
  if (path.basename(githubDir) !== GITHUB_DIR) return undefined;
  const agentsFile = path.join(path.dirname(githubDir), AGENTS_FILE);
  if (!fs.statSync(agentsFile, { throwIfNoEntry: false })?.isFile()) return undefined;
  return { relativePath: normPath(path.join('..', AGENTS_FILE)), reason: SINGLE_FILE_REASON };
}

/** Markdown files directly in `.github/` — single-file instructions are reported, not split. */
function rootMarkdownFiles(githubDir: string): UnrecognisedFile[] {
  const unrecognised: UnrecognisedFile[] = [];
  for (const entry of fs.readdirSync(githubDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.md') || entry.name === README_MD) continue;
    const reason = entry.name === SINGLE_FILE_NAME ? SINGLE_FILE_REASON : ROOT_MD_REASON;
    unrecognised.push({ relativePath: normPath(entry.name), reason });
  }
  return unrecognised;
}

/** Everything directly in or beside `.github/` that is reported rather than imported. */
export function rootFileReports(githubDir: string): UnrecognisedFile[] {
  const beside = agentsBesideGithub(githubDir);
  const root = rootMarkdownFiles(githubDir);
  return beside === undefined ? root : [...root, beside];
}

/** Marks a second file with the same kind and slug as unrecognised. */
export function dedupeDiscovered(discovered: DiscoveredFile[]): DiscoverResult {
  const seen = new Map<string, string>();
  const kept: DiscoveredFile[] = [];
  const unrecognised: UnrecognisedFile[] = [];
  for (const file of discovered) {
    const key = `${file.kind}:${file.slug}`;
    const other = seen.get(key);
    if (other !== undefined) {
      const reason = `not imported: same name as ${other}`;
      unrecognised.push({ relativePath: file.relativePath, reason });
      continue;
    }
    seen.set(key, file.relativePath);
    kept.push(file);
  }
  return { discovered: kept, unrecognised };
}
