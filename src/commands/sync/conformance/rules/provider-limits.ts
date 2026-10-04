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
import type { ResolvedArtifact, Target } from '../../../../types';
import type { ConformanceRule, ConformanceFinding } from '../types';
import type { KindEmitSpec, SpecLimit } from '../../../../targets/spec-types';
import { ALL_PROVIDER_SPECS } from '../../../../targets/all-emit-specs';
import { renderArtifact } from '../../../../targets/emit';
import { supportsKind } from '../../../../targets/capabilities';
import { artifactTargetsPlatform } from '../../../../select';
import { resolveCatalog } from '../../../../resolve';
import { parseFrontmatter } from '../../../../frontmatter-parse';

/** The file `spec` writes for `artifact`, or undefined when it refuses to render. */
function renderSafely(spec: KindEmitSpec, artifact: ResolvedArtifact): string | undefined {
  try {
    return renderArtifact(spec, artifact, spec.variant === 'plugin' ? { packName: 'pack' } : {});
  } catch {
    return undefined; // a render refusal is another rule's finding (e.g. tool-restriction-coverage)
  }
}

/** What a provider receives for one artifact through one spec, or undefined if it can't render. */
function emitted(
  spec: KindEmitSpec,
  artifact: ResolvedArtifact,
): Record<string, string> | undefined {
  const rendered = renderSafely(spec, artifact);
  if (rendered === undefined) return undefined;
  const { data, content } = parseFrontmatter(rendered);
  return {
    name: String(data.name ?? ''),
    description: String(data.description ?? ''),
    body: content,
  };
}

const measure = (text: string, limit: SpecLimit) =>
  limit.unit === 'lines' ? text.split('\n').length : text.length;

/** The specs of `target` for `artifact`'s kind that declare limits. */
function limitedSpecs(target: Target, artifact: ResolvedArtifact): KindEmitSpec[] {
  return ALL_PROVIDER_SPECS.filter(
    s => s.source.startsWith(`${target.name}/`) && s.spec.kind === artifact.kind && s.spec.limits,
  ).map(s => s.spec);
}

/** One finding per (provider, field) the artifact's emitted files exceed. */
function findingsFor(artifact: ResolvedArtifact, targets: readonly Target[]): ConformanceFinding[] {
  const seen = new Map<string, ConformanceFinding>();
  for (const target of targets.filter(t => artifactTargetsPlatform(artifact, t.name))) {
    if (!supportsKind(target, artifact.kind)) continue;
    for (const spec of limitedSpecs(target, artifact)) {
      const values = emitted(spec, artifact);
      for (const limit of values ? (spec.limits ?? []) : []) {
        const size = measure(values![limit.field] ?? '', limit);
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
    ruleId: 'provider-limits',
    severity: limit.severity,
    artifactId: artifact.id,
    filePath: artifact.filePath,
    provider,
    detail: `${provider} ${limit.field} is ${size} ${limit.unit}; the limit is ${limit.max} (${limit.doc.url})`,
  };
}

function detect(ctx: Parameters<ConformanceRule['detect']>[0]): ConformanceFinding[] {
  const resolved = resolveCatalog(ctx.catalog);
  return resolved.artifacts.flatMap(artifact => findingsFor(artifact, ctx.targets));
}

export const providerLimitsRule: ConformanceRule = {
  id: 'provider-limits',
  title: 'Emitted files stay within the size limits their provider documents',
  class: 'mechanical',
  appliesTo: {},
  rationale:
    'A provider may drop or reject a file past its documented limit (a skill name over 64 ' +
    "characters doesn't load in VS Code); the limits live on each emit spec as data.",
  detect,
};
