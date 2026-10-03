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
  create: '::create',
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
  /** A sigil catalog checkout: installs would land inside the catalog, so it is never the project. */
  isCatalog?: boolean;
}

const SKIPPED_FOLDERS = new Set(['node_modules']);
/** Folders past this many (by name) are listed without checking for project markers: each check is
 * a few file reads, which is slow in a huge or networked folder. "Type a path" still reaches them. */
const MAX_PROBED = 200;

const isRoot = (dir: string): boolean => path.dirname(dir) === dir;

/** Where browsing starts: the parent, where sibling projects live, unless that is useless. */
export function browseStart(current: string, homeDir: string): string {
  return samePath(current, homeDir) || isRoot(current) ? current : path.dirname(current);
}

/** A real folder, or a link (symlink / junction) that leads to one. */
function isFolder(dir: string, entry: fs.Dirent): boolean {
  if (entry.isDirectory()) return true;
  if (!entry.isSymbolicLink()) return false;
  try {
    return fs.statSync(path.join(dir, entry.name)).isDirectory();
  } catch {
    return false;
  }
}

/** One listed folder; `probe` is false past the cap, so it is listed without a project check. */
function describeFolder(dir: string, name: string, probe: boolean): FolderEntry {
  const full = path.join(dir, name);
  return {
    name,
    path: full,
    isProject: probe && looksLikeProject(full),
    targets: probe ? detectedTargetsIn(full) : [],
    isCatalog:
      probe &&
      fs.existsSync(path.join(full, 'catalog')) &&
      fs.existsSync(path.join(full, 'packs.yaml')),
  };
}

/** The folders directly inside `dir`: projects first, then alphabetical. Throws if unreadable. */
export function listSubfolders(dir: string): FolderEntry[] {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter(e => isFolder(dir, e) && !e.name.startsWith('.') && !SKIPPED_FOLDERS.has(e.name))
    .map(e => e.name)
    .sort((a, b) => a.localeCompare(b))
    .map((name, index) => describeFolder(dir, name, index < MAX_PROBED))
    .sort((a, b) => Number(b.isProject) - Number(a.isProject) || a.name.localeCompare(b.name));
}

function folderHint(entry: FolderEntry): string | undefined {
  if (entry.isCatalog) return 'sigil catalog, not a project';
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
    {
      value: FOLDER_CHOICE.use,
      label: `Use ${path.basename(dir) || dir}`,
      hint: 'the folder above',
    },
    ...up,
    { value: FOLDER_CHOICE.type, label: 'Type a path…', hint: 'another drive, or paste a path' },
    {
      value: FOLDER_CHOICE.create,
      label: '＋ New folder here…',
      hint: `create a folder inside ${path.basename(dir) || dir}`,
    },
    { value: FOLDER_CHOICE.back, label: 'Back to menu' },
  ];
}

/**
 * The select options for browsing `dir`: navigation first, then its subfolders. `leaving` is the
 * folder the user is moving away from; it is labelled so it is not picked again by mistake.
 */
export function folderOptions(
  dir: string,
  folders: FolderEntry[],
  leaving?: string,
): FolderOption[] {
  const entries = folders.map((f): FolderOption => {
    const hint =
      leaving !== undefined && samePath(f.path, leaving)
        ? 'the folder you are leaving'
        : folderHint(f);
    return { value: f.path, label: `${f.name}${path.sep}`, ...(hint ? { hint } : {}) };
  });
  return [...navigationOptions(dir), ...entries];
}

const QUOTED = /^(["'])(.*)\1$/;
const BARE_DRIVE = /^[a-zA-Z]:$/;

/** Cleans a typed or pasted path: quotes, `~`, a bare drive letter, and relative paths. */
export function resolveFolderInput(input: string, base: string, homeDir: string): string {
  const unquoted = input.trim().replace(QUOTED, '$2');
  const expanded = /^~(?=$|[\\/])/.test(unquoted) ? homeDir + unquoted.slice(1) : unquoted;
  // `D:` alone means "the current folder on D:" to Windows; the user means the drive itself.
  const drive = process.platform === 'win32' && BARE_DRIVE.test(expanded);
  return path.resolve(base, drive ? expanded + path.sep : expanded);
}

export type FolderInputStatus = 'empty' | 'file' | 'blocked' | 'unavailable' | 'missing' | 'ok';

export interface FolderInput {
  status: FolderInputStatus;
  /** The absolute path the input points at. */
  target: string;
}

/** Walks up from `target` to the first path that exists; undefined when even the root is missing. */
function nearestExisting(target: string): string | undefined {
  let current = target;
  for (;;) {
    if (fs.existsSync(current)) return current;
    const parent = path.dirname(current);
    if (parent === current) return undefined; // a drive or share that is not there
    current = parent;
  }
}

/** True for a folder; false for a file or anything that cannot be read (permissions, a gone drive). */
function isDirectory(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/**
 * What a typed path points at: a folder (`ok`), a folder that can be created (`missing`), a file
 * (`file`), a place that can never be created because a file is in the way (`blocked`) or its
 * drive or share is not there (`unavailable`), or nothing (`empty`).
 */
export function classifyFolderInput(input: string, base: string, homeDir: string): FolderInput {
  if (input.trim() === '') return { status: 'empty', target: base };
  const target = resolveFolderInput(input, base, homeDir);
  if (fs.existsSync(target)) return { status: isDirectory(target) ? 'ok' : 'file', target };
  const anchor = nearestExisting(target);
  if (anchor === undefined) return { status: 'unavailable', target };
  return { status: isDirectory(anchor) ? 'missing' : 'blocked', target };
}

/** The error to show for a typed path, or `undefined` when it is usable (or can be created). */
export function folderInputError({ status, target }: FolderInput): string | undefined {
  if (status === 'empty') return 'Enter a folder path, or press Ctrl+C to go back.';
  if (status === 'file') return `${target} is a file, not a folder.`;
  if (status === 'blocked') return `Cannot create ${target}: part of that path is a file.`;
  if (status === 'unavailable') return `${target}: that drive or network share is not available.`;
  return undefined;
}

const NOT_A_NAME = /[\\/:*?"<>|]/;

/** The error to show for a new folder's name, or `undefined` when it can be created inside `dir`. */
export function checkNewFolderName(name: string, dir: string): string | undefined {
  const trimmed = name.trim();
  if (trimmed === '') return 'Enter a name for the new folder.';
  if (trimmed === '.' || trimmed === '..' || NOT_A_NAME.test(trimmed)) {
    return 'Use a name, not a path (no \\ / : * ? " < > |).';
  }
  if (fs.existsSync(path.join(dir, trimmed))) {
    return `${trimmed} already exists. Pick it from the list instead.`;
  }
  return undefined;
}
