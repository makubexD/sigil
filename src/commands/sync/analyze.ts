/**
 * Pure drift analysis for `sigil sync` — no I/O, no writes. Compares every artifact that
 * declares `template:` against that template's current `slots:` declaration and literal prose,
 * classifying each deviation as `mechanical` (safe for `--apply`) or `review` (human-only).
 *
 * Reuses the same slot-parsing primitives validate/template-checks.ts already relies on
 * (src/templates.ts) rather than re-deriving composition rules — `sync` classifies and repairs
 * exactly what `validate` already reports as an error.
 *
 * @module
 */
import type { Artifact, LoadedCatalog } from '../../types';
import type { TemplateFrontmatter } from '../../schema/index';
import {
  parseArtifactSlotOrder,
  parseSlots,
  parseTemplateFrontmatter,
  parseTemplateSlotOrder,
  type TemplateSlotDef,
} from '../../templates';
import { allProviderDocRefs, allProviderSpecs } from '../../targets/all-emit-specs';
import type { SyncDrift, SyncFinding } from './types';

/** Minimum line length considered for the "prose already owned by the template" heuristic. */
const DUPLICATE_LINE_MIN_LENGTH = 40;
const DUPLICATE_LINE_PREVIEW_LENGTH = 60;

function truncate(line: string): string {
  return line.length <= DUPLICATE_LINE_PREVIEW_LENGTH
    ? line
    : `${line.slice(0, DUPLICATE_LINE_PREVIEW_LENGTH)}…`;
}

/** Non-slot-marker lines of at least DUPLICATE_LINE_MIN_LENGTH chars, trimmed — mirrors template-checks.ts. */
function literalLines(templateBody: string): Set<string> {
  return new Set(
    templateBody
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(l => l.length >= DUPLICATE_LINE_MIN_LENGTH && !l.includes('<!-- slot:')),
  );
}

/**
 * A declared slot the artifact doesn't fill but should. A slot filled under its OLD
 * (`renamedFrom`) key doesn't count as missing — that's a `slot-renamed` drift instead, and
 * `--apply` handles it by rewriting the marker, not by stamping a TODO stub over real content.
 */
function checkMissingRequired(
  slots: Record<string, string>,
  templateSlots: readonly TemplateSlotDef[],
): SyncDrift[] {
  return templateSlots
    .filter(
      def => def.required && !(def.key in slots) && !(def.renamedFrom && def.renamedFrom in slots),
    )
    .map(def => ({
      kind: 'missing-required-slot' as const,
      class: 'mechanical' as const,
      slotKey: def.key,
      detail: `artifact is missing required slot '${def.key}' — insert a TODO stub`,
    }));
}

/** One unknown-slot drift: a rename when the key matches a `renamedFrom`, else a removal. */
function unknownSlotDrift(key: string, renamedTo: Map<string, string>): SyncDrift {
  const newKey = renamedTo.get(key);
  if (newKey) {
    return {
      kind: 'slot-renamed',
      class: 'mechanical',
      slotKey: key,
      renameTo: newKey,
      detail: `slot '${key}' was renamed to '${newKey}' in the template — rewrite the marker`,
    };
  }
  return {
    kind: 'slot-removed',
    class: 'mechanical',
    slotKey: key,
    detail: `slot '${key}' is no longer declared by the template — remove the block`,
  };
}

/** A slot key the artifact fills that the template no longer declares — renamed or removed. */
function checkUnknownSlots(
  slots: Record<string, string>,
  templateSlots: readonly TemplateSlotDef[],
): SyncDrift[] {
  const declared = new Set(templateSlots.map(s => s.key));
  const renamedTo = new Map(
    templateSlots.filter(s => s.renamedFrom).map(s => [s.renamedFrom!, s.key]),
  );
  return Object.keys(slots)
    .filter(key => !declared.has(key))
    .map(key => unknownSlotDrift(key, renamedTo));
}

/** Slot content lines that duplicate prose the template already owns verbatim. */
function checkDuplicatedProse(slots: Record<string, string>, templateBody: string): SyncDrift[] {
  const owned = literalLines(templateBody);
  const drifts: SyncDrift[] = [];
  for (const [slotKey, content] of Object.entries(slots)) {
    for (const line of content.split(/\r?\n/).map(l => l.trim())) {
      if (!owned.has(line)) continue;
      drifts.push({
        kind: 'duplicated-prose',
        class: 'mechanical',
        slotKey,
        line,
        detail: `slot '${slotKey}' duplicates a line the template already owns: "${truncate(line)}"`,
      });
    }
  }
  return drifts;
}

/** Whether the artifact's slot marker order (for keys present in both) matches the template's. */
function checkSlotOrder(artifactBody: string, templateBody: string): SyncDrift[] {
  const templateOrder = parseTemplateSlotOrder(templateBody);
  const artifactOrder = parseArtifactSlotOrder(artifactBody);
  const templateRank = new Map(templateOrder.map((k, i) => [k, i]));
  const shared = artifactOrder.filter(k => templateRank.has(k));
  const expected = [...shared].sort((a, b) => templateRank.get(a)! - templateRank.get(b)!);
  const inOrder = shared.every((k, i) => k === expected[i]);
  if (inOrder) return [];
  return [
    {
      kind: 'slot-reordered',
      class: 'mechanical',
      detail: 'slot markers are out of sync with the template’s declared order — reorder blocks',
    },
  ];
}

