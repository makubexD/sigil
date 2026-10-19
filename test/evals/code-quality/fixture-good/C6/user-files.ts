import { readFile } from 'node:fs/promises';
import path from 'node:path';

export async function readUserFile(baseDir: string, name: string): Promise<string> {
  if (path.isAbsolute(name)) throw new RangeError(`file name must be relative: ${name}`);
  const base = path.resolve(baseDir);
  const full = path.resolve(base, name);
  if (!full.startsWith(base + path.sep)) {
    throw new RangeError(`file name points outside the base directory: ${name}`);
  }
  return readFile(full, 'utf8');
}
