/**
 * Where an artifact sits in the catalog, read from its path relative to the catalog root:
 * `shared/<kindDir>/…` or `languages/<lang>/<kindDir>/…`. Folders above the root never count, so a
 * catalog kept under a folder named `shared` or `languages/<x>` reads the same as anywhere else.
 * Pure: no file system access. Folder and file names per kind come from KIND_REGISTRY.
 *
 * @module
 */
import path from 'node:path';
import type { ArtifactKind } from './types';
import { kindOfSourceFile } from './kinds';
import { ID_PART_COUNT } from './paths';

/** The namespace for artifacts that belong to no language. */
export const SHARED_NAMESPACE = 'shared';
/** The folder that holds one sub-folder per language. */
export const LANGUAGES_DIR = 'languages';
/** The fixed middle segment of a template id (`shared/templates/<name>`). */
const TEMPLATES_SEGMENT = 'templates';
const TEMPLATE_ID_PART_COUNT = 3;
/** `shared/<kindDir>/<file>` */
const SHARED_PATH_MIN_SEGMENTS = 3;
/** `languages/<lang>/<kindDir>/<file>` */
const LANGUAGE_PATH_MIN_SEGMENTS = 4;

/** What a source file's position says about it. Fields are absent when the path doesn't say. */
export interface SourceLocation {
  /** `shared`, or the language folder name. */
  readonly namespace?: string;
  /** The folder right under the namespace (`rules`, `skills`, …). */
  readonly kindDir?: string;
  /** The kind the file name implies. */
  readonly kind?: ArtifactKind;
}

/** Reads `filePath`'s namespace, kind folder and kind relative to `catalogRoot`. */
export function locateSource(catalogRoot: string, filePath: string): SourceLocation {
  const segments = path.relative(catalogRoot, filePath).split(path.sep);
  const kind = kindOfSourceFile(path.basename(filePath));
  const kindPart = kind ? { kind } : {};
  if (segments[0] === SHARED_NAMESPACE && segments.length >= SHARED_PATH_MIN_SEGMENTS) {
    return { namespace: SHARED_NAMESPACE, kindDir: segments[1]!, ...kindPart };
  }
  if (segments[0] === LANGUAGES_DIR && segments.length >= LANGUAGE_PATH_MIN_SEGMENTS) {
    return { namespace: segments[1]!, kindDir: segments[2]!, ...kindPart };
  }
  return kindPart;
}

/**
 * Splits an id into the namespace it names and the artifact name: `csharp/cs-release`, or for a
 * template `shared/templates/mcp-note`. Undefined when the id has the wrong shape for its kind.
 */
export function splitId(
  id: string,
  kind: ArtifactKind,
): { prefix: string; name: string } | undefined {
  const parts = id.split('/');
  if (kind === 'template') {
    const [prefix, middle, name] = parts;
    const ok = parts.length === TEMPLATE_ID_PART_COUNT && middle === TEMPLATES_SEGMENT;
    return ok && prefix && name ? { prefix, name } : undefined;
  }
  const [prefix, name] = parts;
  return parts.length === ID_PART_COUNT && prefix && name ? { prefix, name } : undefined;
}

/** The folder that holds namespace `prefix` (`shared` or a language) under `catalogRoot`. */
export function namespaceDir(catalogRoot: string, prefix: string): string {
  return prefix === SHARED_NAMESPACE
    ? path.join(catalogRoot, SHARED_NAMESPACE)
    : path.join(catalogRoot, LANGUAGES_DIR, prefix);
}