/** Parses one artifact's slots and buckets any parse-level problem not covered above as `review`. */
function checkStructuralErrors(parseErrors: string[]): SyncDrift[] {
  return parseErrors.map(error => ({
    kind: 'structural-error' as const,
    class: 'review' as const,
    detail: error,
  }));
}

/** Analyzes one artifact against its declared template. Returns undefined when nothing drifted. */
function analyzeArtifact(
  artifact: Artifact,
  template: Artifact,
  templateFm: TemplateFrontmatter,
): SyncFinding | undefined {
  const { slots, errors: parseErrors } = parseSlots(artifact.body);
  const drifts: SyncDrift[] = [
    ...checkStructuralErrors(parseErrors),
    ...checkMissingRequired(slots, templateFm.slots),
    ...checkUnknownSlots(slots, templateFm.slots),
    ...checkDuplicatedProse(slots, template.body),
    ...checkSlotOrder(artifact.body, template.body),
  ];
  if (drifts.length === 0) return undefined;
  return { artifactId: artifact.id, filePath: artifact.filePath, templateId: template.id, drifts };
}

export interface StaleDoc {
  /** What cites this URL — a template id, or a provider spec/aggregate label. */
  readonly source: string;
  readonly url: string;
  readonly verifiedOn: string;
}

function staleCutoff(staleMonths: number): Date {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - staleMonths);
  return cutoff;
}

/**
 * A date that fails to parse is treated as stale, not fresh — the fail-safe direction. An
 * unparseable `verifiedOn` almost always means a typo, and treating it as "fresh" would let a
 * typo'd date silently disable `sigil sync --check`'s staleness gate instead of tripping it.
 */
function isStale(verifiedOn: string, cutoff: Date): boolean {
  const verified = new Date(verifiedOn);
  return Number.isNaN(verified.getTime()) || verified < cutoff;
}

/** Templates whose `docs[].verifiedOn` is older than `staleMonths` — folded into the sync report. */
export function findStaleDocs(catalog: LoadedCatalog, staleMonths: number): StaleDoc[] {
  const cutoff = staleCutoff(staleMonths);
  const stale: StaleDoc[] = [];
  for (const template of catalog.artifacts.filter(a => a.kind === 'template')) {
    const fm = parseTemplateFrontmatter(template);
    if (!fm) continue;
    for (const doc of fm.docs) {
      if (!isStale(doc.verifiedOn, cutoff)) continue;
      stale.push({ source: template.id, url: doc.url, verifiedOn: doc.verifiedOn });
    }
  }
  return stale;
}

/**
 * Every registered target's citation (spec `docs`, its `aggregateDocs` for files no spec renders,
 * and its capability rows) whose `verifiedOn` is older than `staleMonths`. This is what makes `KindEmitSpec.docs` actually
 * tracked, not just declared — see src/targets/all-emit-specs.ts.
 */
export function findStaleProviderDocs(staleMonths: number): StaleDoc[] {
  const cutoff = staleCutoff(staleMonths);
  return allProviderDocRefs()
    .filter(ref => isStale(ref.doc.verifiedOn, cutoff))
    .map(ref => ({
      source: ref.source,
      url: ref.doc.url,
      verifiedOn: ref.doc.verifiedOn,
    }));
}

/** Union of template-doc and provider-spec-doc staleness — the full `sigil sync --stale` report. */
export function findAllStaleDocs(catalog: LoadedCatalog, staleMonths: number): StaleDoc[] {
  return [...findStaleDocs(catalog, staleMonths), ...findStaleProviderDocs(staleMonths)];
}

export interface SupersededSpec {
  /** Provider-qualified label, e.g. "claude/prompt". */
  readonly source: string;
  readonly by: string;
  readonly note: string;
}

/**
 * Every registered provider spec carrying `KindEmitSpec.supersededBy` — surfaced by
 * `sigil sync --check` so a provider-level format supersession (Claude merging commands into
 * skills; VS Code steering `.prompt.md` toward agent skills) is discovered by running the gate,
 * not only by the next manual audit that happens to re-read the same docs.
 */
export function findSupersededSpecs(): SupersededSpec[] {
  return allProviderSpecs()
    .filter(({ spec }) => spec.supersededBy !== undefined)
    .map(({ source, spec }) => ({
      source,
      by: spec.supersededBy!.by,
      note: spec.supersededBy!.note,
    }));
}

/** Runs drift analysis over the whole catalog (or one template id when `templateFilter` is set). */
export function analyzeCatalog(catalog: LoadedCatalog, templateFilter?: string): SyncFinding[] {
  const findings: SyncFinding[] = [];
  for (const artifact of catalog.artifacts) {
    const templateId = artifact.frontmatter.template as string | undefined;
    if (!templateId) continue;
    if (templateFilter && templateId !== templateFilter) continue;

    const template = catalog.byId.get(templateId);
    if (!template || template.kind !== 'template') continue; // reported by `validate`, not `sync`

    const templateFm = parseTemplateFrontmatter(template);
    if (!templateFm) continue; // template's own schema errors are `validate`'s job

    const finding = analyzeArtifact(artifact, template, templateFm);
    if (finding) findings.push(finding);
  }
  return findings;
}
