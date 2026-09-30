/**
 * §9: `template` kind structural checks — everything the artifact/template pairing must satisfy
 * for src/resolve.ts's composition step to produce a defined result. See src/templates.ts for
 * the shared slot-parsing/composition logic this reuses (kept out of resolve.ts so validate does
 * not have to import resolve, preserving the load → validate → resolve one-way dependency order).
 */
import type { Artifact } from '../types';
import type { TemplateFrontmatter } from '../schema/index';
import {
  composeTemplate,
  parseSlots,
  parseTemplateFrontmatter,
  type TemplateSlotDef,
} from '../templates';
import type { ValidateCtx } from './types';

const STALE_DOCS_MONTHS = 6;
/** Minimum line length considered for the "prose already owned by the template" heuristic. */
const DUPLICATE_LINE_MIN_LENGTH = 40;
/** Characters of a duplicated line shown in the error message before truncating with an ellipsis. */
const DUPLICATE_LINE_PREVIEW_LENGTH = 60;

function isTemplateArtifact(a: Artifact): boolean {
  return a.kind === 'template';
}

/** Non-slot-marker lines of at least DUPLICATE_LINE_MIN_LENGTH chars, trimmed. */
function literalLines(templateBody: string): Set<string> {
  const lines = templateBody
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length >= DUPLICATE_LINE_MIN_LENGTH && !l.includes('<!-- slot:'));
  return new Set(lines);
}

function truncate(line: string): string {
  if (line.length <= DUPLICATE_LINE_PREVIEW_LENGTH) return line;
  return `${line.slice(0, DUPLICATE_LINE_PREVIEW_LENGTH)}…`;
}

/** Bundles the (ctx, artifact, template) triple every helper below needs, to stay under max-params. */
interface TemplateCheckCtx {
  readonly ctx: ValidateCtx;
  readonly artifact: Artifact;
  readonly templateId: string;
  readonly template: Artifact;
}

/** §9b: pushes an error for each slot line that duplicates prose the template already owns. */
function checkNoDuplicatedProse(tc: TemplateCheckCtx, slots: Record<string, string>): void {
  const owned = literalLines(tc.template.body);
  for (const [slotKey, content] of Object.entries(slots)) {
    for (const line of content.split(/\r?\n/).map(l => l.trim())) {
      if (!owned.has(line)) continue;
      tc.ctx.errors.push({
        artifactId: tc.artifact.id,
        filePath: tc.artifact.filePath,
        error:
          `slot '${slotKey}' duplicates a line the template '${tc.templateId}' already owns ` +
          `verbatim — delete it from this artifact; the template supplies it: "${truncate(line)}"`,
      });
    }
  }
}

/** §9a: composes the artifact against its template and reports every structural problem found. */
function checkSlotComposition(tc: TemplateCheckCtx, slotDefs: readonly TemplateSlotDef[]): void {
  const { slots, errors } = composeTemplate(tc.template.body, slotDefs, tc.artifact.body);
  for (const error of errors) {
    tc.ctx.errors.push({
      artifactId: tc.artifact.id,
      filePath: tc.artifact.filePath,
      error: `template: ${error}`,
    });
  }
  checkNoDuplicatedProse(tc, slots);
}

function pushKindMismatch(tc: TemplateCheckCtx, templateFm: TemplateFrontmatter): void {
  tc.ctx.errors.push({
    artifactId: tc.artifact.id,
    filePath: tc.artifact.filePath,
    error:
      `template: '${tc.templateId}' applies to kinds [${templateFm.appliesToKind.join(', ')}], ` +
      `not '${tc.artifact.kind}'`,
  });
}

/**
 * An artifact declaring `template:` must reference an existing `kind: template` artifact whose
 * `appliesToKind` includes this artifact's own kind (§9a), its slot content must satisfy that
 * template's slots: (no unknown keys, all required keys present, no structural parse errors —
 * §9a), and no slot may duplicate a line of prose the template already owns verbatim (§9b) — once
 * prose is hoisted into the template, pasting it back into an artifact silently reintroduces the
 * duplication this whole mechanism exists to remove.
 *
 * Existence and kind-mismatch on `template:` itself are NOT re-checked here — src/refs.ts already
 * walks `template` as a reference field (alongside `extends`/`uses.*`) and §2's
 * checkReferenceIntegrity reports those two problems in the shared reference-graph wording. This
 * function only runs the checks that require the template to already be known-valid.
 */
