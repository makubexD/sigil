import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';

/** True when `target` is strictly inside `base` (both absolute, normalized). */
function isInside(base: string, target: string): boolean {
  const rel = path.relative(base, target);
  return (
    rel !== '' &&
    rel !== '..' &&
    !rel.startsWith('..' + path.sep) &&
    // On Windows, a target on another drive yields an absolute "relative" path.
    !path.isAbsolute(rel)
  );
}

/**
 * Read the UTF-8 file `name`, resolved relative to `baseDir`.
 *
 * `name` is untrusted. Rejects with a RangeError if it is empty, absolute, contains a NUL byte,
 * or resolves (lexically or through symlinks) to anything other than a file path inside
 * `baseDir`. Filesystem errors such as ENOENT are passed through unchanged.
 */
export async function readUserFile(baseDir: string, name: string): Promise<string> {
  if (name === '' || name.includes('\0')) {
    throw new RangeError('Invalid file name');
  }
  // On Windows a colon means a drive ("C:foo" is drive-relative, not absolute) or an NTFS
  // alternate data stream ("file.txt:hidden"); neither is a legitimate upload name.
  if (path.isAbsolute(name) || (process.platform === 'win32' && name.includes(':'))) {
    throw new RangeError('File name must be relative');
  }

  // Lexical check first, so traversal is rejected without touching the filesystem.
  const base = path.resolve(baseDir);
  const target = path.resolve(base, name);
  if (!isInside(base, target)) {
    throw new RangeError('File name points outside the base directory');
  }

  // Then re-check after resolving symlinks, so a link inside baseDir can't lead out of it.
  const realBase = await realpath(base);
  const realTarget = await realpath(target);
  if (!isInside(realBase, realTarget)) {
    throw new RangeError('File name points outside the base directory');
  }

  return readFile(realTarget, 'utf8');
}
