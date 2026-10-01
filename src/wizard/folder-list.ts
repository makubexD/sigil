/**
 * What the folder picker shows and how it reads a typed path. Pure apart from reading the
 * directory, so it is tested without any prompt.
 *
 * @module
 */
import fs from 'node:fs';
import path from 'node:path';
import { detectedTargetsIn, looksLikeProject, samePath } from '../project-context';
import { getAllTargets } from '../targets';

/** Sentinel values for the navigation entries. A folder entry's value is always an absolute path. */
export const FOLDER_CHOICE = {
  use: '::use',
  up: '::up',
  type: '::type',
  back: '::back',
} as const;

/** One row of the folder select. */
export interface FolderOption {
  value: string;
  label: string;
  hint?: string;
}

export interface FolderEntry {
  name: string;
  path: string;
  isProject: boolean;
  /** Names of the targets the folder is already set up for. */
  targets: string[];
}

const SKIPPED_FOLDERS = new Set(['node_modules']);

const isRoot = (dir: string): boolean => path.dirname(dir) === dir;

/** Where browsing starts: the parent, where sibling projects live, unless that is useless. */
export function browseStart(current: string, homeDir: string): string {
  return samePath(current, homeDir) || isRoot(current) ? current : path.dirname(current);
}

/** The folders directly inside `dir`: projects first, then alphabetical. Throws if unreadable. */
export function listSubfolders(dir: string): FolderEntry[] {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter(e => e.isDirectory() && !e.name.startsWith('.') && !SKIPPED_FOLDERS.has(e.name))
    .map(e => {
      const full = path.join(dir, e.name);
      return {
        name: e.name,
        path: full,
        isProject: looksLikeProject(full),
        targets: detectedTargetsIn(full),
      };
    })
    .sort((a, b) => Number(b.isProject) - Number(a.isProject) || a.name.localeCompare(b.name));
}

function folderHint(entry: FolderEntry): string | undefined {
  const names = getAllTargets()
    .filter(t => entry.targets.includes(t.name))
    .map(t => t.displayName ?? t.name);
  const parts = [...(entry.isProject || names.length > 0 ? ['project'] : []), ...names];
  return parts.length > 0 ? parts.join(' · ') : undefined;
}

function navigationOptions(dir: string): FolderOption[] {
  const up: FolderOption[] = isRoot(dir)
    ? []
    : [{ value: FOLDER_CHOICE.up, label: '↑ Up one level', hint: path.dirname(dir) }];
  return [
    { value: FOLDER_CHOICE.use, label: 'Use this folder', hint: path.basename(dir) || dir },
    ...up,
    { value: FOLDER_CHOICE.type, label: 'Type a path…', hint: 'another drive, or paste a path' },
    { value: FOLDER_CHOICE.back, label: 'Back to menu' },
  ];
}

/** The select options for browsing `dir`: navigation first, then its subfolders. */
export function folderOptions(dir: string, folders: FolderEntry[]): FolderOption[] {
  const entries = folders.map((f): FolderOption => {
    const hint = folderHint(f);
    return { value: f.path, label: `${f.name}${path.sep}`, ...(hint ? { hint } : {}) };
  });
  return [...navigationOptions(dir), ...entries];
}

const QUOTED = /^(["'])(.*)\1$/;

/** Cleans a typed or pasted path: quotes, `~`, and relative paths. */
export function resolveFolderInput(input: string, base: string, homeDir: string): string {
  const unquoted = input.trim().replace(QUOTED, '$2');
  const expanded = /^~(?=$|[\\/])/.test(unquoted) ? homeDir + unquoted.slice(1) : unquoted;
  return path.resolve(base, expanded);
}

/** The error to show for a typed path, or `undefined` when it is a folder that exists. */
export function checkFolderInput(input: string, base: string, homeDir: string): string | undefined {
  if (input.trim() === '') return 'Enter a folder path, or press Ctrl+C to go back.';
  const target = resolveFolderInput(input, base, homeDir);
  if (!fs.existsSync(target)) return `No folder at ${target}`;
  if (!fs.statSync(target).isDirectory()) return `${target} is a file, not a folder.`;
  return undefined;
}
