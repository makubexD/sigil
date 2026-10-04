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
import { KIND_REGISTRY, kindOfSourceFile } from './kinds';
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

/** What the layout checks need to know about an artifact. */
export interface PlacedArtifact {
  readonly id: string;
  readonly kind: ArtifactKind;
  readonly filePath: string;
  readonly frontmatter: Record<string, unknown>;
}

/** The registered languages (any lookup by language id). */
export interface LanguageRegistry {
  has(language: string): boolean;
}

/**
 * Problems with the namespace itself: a shared artifact that names a language, or a language
 * folder with no language.yaml. Shared by `sigil check` (checkNamespace) and `catalog-layout`.
 */
export function namespaceProblems(
  catalogRoot: string,
  languages: LanguageRegistry,
  artifact: PlacedArtifact,
): string[] {
  const { namespace } = locateSource(catalogRoot, artifact.filePath);
  if (namespace === SHARED_NAMESPACE && artifact.frontmatter.language !== undefined) {
    return [
      'a shared artifact must not set language: — drop it, or move the artifact under languages/<lang>/',
    ];
  }
  if (namespace && namespace !== SHARED_NAMESPACE && !languages.has(namespace)) {
    return [
      `language '${namespace}' has no languages/${namespace}/language.yaml — add one (sigil import --create-language does) or use an existing language`,
    ];
  }
  return [];
}

/** Every layout problem with where `artifact` sits and what its frontmatter says about it. */
export function positionProblems(
  catalogRoot: string,
  languages: LanguageRegistry,
  artifact: PlacedArtifact,
): string[] {
  const location = locateSource(catalogRoot, artifact.filePath);
  if (!location.namespace) return ['sits outside both namespaces (shared/ or languages/<lang>/)'];
  return [
    ...idProblems(artifact, location.namespace),
    ...folderProblems(artifact, location.kindDir),
    ...languageFieldProblems(artifact, location.namespace),
    ...namespaceProblems(catalogRoot, languages, artifact),
  ];
}

function idProblems(artifact: PlacedArtifact, namespace: string): string[] {
  const prefix = splitId(artifact.id, artifact.kind)?.prefix;
  return prefix && prefix !== namespace
    ? [`id prefix '${prefix}' doesn't match its namespace folder '${namespace}'`]
    : [];
}

function folderProblems(artifact: PlacedArtifact, kindDir: string | undefined): string[] {
  const descriptor = KIND_REGISTRY[artifact.kind];
  const problems: string[] = [];
  if (kindDir !== descriptor.sourceDir) {
    problems.push(
      `a ${artifact.kind} belongs in ${descriptor.sourceDir}/, not ${kindDir ?? '(none)'}/`,
    );
  }
  const name = artifact.frontmatter.name;
  const folder = path.basename(path.dirname(artifact.filePath));
  if (descriptor.isDirectoryBacked && typeof name === 'string' && folder !== name) {
    problems.push(`skill folder '${folder}' doesn't match name '${name}'`);
  }
  return problems;
}

function languageFieldProblems(artifact: PlacedArtifact, namespace: string): string[] {
  const language = artifact.frontmatter.language;
  if (namespace === SHARED_NAMESPACE || language === undefined || language === namespace) return [];
  return [`language: '${String(language)}' doesn't match its namespace folder '${namespace}'`];
}
