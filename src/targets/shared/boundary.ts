/**
 * "## Boundary" section renderer — shared by both target adapters.
 *
 * An agent's `relatedArtifacts` frontmatter (escalates-to / complements / see-also)
 * only becomes a rendered section when the related sibling is actually co-present in
 * the same install/build set — a standalone agent shouldn't tell the model to delegate
 * to something that isn't there. Both adapters needed this exact rendering; it was
 * previously copy-pasted verbatim in three places (claude-code/plugin-build.ts,
 * copilot/build-helpers.ts, copilot/scaffold.ts).
 *
 * @module
 */
import type { ResolvedArtifact, ResolvedCatalog } from '../../types';
import type { RelatedArtifact } from '../../schema';
import { basenameOfId } from '../../paths';

/**
 * Renders the "## Boundary" markdown block for `agent`, given the set of artifact IDs
 * being installed/built together. Returns `[]` (no section) when `installSet`/`catalog`
 * are omitted (standalone install — co-presence can't be known) or no related artifact
 * from `agent.frontmatter.relatedArtifacts` is present in `installSet`.
 */
export function renderBoundarySection(
  agent: ResolvedArtifact,
  installSet: Set<string> | undefined,
  catalog: ResolvedCatalog | undefined,
): string[] {
  if (!installSet || !catalog) return [];

  const related = (agent.frontmatter.relatedArtifacts as RelatedArtifact[] | undefined) ?? [];
  const coPresent = related.filter(r => r.id !== agent.id && installSet.has(r.id));
  if (coPresent.length === 0) return [];

  const escalates = coPresent.filter(r => r.relation === 'escalates-to');
  const complements = coPresent.filter(r => r.relation === 'complements');
  const seeAlso = coPresent.filter(r => r.relation === 'see-also');

  const formatEntry = (r: RelatedArtifact): string => {
    const sibling = catalog.byId.get(r.id);
    const name = (sibling?.frontmatter.name as string | undefined) ?? basenameOfId(r.id);
    const title = (sibling?.frontmatter.title as string | undefined) ?? name;
    return `- **${title}** (\`${name}\`) — ${r.reason}`;
  };

  const lines: string[] = ['## Boundary', ''];
  if (escalates.length > 0) {
    lines.push('Delegate specialized work to co-installed agents:');
    lines.push(...escalates.map(formatEntry));
    if (complements.length > 0 || seeAlso.length > 0) lines.push('');
  }
  if (complements.length > 0) {
    lines.push('Related specialists (distinct scope):');
    lines.push(...complements.map(formatEntry));
    if (seeAlso.length > 0) lines.push('');
  }
  if (seeAlso.length > 0) {
    lines.push('See also:');
    lines.push(...seeAlso.map(formatEntry));
  }
  lines.push('');
  return lines;
}
