/**
 * The single generic renderer every KindEmitSpec is fed through — see spec-types.ts for why this
 * exists. One function replaces the ~10 hand-written per-kind builder functions per target;
 * the per-provider `spec/<kind>.ts` files supply only data, no rendering logic.
 */
import type { ResolvedArtifact } from '../types';
import type { KindEmitSpec, EmitContext, FieldMapping } from './spec-types';
import { applyLexicon } from './lexicon';
import { assertRestrictionsCarried } from './tool-restriction';

/**
 * Renders one FieldMapping's `key: value` line(s), or `''` to omit it entirely.
 *
 * A mapping is skipped without calling `serialize` when its `when` guard fails, or (unless
 * `alwaysEmit` is set) when the source value is absent — most mappings are "emit only if
 * authored." A mapping with `alwaysEmit: true` gets called even with `value === undefined`; its
 * `serialize` is then responsible for supplying a fallback (see Copilot's `applyTo`, which must
 * always be present, defaulting to "**" when `appliesTo` was never authored).
 */
function renderFieldMapping(mapping: FieldMapping, frontmatter: Record<string, unknown>): string {
  if (mapping.when && !mapping.when(frontmatter)) return '';
  const value = readDotPath(frontmatter, mapping.from);
  if (!mapping.alwaysEmit && (value === undefined || value === null)) return '';
  return mapping.serialize(value);
}

/** Reads a possibly-dotted path ('claude.model') out of a frontmatter object. */
function readDotPath(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc === undefined || acc === null || typeof acc !== 'object') return undefined;
    return (acc as Record<string, unknown>)[key];
  }, obj);
}

/** Builds the `---\n...\n---` frontmatter block, or `''` when nothing is emittable and allowed to be omitted. */
function renderFrontmatterBlock(spec: KindEmitSpec, frontmatter: Record<string, unknown>): string {
  const lines = spec.frontmatter
    .map(mapping => renderFieldMapping(mapping, frontmatter))
    .filter(line => line !== '');

  if (lines.length === 0 && !spec.emitEmptyFrontmatter) return '';
  return ['---', ...lines, '---'].join('\n');
}

/**
 * Renders every body section at the given position, concatenated with blank-line separation.
 * Each line is passed through the provider's lexicon (see ./lexicon.ts) — sections can inline
 * another artifact's catalog-authored body (e.g. a skill's "## Applied Rules" pulling in a rule's
 * resolvedBody), so this is not redundant with the lexicon pass on the artifact's own body below.
 */
function renderSections(
  spec: KindEmitSpec,
  artifact: ResolvedArtifact,
  ctx: EmitContext,
  position: 'before' | 'after',
): string[] {
  return spec.body
    .filter(section => section.position === position)
    .flatMap(section => section.render(artifact, ctx))
    .filter((line): line is string => line !== undefined)
    .map(line => applyLexicon(line, spec.lexicon));
}

/**
 * Renders one artifact through its KindEmitSpec: frontmatter block, `before` sections, the
 * artifact's own body (`resolvedBody ?? body` — see resolve.ts for what populates resolvedBody),
 * then `after` sections (e.g. Claude's "## Applied Rules", Copilot's "## Coding guidelines to
 * apply", both providers' "## Boundary"). This is the ONLY place any spec's output is assembled —
 * deriveContracts() (output-contract.ts) reads the same spec to verify what this function wrote.
 */
export function renderArtifact(
  spec: KindEmitSpec,
  artifact: ResolvedArtifact,
  ctx: EmitContext,
): string {
  assertRestrictionsCarried(spec, artifact);
  const frontmatterBlock = renderFrontmatterBlock(spec, artifact.frontmatter);
  const beforeLines = renderSections(spec, artifact, ctx, 'before');
  const rawBody = artifact.resolvedBody ?? artifact.body;
  const transformedBody = spec.bodyTransform ? spec.bodyTransform(rawBody) : rawBody;
  const ownBody = applyLexicon(transformedBody, spec.lexicon);
  const afterLines = renderSections(spec, artifact, ctx, 'after');

  const segments: string[] = [];
  if (frontmatterBlock) segments.push(frontmatterBlock, '');
  segments.push(...beforeLines, ownBody, ...afterLines);

  return segments.join('\n').trimEnd() + '\n';
}
