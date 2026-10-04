/**
 * `sigil sync --apply` — writes the `mechanical` drifts analyze.ts found. Never touches a
 * `review`-classified drift; those are reported only (see render.ts).
 *
 * @module
 */
import fs from 'fs';
import { parseFrontmatter } from '../../frontmatter-parse';
import type { Artifact, LoadedCatalog } from '../../types';
import type { TemplateFrontmatter } from '../../schema/index';
import {
  parseTemplateFrontmatter,
  parseTemplateSlotOrder,
  splitArtifactSlotBlocks,
} from '../../templates';
import type { SyncDrift, SyncFinding } from './types';

/** Slot keys marked `slot-removed` — dropped entirely from the rebuilt body. */
function removedKeys(drifts: readonly SyncDrift[]): Set<string> {
  return new Set(drifts.filter(d => d.kind === 'slot-removed').map(d => d.slotKey!));
}

/** old key → new key, from every `slot-renamed` drift. */
function renameMap(drifts: readonly SyncDrift[]): Map<string, string> {
  return new Map(
    drifts.filter(d => d.kind === 'slot-renamed' && d.renameTo).map(d => [d.slotKey!, d.renameTo!]),
  );
}

/** slot key → set of exact lines to strip, from every `duplicated-prose` drift. */
function dupLinesBySlot(drifts: readonly SyncDrift[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const d of drifts) {
    if (d.kind !== 'duplicated-prose' || !d.slotKey || !d.line) continue;
    const set = map.get(d.slotKey) ?? new Set<string>();
    set.add(d.line);
    map.set(d.slotKey, set);
  }
  return map;
}

function stripDupLines(content: string, dupLines: Set<string> | undefined): string {
  if (!dupLines) return content;
  return content
    .split(/\r?\n/)
    .filter(line => !dupLines.has(line.trim()))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Rebuilds the artifact's key→content map: applies removals, renames, and prose stripping. */
function rebuildSlotContents(
  artifactBody: string,
  drifts: readonly SyncDrift[],
): Map<string, string> {
  const removed = removedKeys(drifts);
  const renames = renameMap(drifts);
  const dupLines = dupLinesBySlot(drifts);

  const result = new Map<string, string>();
  for (const block of splitArtifactSlotBlocks(artifactBody)) {
    if (removed.has(block.key)) continue;
    const finalKey = renames.get(block.key) ?? block.key;
    result.set(finalKey, stripDupLines(block.content, dupLines.get(block.key)));
  }
  return result;
}

/** Inserts a `TODO:` stub for every `missing-required-slot` drift. */
function insertMissingRequiredStubs(
  contents: Map<string, string>,
  drifts: readonly SyncDrift[],
  templateFm: TemplateFrontmatter,
): void {
  for (const d of drifts) {
    if (d.kind !== 'missing-required-slot' || !d.slotKey) continue;
    const def = templateFm.slots.find(s => s.key === d.slotKey);
    contents.set(d.slotKey, `TODO: ${def?.description ?? `fill in slot '${d.slotKey}'`}`);
  }
}

/** Orders slot keys by the template's declared marker order; unknown keys (should be none) trail. */
function orderKeys(keys: readonly string[], templateOrder: readonly string[]): string[] {
  const rank = new Map(templateOrder.map((k, i) => [k, i]));
  return [...keys].sort((a, b) => (rank.get(a) ?? Infinity) - (rank.get(b) ?? Infinity));
}

function serializeBody(contents: Map<string, string>, templateOrder: readonly string[]): string {
  const ordered = orderKeys([...contents.keys()], templateOrder);
  return `${ordered.map(key => `<!-- slot: ${key} -->\n${contents.get(key)}`).join('\n\n')}\n`;
}

/** Computes the rebuilt body for one finding's mechanical drifts, or undefined if none apply. */
export function buildRebuiltBody(
  artifact: Artifact,
  template: Artifact,
  templateFm: TemplateFrontmatter,
  finding: SyncFinding,
): string | undefined {
  const mechanical = finding.drifts.filter(d => d.class === 'mechanical');
  if (mechanical.length === 0) return undefined;

  const contents = rebuildSlotContents(artifact.body, mechanical);
  insertMissingRequiredStubs(contents, mechanical, templateFm);
  const templateOrder = parseTemplateSlotOrder(template.body);
  return serializeBody(contents, templateOrder);
}

/** Writes `newBody` to `filePath`, preserving the frontmatter block byte-for-byte. */
function writeArtifactBody(filePath: string, newBody: string): void {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const parsed = parseFrontmatter(raw);
  const contentStart = raw.indexOf(parsed.content);
  fs.writeFileSync(filePath, raw.slice(0, contentStart) + newBody, 'utf-8');
}

export interface ApplyResult {
  readonly artifactId: string;
  readonly filePath: string;
  readonly appliedDrifts: number;
  readonly skippedReviewDrifts: number;
}

/** Result for a finding with no mechanical fix — review-only, or nothing to report. */
function reviewOnlyResult(artifact: Artifact, reviewCount: number): ApplyResult | undefined {
  if (reviewCount === 0) return undefined;
  return {
    artifactId: artifact.id,
    filePath: artifact.filePath,
    appliedDrifts: 0,
    skippedReviewDrifts: reviewCount,
  };
}

/** Applies one finding's mechanical drifts (if any) and returns its result, or undefined to skip. */
function applyOneFinding(catalog: LoadedCatalog, finding: SyncFinding): ApplyResult | undefined {
  const artifact = catalog.byId.get(finding.artifactId);
  const template = catalog.byId.get(finding.templateId);
  if (!artifact || !template) return undefined;
  const templateFm = parseTemplateFrontmatter(template);
  if (!templateFm) return undefined;

  const reviewCount = finding.drifts.filter(d => d.class === 'review').length;
  const rebuilt = buildRebuiltBody(artifact, template, templateFm, finding);
  if (rebuilt === undefined) return reviewOnlyResult(artifact, reviewCount);

  writeArtifactBody(artifact.filePath, rebuilt);
  return {
    artifactId: artifact.id,
    filePath: artifact.filePath,
    appliedDrifts: finding.drifts.filter(d => d.class === 'mechanical').length,
    skippedReviewDrifts: reviewCount,
  };
}

/**
 * Applies every mechanical drift across `findings`, one file write per artifact. Review-only
 * drifts are left untouched and counted in the result for the report.
 */
export function applyFindings(
  catalog: LoadedCatalog,
  findings: readonly SyncFinding[],
): ApplyResult[] {
  const results: ApplyResult[] = [];
  for (const finding of findings) {
    const result = applyOneFinding(catalog, finding);
    if (result) results.push(result);
  }
  return results;
}
