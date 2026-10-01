/**
 * Chooses a project folder with the arrow keys instead of a typed path, so a wrong path cannot be
 * entered by accident. It only returns a folder that exists, or `null` when the user backs out.
 *
 * @module
 */
import path from 'node:path';
import { isCancel, log, select, text } from '@clack/prompts';
import {
  FOLDER_CHOICE,
  browseStart,
  checkFolderInput,
  folderOptions,
  listSubfolders,
  resolveFolderInput,
} from './folder-list';
import type { FolderEntry } from './folder-list';

const MAX_VISIBLE = 12;

type Step = { dir: string } | { result: string | null };

/** The subfolders of `dir`, or none (with a warning) when it cannot be read. */
function readFolders(dir: string): FolderEntry[] {
  try {
    return listSubfolders(dir);
  } catch {
    log.warn(`Cannot read ${dir}.`);
    return [];
  }
}

/** Asks for a path to type. Returns an existing folder, or `null` to keep browsing. */
async function typePath(base: string, homeDir: string): Promise<string | null> {
  const answer = await text({
    message: 'Folder path (paste one, or edit this)',
    placeholder: path.join(base, 'my-project'),
    initialValue: base + path.sep,
    validate: value => checkFolderInput(value, base, homeDir),
  });
  if (isCancel(answer)) return null;
  const problem = checkFolderInput(String(answer), base, homeDir);
  if (problem) {
    log.error(problem);
    return null;
  }
  return resolveFolderInput(String(answer), base, homeDir);
}

async function step(dir: string, homeDir: string): Promise<Step> {
  const choice = await select({
    message: `Pick your project folder — ${dir}`,
    options: folderOptions(dir, readFolders(dir)),
    maxItems: MAX_VISIBLE,
  });
  if (isCancel(choice) || choice === FOLDER_CHOICE.back) return { result: null };
  if (choice === FOLDER_CHOICE.use) return { result: dir };
  if (choice === FOLDER_CHOICE.up) return { dir: path.dirname(dir) };
  if (choice !== FOLDER_CHOICE.type) return { dir: String(choice) };
  const typed = await typePath(dir, homeDir);
  return typed === null ? { dir } : { result: typed };
}

/** Browses from near `current` until the user uses a folder or backs out (`null`). */
export async function pickFolder(current: string, homeDir: string): Promise<string | null> {
  let dir = browseStart(current, homeDir);
  for (;;) {
    const next = await step(dir, homeDir);
    if ('result' in next) return next.result;
    dir = next.dir;
  }
}
