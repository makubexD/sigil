/**
 * Chooses a project folder with the arrow keys instead of a typed path, so a wrong path cannot be
 * entered by accident. It returns a folder that exists, or one it just created after the user
 * said yes, or `null` when the user backs out.
 *
 * @module
 */
import fs from 'node:fs';
import path from 'node:path';
import { confirm, isCancel, log, select, text } from '@clack/prompts';
import {
  FOLDER_CHOICE,
  browseStart,
  checkNewFolderName,
  classifyFolderInput,
  folderInputError,
  folderOptions,
  listSubfolders,
} from './folder-list';
import type { FolderEntry } from './folder-list';

const MAX_VISIBLE = 12;

/** `focus` is the folder the cursor starts on, so "Up" lands on the folder you came from. */
type Step = { dir: string; focus?: string } | { result: string | null };

/** The subfolders of `dir`, or none (with a warning) when it cannot be read. */
function readFolders(dir: string): FolderEntry[] {
  try {
    return listSubfolders(dir);
  } catch {
    log.warn(`Cannot read ${dir}.`);
    return [];
  }
}

/** Creates `target` (and any missing parents). Returns it, or `null` after saying why it failed. */
function makeFolder(target: string): string | null {
  try {
    fs.mkdirSync(target, { recursive: true });
  } catch (error) {
    log.error(`Could not create ${target}: ${error instanceof Error ? error.message : error}`);
    return null;
  }
  log.success(`Created ${target}`);
  return target;
}

async function confirmCreate(target: string): Promise<string | null> {
  const yes = await confirm({
    message: `${target} does not exist yet. Create it?`,
    initialValue: true,
  });
  return isCancel(yes) || !yes ? null : makeFolder(target);
}

/** Asks for a path to type. Returns a usable folder, or `null` to keep browsing. */
async function typePath(base: string, homeDir: string): Promise<string | null> {
  const answer = await text({
    message: 'Folder path (paste one, or edit this)',
    placeholder: path.join(base, 'my-project'),
    initialValue: base + path.sep,
    validate: value => folderInputError(classifyFolderInput(value, base, homeDir)),
  });
  if (isCancel(answer)) return null;
  const input = classifyFolderInput(String(answer), base, homeDir);
  const problem = folderInputError(input);
  if (problem) {
    log.error(problem);
    return null;
  }
  return input.status === 'missing' ? confirmCreate(input.target) : input.target;
}

/** Asks for the name of a new folder inside `dir` and creates it. `null` keeps browsing. */
async function newFolderHere(dir: string): Promise<string | null> {
  const name = await text({
    message: `Name for the new folder inside ${dir}`,
    placeholder: 'my-project',
    validate: value => checkNewFolderName(value, dir),
  });
  if (isCancel(name)) return null;
  const problem = checkNewFolderName(String(name), dir);
  if (problem) {
    log.error(problem);
    return null;
  }
  return makeFolder(path.join(dir, String(name).trim()));
}

async function step(dir: string, homeDir: string, focus: string | undefined): Promise<Step> {
  const choice = await select({
    message: `Pick your project folder — ${dir}`,
    options: folderOptions(dir, readFolders(dir)),
    maxItems: MAX_VISIBLE,
    ...(focus ? { initialValue: focus } : {}),
  });
  if (isCancel(choice) || choice === FOLDER_CHOICE.back) return { result: null };
  if (choice === FOLDER_CHOICE.use) return { result: dir };
  if (choice === FOLDER_CHOICE.up) return { dir: path.dirname(dir), focus: dir };
  if (choice !== FOLDER_CHOICE.type && choice !== FOLDER_CHOICE.create) {
    return { dir: String(choice) };
  }
  const made =
    choice === FOLDER_CHOICE.type ? await typePath(dir, homeDir) : await newFolderHere(dir);
  return made === null ? { dir } : { result: made };
}

/** Browses from near `current` until the user picks a folder or backs out (`null`). */
export async function pickFolder(current: string, homeDir: string): Promise<string | null> {
  let dir = browseStart(current, homeDir);
  let focus: string | undefined = current;
  for (;;) {
    const next = await step(dir, homeDir, focus);
    if ('result' in next) return next.result;
    dir = next.dir;
    focus = next.focus;
  }
}
