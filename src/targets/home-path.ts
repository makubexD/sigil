/**
 * How the plugin readers name a file in a warning or an overlap's `source`: a path under the
 * user's home as `~/…`, with `/` separators on every OS, so the wording is the same on Windows.
 *
 * @module
 */
import path from 'node:path';

/** `file` named with `homeDir` as `~` and `/` separators; a path outside the home is unchanged. */
export function homeDisplayPath(file: string, homeDir: string): string {
  const prefix = homeDir.endsWith(path.sep) ? homeDir : `${homeDir}${path.sep}`;
  if (!file.startsWith(prefix)) return file;
  return `~${file.slice(homeDir.length).split(path.sep).join('/')}`;
}
