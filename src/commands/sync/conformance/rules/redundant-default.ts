/**
 * `redundant-default` — a frontmatter key whose authored value deep-equals that key's zod schema
 * default is pure noise: it changes nothing (the field would resolve to the exact same value if
 * omitted), it costs a source line every artifact of that kind repeats forever, and a reader has
 * no way to tell "explicitly reasserted" from "the author didn't think about it" apart. The
 * concrete instances found by the 2026-08-10 frontmatter audit: `severity: recommended` (35
 * files) and `extends: []` (27 files) — both exactly the RuleSchema default (schema/index.ts).
 *
 * Derived from `getSchema(kind)`'s live zod shape (`_def.defaultValue()` on a `ZodDefault`
 * wrapper), not a hand-listed field/value pair — so a future default change (e.g. `severity`'s
 * default flipping to `required`) is caught automatically instead of needing a matching rule edit.
 *
 * The fix is a pure deletion (`frontmatterPatch: { [key]: undefined }`), so this is `mechanical`.
 *
 * @module
 */
import { z } from 'zod';
import { getSchema } from '../../../../schema/index';
import type { ConformanceRule, ConformanceFinding, ArtifactEdit } from '../types';

/** Deep-equality good enough for frontmatter values: primitives, arrays, and plain objects. */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]));
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const aKeys = Object.keys(a as Record<string, unknown>);
    const bKeys = Object.keys(b as Record<string, unknown>);
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every(k =>
      deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
    );
  }
  return false;
}

/** The schema default for one field, or `undefined` if that field has no `ZodDefault` wrapper. */
function fieldDefault(shape: z.ZodRawShape, key: string): unknown {
  const field = shape[key];
  if (!field || field._def.typeName !== 'ZodDefault') return undefined;
  return (field._def as { defaultValue: () => unknown }).defaultValue();
}

/** Findings for one artifact's redundant-default keys, given its kind's zod shape. */
function findingsForArtifact(
  artifact: Parameters<ConformanceRule['detect']>[0]['catalog']['artifacts'][number],
  shape: z.ZodRawShape,
): ConformanceFinding[] {
  const findings: ConformanceFinding[] = [];
  for (const [key, value] of Object.entries(artifact.frontmatter)) {
    if (value === undefined) continue;
    const def = fieldDefault(shape, key);
    if (def === undefined || !deepEqual(value, def)) continue;
    findings.push({
      ruleId: 'redundant-default',
      severity: 'warning',
      artifactId: artifact.id,
      filePath: artifact.filePath,
      // key='<name>' prefix is a stable, exactly-parseable marker fix() reads back — needed
      // because one artifact can have >1 finding (e.g. both severity and extends), and fix()
      // is called per-finding against a frontmatter snapshot that doesn't reflect earlier
      // findings' fixes yet (detect() ran once, up front) — see fix()'s comment below.
      detail: `key='${key}' value=${JSON.stringify(value)} matches the schema default exactly — redundant, safe to omit`,
    });
  }
  return findings;
}

function detect(ctx: Parameters<ConformanceRule['detect']>[0]): ConformanceFinding[] {
  const findings: ConformanceFinding[] = [];
  for (const artifact of ctx.catalog.artifacts) {
    const schema = getSchema(artifact.kind);
    const shape = (schema as z.ZodObject<z.ZodRawShape>).shape;
    findings.push(...findingsForArtifact(artifact, shape));
  }
  return findings;
}

/**
 * Reads the key `detect()` encoded in `finding.detail` (see its comment) rather than recomputing
 * "which authored field matches its default" from `ctx` — each of an artifact's N findings must
 * resolve to its OWN key, and `ctx.catalog` still reflects the pre-fix frontmatter for every
 * finding (findings are all computed once, up front, by one `detect()` pass) — recomputing would
 * pick the same (e.g. first) redundant key for every finding on that artifact instead of each one.
 */
function fix(
  finding: ConformanceFinding,
  ctx: Parameters<ConformanceRule['detect']>[0],
): ArtifactEdit | undefined {
  if (!finding.artifactId || !finding.filePath) return undefined;
  const artifact = ctx.catalog.byId.get(finding.artifactId);
  if (!artifact) return undefined;
  const key = finding.detail.match(/^key='([^']+)'/)?.[1];
  if (!key) return undefined;
  return {
    artifactId: artifact.id,
    filePath: artifact.filePath,
    frontmatterPatch: { [key]: undefined },
  };
}

export const redundantDefaultRule: ConformanceRule = {
  id: 'redundant-default',
  title: 'A frontmatter value matching the schema default is redundant',
  class: 'mechanical',
  appliesTo: {},
  rationale:
    'A field explicitly set to its own schema default changes nothing at resolve time — pure ' +
    'source noise a reader cannot distinguish from an author-considered choice.',
  detect,
  fix,
};
