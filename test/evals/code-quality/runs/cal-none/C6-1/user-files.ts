import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';

/** True when `target` is strictly inside `base` (both already absolute and normalized). */
function isInside(base: string, target: string): boolean {
  const rel = path.relative(base, target);
  return (
    rel !== '' &&
    rel !== '..' &&
    !rel.startsWith('..' + path.sep) &&
    // On Windows, a target on another drive yields an absolute relative path.
    !path.isAbsolute(rel)
  );
}

/**
 * Reads the UTF-8 file `name` relative to `baseDir`.
 *
 * `name` is untrusted input: it must be relative and must resolve to a file inside `baseDir`,
 * both lexically and after following symlinks. Otherwise the promise rejects with a `RangeError`.
 */
export async function readUserFile(baseDir: string, name: string): Promise<string> {
  if (name.includes('\0')) {
    throw new RangeError('File name contains a null byte');
  }
  // A non-empty root also catches Windows drive-relative names like `C:foo`.
  if (path.isAbsolute(name) || path.parse(name).root !== '') {
    throw new RangeError('File name must be relative');
  }

  const base = path.resolve(baseDir);
  const target = path.resolve(base, name);
  if (!isInside(base, target)) {
    throw new RangeError('File name points outside the base directory');
  }

  // Re-check after resolving symlinks so a link inside baseDir can't escape it.
  const realBase = await realpath(base);
  const realTarget = await realpath(target);
  if (!isInside(realBase, realTarget)) {
    throw new RangeError('File name points outside the base directory');
  }

  return readFile(realTarget, 'utf8');
}