export function checkArtifactTemplate(ctx: ValidateCtx, artifact: Artifact): void {
  const templateId = artifact.frontmatter.template as string | undefined;
  if (!templateId) return;

  const template = ctx.catalog.byId.get(templateId);
  if (!template || !isTemplateArtifact(template)) return; // reported by §2, not here

  const templateFm = parseTemplateFrontmatter(template);
  if (!templateFm) return; // template's own schema errors are reported when IT is validated

  const tc: TemplateCheckCtx = { ctx, artifact, templateId, template };
  if (!templateFm.appliesToKind.includes(artifact.kind)) {
    pushKindMismatch(tc, templateFm);
    return;
  }

  checkSlotComposition(tc, templateFm.slots);
}

/** Slot keys every artifact in the catalog fills, grouped by the template id it composes against. */
function collectFilledSlotsByTemplate(ctx: ValidateCtx): Map<string, Set<string>> {
  const filledByTemplate = new Map<string, Set<string>>();
  for (const artifact of ctx.catalog.artifacts) {
    const templateId = artifact.frontmatter.template as string | undefined;
    if (!templateId) continue;
    const { slots } = parseSlots(artifact.body);
    const set = filledByTemplate.get(templateId) ?? new Set<string>();
    for (const key of Object.keys(slots)) set.add(key);
    filledByTemplate.set(templateId, set);
  }
  return filledByTemplate;
}

function warnUnfilledSlots(
  ctx: ValidateCtx,
  template: Artifact,
  fm: TemplateFrontmatter,
  filled: Set<string>,
): void {
  for (const slot of fm.slots) {
    if (filled.has(slot.key)) continue;
    ctx.warnings.push(
      `[${template.id}] slot '${slot.key}' is declared but no artifact currently fills it`,
    );
  }
}

/** §9c (warning): a template slot that no artifact in the whole catalog ever fills. */
export function checkUnusedTemplateSlots(ctx: ValidateCtx): void {
  const templates = ctx.catalog.artifacts.filter(isTemplateArtifact);
  if (templates.length === 0) return;

  const filledByTemplate = collectFilledSlotsByTemplate(ctx);
  for (const template of templates) {
    const fm = parseTemplateFrontmatter(template);
    if (!fm) continue;
    warnUnfilledSlots(ctx, template, fm, filledByTemplate.get(template.id) ?? new Set<string>());
  }
}

function staleDocsCutoff(): Date {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - STALE_DOCS_MONTHS);
  return cutoff;
}

function warnStaleDocs(ctx: ValidateCtx, template: Artifact, fm: TemplateFrontmatter): void {
  const cutoff = staleDocsCutoff();
  for (const doc of fm.docs) {
    const verified = new Date(doc.verifiedOn);
    if (Number.isNaN(verified.getTime()) || verified >= cutoff) continue;
    ctx.warnings.push(
      `[${template.id}] docs entry '${doc.url}' was last verified ${doc.verifiedOn} ` +
        `(> ${STALE_DOCS_MONTHS} months ago) — re-check it still describes the current structure`,
    );
  }
}

/** §9d (warning): a template's `docs[].verifiedOn` older than STALE_DOCS_MONTHS. */
export function checkTemplateDocsFreshness(ctx: ValidateCtx): void {
  for (const template of ctx.catalog.artifacts.filter(isTemplateArtifact)) {
    const fm = parseTemplateFrontmatter(template);
    if (!fm) continue;
    warnStaleDocs(ctx, template, fm);
  }
}

/** Runs every catalog-wide (non-per-artifact) template check. Call once per validateCatalog run. */
export function checkTemplatesCatalogWide(ctx: ValidateCtx): void {
  checkUnusedTemplateSlots(ctx);
  checkTemplateDocsFreshness(ctx);
}
