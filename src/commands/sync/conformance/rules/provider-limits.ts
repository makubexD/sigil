/**
 * `provider-limits` — every emitted file stays within the size limits its provider documents.
 * Each KindEmitSpec declares its limits as data (`limits`); this rule renders every artifact through
 * each spec of each target the artifact ships to and measures what that provider actually receives
 * (the emitted `name`, `description` and body), so a new provider is checked the moment it declares
 * its limits. `error` limits are ones the provider enforces (a skill whose name breaks the spec
 * doesn't load); `warning` limits are guidance (SKILL.md under 500 lines). No `fix()`: shortening
 * prose is an author's call.
 *
 * @module
 */
import type { ResolvedArtifact, ResolvedCatalog, Target } from '../../../../types';
import type { ConformanceRule, ConformanceFinding } from '../types';
import type { EmitContext, KindEmitSpec, SpecLimit } from '../../../../targets/spec-types';
import { ALL_PROVIDER_SPECS } from '../../../../targets/all-emit-specs';
import { renderArtifact } from '../../../../targets/emit';
import { supportsKind } from '../../../../targets/capabilities';
import { artifactTargetsPlatform } from '../../../../select';
import { resolveCatalog } from '../../../../resolve';
import { parseFrontmatter } from '../../../../frontmatter-parse';

const RULE_ID = 'provider-limits';

/**
 * The file `spec` writes for `artifact`, measured at its largest: `ctx` co-installs everything, so
 * every Boundary section renders. Undefined when the spec refuses to render: that refusal is
 * another rule's finding (tool-restriction-coverage), reported there.
 */
function renderSafely(
  spec: KindEmitSpec,
  artifact: ResolvedArtifact,
  ctx: EmitContext,
): string | undefined {
  try {
    return renderArtifact(
      spec,
      artifact,
      spec.variant === 'plugin' ? { ...ctx, packName: 'pack' } : ctx,
    );
  } catch {
    return undefined;
  }
}

/** What a provider receives for one artifact through one spec, or undefined if it can't render. */
function emitted(
  spec: KindEmitSpec,
  artifact: ResolvedArtifact,
  ctx: EmitContext,
): Record<SpecLimit['field'], string> | undefined {
  const rendered = renderSafely(spec, artifact, ctx);
  if (rendered === undefined) return undefined;
  const { data, content } = parseFrontmatter(rendered);
  return {
    name: String(data.name ?? ''),
    description: String(data.description ?? ''),
    body: content.trim(),
  };
}

const measure = (text: string, limit: SpecLimit) =>
  limit.unit === 'lines' ? text.split('\n').length : text.length;

/** The specs of `target` for `artifact`'s kind that declare limits. */
function limitedSpecs(target: Target, artifact: ResolvedArtifact): KindEmitSpec[] {
  return ALL_PROVIDER_SPECS.filter(
    s => s.provider === target.name && s.spec.kind === artifact.kind && s.spec.limits,
  ).map(s => s.spec);
}

/**
 * One finding per (provider, field) the artifact's emitted files exceed. A provider with two
 * channels (Claude's plugin and scaffold specs) reports a field once, from whichever is over.
 */
function findingsFor(
  artifact: ResolvedArtifact,
  targets: readonly Target[],
  ctx: EmitContext,
): ConformanceFinding[] {
  const seen = new Map<string, ConformanceFinding>();
  for (const target of targets.filter(t => artifactTargetsPlatform(artifact, t.name))) {
    if (!supportsKind(target, artifact.kind)) continue;
    for (const spec of limitedSpecs(target, artifact)) {
      const values = emitted(spec, artifact, ctx);
      for (const limit of values ? (spec.limits ?? []) : []) {
        const size = measure(values![limit.field], limit);
        const key = `${target.name}:${limit.field}`;
        if (size <= limit.max || seen.has(key)) continue;
        seen.set(key, finding(artifact, target.name, limit, size));
      }
    }
  }
  return [...seen.values()];
}

function finding(
  artifact: ResolvedArtifact,
  provider: string,
  limit: SpecLimit,
  size: number,
): ConformanceFinding {
  return {
    ruleId: RULE_ID,
    severity: limit.severity,
    artifactId: artifact.id,
    filePath: artifact.filePath,
    provider,
    detail: `${provider} ${limit.field} is ${size} ${limit.unit}; the limit is ${limit.max} (${limit.doc.url})`,
  };
}

/** The resolved catalog, or the reason it can't be resolved (validate reports that in full). */
function resolveOrReason(catalog: Parameters<typeof resolveCatalog>[0]): ResolvedCatalog | string {
  try {
    return resolveCatalog(catalog);
  } catch (err) {
    return (err as Error).message;
  }
}

function detect(ctx: Parameters<ConformanceRule['detect']>[0]): ConformanceFinding[] {
  const resolved = resolveOrReason(ctx.catalog);
  if (typeof resolved === 'string') {
    const detail = `the catalog does not resolve, so limits were not checked: ${resolved}`;
    return [{ ruleId: RULE_ID, severity: 'warning', detail }];
  }
  const emitCtx: EmitContext = {
    catalog: resolved,
    installSet: new Set(resolved.artifacts.map(a => a.id)),
  };
  return resolved.artifacts.flatMap(artifact => findingsFor(artifact, ctx.targets, emitCtx));
}

export const providerLimitsRule: ConformanceRule = {
  id: RULE_ID,
  title: 'Emitted files stay within the size limits their provider documents',
  class: 'mechanical',
  appliesTo: {},
  rationale:
    'A provider may drop or reject a file past its documented limit (a skill name over 64 ' +
    "characters doesn't load in VS Code); the limits live on each emit spec as data.",
  detect,
};
