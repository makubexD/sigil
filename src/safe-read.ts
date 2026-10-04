/**
 * The one way sigil reads a file it takes from a catalog or an import source. A catalog can be a
 * cloned third-party repository, and whatever sigil reads may be copied into the catalog and then
 * into every project that installs it, so the file must be a regular file — a symbolic link (or
 * Windows junction) is never followed, so a link to `~/.ssh/config` is not read — within a size
 * cap. The type and size are checked on the same open handle the content is read from, so the file
 * can't be swapped between the check and the read (on Windows, where O_NOFOLLOW does not exist, the
 * lstat before opening is the link check). Callers skip a rejected file with the returned reason.
 *
 * @module
 */
import fs from 'node:fs';

/** Refuses a symbolic link at open time where the platform supports it (not on Windows). */
const OPEN_FLAGS = fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0);
const KIB = 1024;

/** The reason text for a file that is a link or not a regular file. */
export const NOT_REGULAR_REASON = 'not a regular file (symbolic links are not followed)';

/** The file's content, or why it was not read. */
export type SafeRead = { content: string } | { reason: string };

export interface SafeReadLimit {
  /** Largest size, in bytes, the caller accepts. */
  readonly maxBytes: number;
  /** The reason to report for a file of `size` bytes over `maxBytes`. */
  readonly tooLarge?: (size: number) => string;
}

const defaultTooLarge = (maxBytes: number) => () => `larger than ${maxBytes / KIB} KiB`;

/** Opens `file` for reading without following a link; undefined when it is a link or can't open. */
function openNoFollow(file: string): number | undefined {
  if (!fs.lstatSync(file, { throwIfNoEntry: false })?.isFile()) return undefined;
  try {
    return fs.openSync(file, OPEN_FLAGS);
  } catch {
    return undefined;
  }
}

/** Checks and reads an open file: a regular file within the limit. */
function readOpened(fd: number, limit: SafeReadLimit): SafeRead {
  const stat = fs.fstatSync(fd);
  if (!stat.isFile()) return { reason: NOT_REGULAR_REASON };
  if (stat.size > limit.maxBytes) {
    return { reason: (limit.tooLarge ?? defaultTooLarge(limit.maxBytes))(stat.size) };
  }
  const buffer = Buffer.alloc(stat.size);
  const read = fs.readSync(fd, buffer, 0, stat.size, 0);
  return { content: buffer.subarray(0, read).toString('utf-8') };
}

/** Reads `file` through one open handle when it is a regular, non-link file within `limit`. */
export function readRegularFile(file: string, limit: SafeReadLimit): SafeRead {
  const fd = openNoFollow(file);
  if (fd === undefined) return { reason: NOT_REGULAR_REASON };
  try {
    return readOpened(fd, limit);
  } finally {
    fs.closeSync(fd);
  }
}
