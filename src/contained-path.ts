/**
 * Path containment, as a leaf module (no project imports beyond the error type) so low layers such
 * as the manifest can use it without pulling in the CLI helpers.
 *
 * @module
 */
import path from 'path';
import { SigilError } from './errors';

/**
 * Resolves `relPath` under `outputDir` and throws if it escapes — defense-in-depth against a
 * malformed `FileMap` key reaching the write path (schema-level `id`/`name` regexes are the
 * primary guard; this is the second net in case a target's own path template is ever wrong).
 * See docs/decisions/catalog-benchmark-audit-2026-08-22.md F22.
 */
export function resolveContained(outputDir: string, relPath: string): string {
  const root = path.resolve(outputDir);
  const full = path.resolve(root, relPath);
  if (full !== root && !full.startsWith(root + path.sep)) {
    throw new SigilError(`Refusing to write outside output directory: ${relPath}`);
  }
  return full;
}
