import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';

/** True when `target` is strictly inside `dir` (not `dir` itself). Both must be absolute. */
function isInside(dir: string, target: string): boolean {
  const rel = path.relative(dir, target);
  return (
    rel !== '' &&
    rel !== '..' &&
    !rel.startsWith('..' + path.sep) &&
    !path.isAbsolute(rel)
  );
}

/**
 * Reads the UTF-8 contents of the file `name`, relative to `baseDir`.
 *
 * `name` is untrusted input. Rejects with a `RangeError` when it is absolute (or, on Windows,
 * drive-relative like `C:foo`) or resolves anywhere outside `baseDir` — including via `..`
 * segments or symlinks/junctions inside `baseDir` that point elsewhere.
 * Other failures (missing file, permissions) reject with the underlying fs error.
 */
export async function readUserFile(baseDir: string, name: string): Promise<string> {
  if (name.includes('\0')) {
    throw new RangeError('File name contains a NUL byte');
  }
  // A root covers absolute paths plus Windows drive-relative (`C:foo`) and rooted (`\foo`) ones.
  if (path.isAbsolute(name) || path.parse(name).root !== '') {
    throw new RangeError(`File name must be relative: ${JSON.stringify(name)}`);
  }

  const base = path.resolve(baseDir);
  const target = path.resolve(base, name);
  if (!isInside(base, target)) {
    throw new RangeError(`File name escapes the base directory: ${JSON.stringify(name)}`);
  }

  // The lexical check above can't see symlinks, so compare the real locations too.
  const realBase = await realpath(base);
  const realTarget = await realpath(target);
  if (!isInside(realBase, realTarget)) {
    throw new RangeError(`File name escapes the base directory: ${JSON.stringify(name)}`);
  }

  // Read the resolved path rather than `target` so a link swapped in after the check isn't followed.
  return readFile(realTarget, 'utf8');
}
