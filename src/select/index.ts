/**
 * select — selector resolution, vocabulary, closure, and grouping helpers.
 *
 * Sub-modules:
 *   selection — resolveSelection, kind constants, language helpers (artifactLanguage, isAgnostic)
 *   vocabulary — kindNoun/kindPlural/kindHint, artifactLabel/artifactHint, artifactTargetsPlatform
 *   closure   — computeClosure, ClosureEntry, ClosurePreview
 *   grouping  — groupArtifactsByLanguage, availableKinds, buildLanguageOptions, partitionConfigKinds
 */

export type { SelectionFilters, SkippedArtifact, SelectionResult } from './selection';
export {
  KIND_ORDER,
  CONFIG_KINDS,
  artifactLanguage,
  isAgnostic,
  artifactTargetsPlatform,
} from './selection';
export { resolveSelection, type ResolveSelectionOptions } from './selector-resolve';

export { kindNoun, kindPlural, kindHint, artifactLabel, artifactHint } from './vocabulary';

export type { ClosureEntry, ClosurePreview } from './closure';
export { computeClosure } from './closure';

export {
  availableKinds,
  buildLanguageOptions,
  hasLanguageChoice,
  groupArtifactsByLanguage,
  partitionConfigKinds,
} from './grouping';
