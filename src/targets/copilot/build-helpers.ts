/**
 * Full-build helpers for the GitHub Copilot target.
 *
 * The one hand-rolled aggregate, which no KindEmitSpec renders: .github/copilot-instructions.md
 * (repo-wide rules). Per-artifact files go through src/targets/emit-files.ts.
 */
import type { ResolvedArtifact } from '../../types';
import { COPILOT_LEXICON } from './lexicon';
import { renderRulesDocument } from '../shared/repo-wide-rules';

/**
 * Builds .github/copilot-instructions.md from shared (cross-language) rules.
 *
 * No KindEmitSpec backs this aggregate (it has no per-artifact frontmatter to map), so its
 * citation is declared directly: see COPILOT_INSTRUCTIONS_DOC (../doc-refs.ts), tracked for
 * staleness via the target's aggregateDocs (copilot/aggregate-docs.ts). Because this bypasses
 * renderArtifact entirely, it passes the lexicon itself.
 */
export function buildCopilotInstructions(sharedRules: ResolvedArtifact[]): string {
  return renderRulesDocument('# Copilot Instructions', sharedRules, COPILOT_LEXICON);
}
