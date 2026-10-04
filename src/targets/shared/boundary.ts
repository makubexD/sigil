/**
 * "## Boundary" section renderer — shared by both target adapters.
 *
 * An agent's `relatedArtifacts` frontmatter (escalates-to / complements / see-also)
 * only becomes a rendered section when the related sibling is actually co-present in
 * the same install/build set — a standalone agent shouldn't tell the model to delegate
 * to something that isn't there. Both adapters needed this exact rendering; it was
 * once copy-pasted into three per-provider builders, since replaced by the emit specs.
 *
 * @module
 */
import type { ResolvedArtifact, ResolvedCatalog } from '../../types';
import type { RelatedArtifact } from '../../schema';
import { basenameOfId } from '../../paths';

/** Renders one related-artifact bullet line, resolving its display name/title from the catalog. */
function formatRelatedEntry(r: RelatedArtifact, catalog: ResolvedCatalog): string {
  const sibling = catalog.byId.get(r.id);
  const name = (sibling?.frontmatter.name as string | undefined) ?? basenameOfId(r.id);
  const title = (sibling?.frontmatter.title as string | undefined) ?? name;
  return `- **${title}** (\`${name}\`) — ${r.reason}`;
}

/** Parameters for {@link appendRelationGroup} beyond the shared `lines` accumulator. */
interface RelationGroupSpec {
  heading: string;
  group: RelatedArtifact[];
  catalog: ResolvedCatalog;
  trailingBlank: boolean;
}

/** Appends one relation-group's lines (heading + entries + optional trailing blank) if non-empty. */
function appendRelationGroup(lines: string[], spec: RelationGroupSpec): void {
  const { heading, group, catalog, trailingBlank } = spec;
  if (group.length === 0) return;
  lines.push(heading, ...group.map(r => formatRelatedEntry(r, catalog)));
  if (trailingBlank) lines.push('');
}

/** Splits co-present related artifacts into their three relation buckets. */
function splitByRelation(coPresent: RelatedArtifact[]): {
  escalates: RelatedArtifact[];
  complements: RelatedArtifact[];
  seeAlso: RelatedArtifact[];
} {
  return {
    escalates: coPresent.filter(r => r.relation === 'escalates-to'),
    complements: coPresent.filter(r => r.relation === 'complements'),
    seeAlso: coPresent.filter(r => r.relation === 'see-also'),
  };
}

/** Appends every relation group's lines, each with a trailing blank only if content follows it. */
function appendAllGroups(
  lines: string[],
  groups: Array<{ heading: string; items: RelatedArtifact[] }>,
  catalog: ResolvedCatalog,
): void {
  groups.forEach((group, i) => {
    const remainingHasContent = groups.slice(i + 1).some(g => g.items.length > 0);
    appendRelationGroup(lines, {
      heading: group.heading,
      group: group.items,
      catalog,
      trailingBlank: remainingHasContent,
    });
  });
}

/** Renders the body lines (all three relation-group sections) once buckets are known. */
function renderRelationGroups(
  escalates: RelatedArtifact[],
  complements: RelatedArtifact[],
  seeAlso: RelatedArtifact[],
  catalog: ResolvedCatalog,
): string[] {
  const groups = [
    { heading: 'Delegate specialized work to co-installed agents:', items: escalates },
    { heading: 'Related specialists (distinct scope):', items: complements },
    { heading: 'See also:', items: seeAlso },
  ];

  const lines: string[] = ['## Boundary', ''];
  appendAllGroups(lines, groups, catalog);
  lines.push('');
  return lines;
}

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

  const { escalates, complements, seeAlso } = splitByRelation(coPresent);
  return renderRelationGroups(escalates, complements, seeAlso, catalog);
}
