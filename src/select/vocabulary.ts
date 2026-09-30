/**
 * Per-target kind vocabulary helpers.
 *
 * Each Target adapter can declare a `vocabulary` mapping catalog kinds to the
 * platform's native names (noun, plural, hint). These helpers look up the mapping
 * with a clear fallback so callers never need to branch on "is vocabulary present?".
 *
 * Also provides artifact label/hint formatters for picker display.
 */
import type { ResolvedArtifact, ArtifactKind, Target } from '../types';
import { artifactLanguage } from './selection';

/**
 * Returns the platform's native singular noun for a catalog kind.
 * Falls back to the raw catalog kind string when no vocabulary is declared.
 *
 * Examples:
 *   kindNoun(claudeTarget, 'prompt')  → 'command'        (Claude: prompts → custom commands)
 *   kindNoun(copilotTarget, 'rule')   → 'instructions'   (Copilot: rules → instructions files)
 *   kindNoun(undefined, 'skill')      → 'skill'          (no target: neutral catalog term)
 */
export function kindNoun(target: Target | undefined, kind: string): string {
  return target?.vocabulary?.[kind as ArtifactKind]?.noun ?? kind;
}

/**
 * Returns the platform's native plural label for a catalog kind.
 * Falls back to a simple capitalised plural (e.g. 'Prompts') when not declared.
 *
 * Examples:
 *   kindPlural(claudeTarget, 'prompt')  → 'Commands'
 *   kindPlural(copilotTarget, 'rule')   → 'Instructions'
 *   kindPlural(undefined, 'skill')      → 'Skills'
 */
export function kindPlural(target: Target | undefined, kind: string): string {
  return (
    target?.vocabulary?.[kind as ArtifactKind]?.plural ??
    kind.charAt(0).toUpperCase() + kind.slice(1) + 's'
  );
}

/**
 * Returns the platform's native hint for a catalog kind, or undefined if none is declared.
 * Used to populate picker hints in the wizard "By kind" step.
 */
export function kindHint(target: Target | undefined, kind: string): string | undefined {
  return target?.vocabulary?.[kind as ArtifactKind]?.hint;
}

/** Returns a human-readable label for an artifact (used in wizard choices). */
export function artifactLabel(a: ResolvedArtifact): string {
  const lang = artifactLanguage(a);
  const langTag = lang ? ` [${lang}]` : '';
  return `${a.id}${langTag}`;
}

/** Returns a hint string for an artifact (used in wizard choices). */
export function artifactHint(a: ResolvedArtifact): string {
  return (a.frontmatter.description as string | undefined) ?? '';
}
