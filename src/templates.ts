/**
 * Slot parsing and template composition — shared by src/resolve.ts (which composes bodies at
 * build time) and src/validate/template-checks.ts (which must validate slot structure WITHOUT
 * importing resolve.ts, to avoid a load↔validate↔resolve cycle; see resolve.ts's header comment
 * on the platform-neutral pipeline order).
 *
 * Source format recap (see catalog/shared/templates/*.template.md for real examples):
 *   - A TEMPLATE body is ordinary Markdown with `<!-- slot: <key> -->` markers marking insertion
 *     points. Everything else in the template body is shared prose, emitted for every artifact
 *     that uses it.
 *   - An ARTIFACT that declares `template: <id>` supplies ONLY slot content: one or more
 *     `<!-- slot: <key> -->` markers followed by that slot's Markdown, nothing else at the top
 *     level. Composition substitutes each marker in the template with the matching artifact slot.
 */
import type { Artifact } from './types';
import { getSchema, type TemplateFrontmatter } from './schema/index';

const SLOT_MARKER_RE = /<!--\s*slot:\s*([a-zA-Z0-9_-]+)\s*-->/g;

/** One slot declaration from a template's `slots:` frontmatter (see TemplateSchema). */
export interface TemplateSlotDef {
  key: string;
  required: boolean;
  renamedFrom?: string | undefined;
}

export interface ParsedArtifactSlots {
  /** Slot key → trimmed Markdown content supplied by the artifact. */
  slots: Record<string, string>;
  /** Structural problems found while parsing (content before first marker, duplicate marker). */
  errors: string[];
}

/** Pushes an error when non-whitespace content precedes the first slot marker. */
function checkLeadingContent(body: string, firstMatchStart: number, errors: string[]): void {
  if (body.slice(0, firstMatchStart).trim().length > 0) {
    errors.push(
      'content found before the first "<!-- slot: ... -->" marker — every top-level line must ' +
        'belong to a slot',
    );
  }
}

/** Slices the content belonging to each marker match and collects it into a slot map. */
function extractSlotEntries(
  body: string,
  matches: RegExpMatchArray[],
  errors: string[],
): Record<string, string> {
  const slots: Record<string, string> = {};
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i]!;
    const key = match[1]!;
    const contentStart = (match.index ?? 0) + match[0].length;
    const contentEnd = matches[i + 1]?.index ?? body.length;
    const content = body.slice(contentStart, contentEnd).trim();

    if (key in slots) {
      errors.push(`duplicate slot marker: '${key}'`);
      continue;
    }
    slots[key] = content;
  }
  return slots;
}

/**
 * Parses an artifact body that composes against a template into its slot contents.
 * Does NOT know which template it composes against — key validity is checked by the caller
 * (composeTemplate, or template-checks.ts) against that template's declared slots.
 */
export function parseSlots(body: string): ParsedArtifactSlots {
  const errors: string[] = [];
  const matches = [...body.matchAll(SLOT_MARKER_RE)];

  if (matches.length === 0) {
    if (body.trim().length > 0) {
      errors.push(
        'body has no "<!-- slot: ... -->" markers but the artifact declares template: — ' +
          'move the content into slots, or remove template: for a hand-authored body',
      );
    }
    return { slots: {}, errors };
  }

  checkLeadingContent(body, matches[0]?.index ?? 0, errors);
  const slots = extractSlotEntries(body, matches, errors);
  return { slots, errors };
}

/** Parses a template body into its ordered slot keys, in the order markers appear. */
export function parseTemplateSlotOrder(templateBody: string): string[] {
  return [...templateBody.matchAll(SLOT_MARKER_RE)].map(m => m[1]!);
}

/**
 * Parses an artifact body into its ordered slot keys, in the order markers appear — used by
 * `sigil sync` (src/commands/sync/analyze.ts) to detect a slot order that no longer matches the
 * template's declared order. Shares the marker regex with parseTemplateSlotOrder but is kept as
 * its own function since the two inputs (template vs. artifact body) are semantically distinct.
 */
export function parseArtifactSlotOrder(artifactBody: string): string[] {
  return [...artifactBody.matchAll(SLOT_MARKER_RE)].map(m => m[1]!);
}

/** One `<!-- slot: key --> content` block from an artifact body, in source order. */
export interface SlotBlock {
  key: string;
  content: string;
}

/**
 * Splits an artifact body into its ordered slot blocks (key + trimmed content), preserving
 * duplicate keys and source order — used only by `sigil sync --apply`
 * (src/commands/sync/apply.ts) to rewrite a body block-by-block. `parseSlots` above is the
 * validating counterpart (map keyed by slot, structural error collection); this is the writer's
 * counterpart (ordered list, no validation) and intentionally does not report errors — apply
 * only runs after analyze.ts has already confirmed the body is well-formed enough to act on.
 */
export function splitArtifactSlotBlocks(body: string): SlotBlock[] {
  const matches = [...body.matchAll(SLOT_MARKER_RE)];
  return matches.map((match, i) => {
    const key = match[1]!;
    const contentStart = (match.index ?? 0) + match[0].length;
    const contentEnd = matches[i + 1]?.index ?? body.length;
    return { key, content: body.slice(contentStart, contentEnd).trim() };
  });
}

export interface ComposeResult {
  /** The composed body: template prose with each marker replaced by the matching slot content. */
  body: string;
  /** The artifact's own slot contents, exposed unflattened (ResolvedArtifact.resolvedSlots). */
  slots: Record<string, string>;
  /** Structural problems: unknown slot keys, missing required slots, or parseSlots' own errors. */
  errors: string[];
}

/** Collapses 3+ blank lines left behind by an empty optional slot down to a single blank line. */
function normalizeBlankLines(text: string): string {
  return text.replace(/\n{3,}/g, '\n\n').trim();
}

/** Pushes an error for every artifact slot key the template doesn't declare. */
function checkUnknownSlots(
  slots: Record<string, string>,
  templateSlots: readonly TemplateSlotDef[],
  errors: string[],
): void {
  const declaredKeys = new Set(templateSlots.map(s => s.key));
  for (const key of Object.keys(slots)) {
    if (!declaredKeys.has(key)) {
      errors.push(`unknown slot '${key}' — not declared by this template's slots:`);
    }
  }
}

/** Pushes an error for every required template slot the artifact doesn't fill. */
function checkMissingRequiredSlots(
  slots: Record<string, string>,
  templateSlots: readonly TemplateSlotDef[],
  errors: string[],
): void {
  for (const def of templateSlots) {
    if (def.required && !(def.key in slots)) {
      errors.push(`missing required slot '${def.key}'`);
    }
  }
}

/**
 * Composes one artifact's body against its template: validates the artifact's slots against the
 * template's declared slot list, then substitutes each `<!-- slot: key -->` marker in the
 * template body with the artifact's content for that key (empty string for an absent optional
 * slot).
 *
 * Pure and synchronous — callers (resolve.ts, template-checks.ts) own catalog lookups and error
 * reporting; this function only knows about the two bodies and the slot declarations.
 */
export function composeTemplate(
  templateBody: string,
  templateSlots: readonly TemplateSlotDef[],
  artifactBody: string,
): ComposeResult {
  const { slots, errors: parseErrors } = parseSlots(artifactBody);
  const errors = [...parseErrors];
  checkUnknownSlots(slots, templateSlots, errors);
  checkMissingRequiredSlots(slots, templateSlots, errors);

  const body = normalizeBlankLines(
    templateBody.replace(SLOT_MARKER_RE, (_full, key: string) => slots[key] ?? ''),
  );

  return { body, slots, errors };
}

/** Parses one `kind: template` artifact's frontmatter into its typed shape, or undefined if invalid. */
export function parseTemplateFrontmatter(template: Artifact): TemplateFrontmatter | undefined {
  const result = getSchema('template').safeParse(template.frontmatter);
  return result.success ? (result.data as TemplateFrontmatter) : undefined;
}

export interface TemplateComposition {
  body: string;
  slots: Record<string, string>;
  templateId: string;
}

/**
 * Composes one artifact's body against its declared `template:`, end to end: looks the template
 * up in the catalog, validates it applies to this artifact's kind, and runs composeTemplate().
 * Returns undefined whenever composition cannot proceed cleanly (no `template:`, dangling/wrong-
 * kind reference, kind mismatch, or a slot error) — validate/template-checks.ts is the place that
 * REPORTS those problems; resolve.ts (the only other caller) just falls back to the raw body, per
 * resolve.ts's documented assumption that it runs on an already-validated catalog.
 */
export function composeArtifactAgainstTemplate(
  artifact: Artifact,
  catalog: { byId: Map<string, Artifact> },
): TemplateComposition | undefined {
  const templateId = artifact.frontmatter.template as string | undefined;
  if (!templateId) return undefined;

  const template = catalog.byId.get(templateId);
  if (!template || template.kind !== 'template') return undefined;

  const fm = parseTemplateFrontmatter(template);
  if (!fm || !fm.appliesToKind.includes(artifact.kind)) return undefined;

  const { body, slots, errors } = composeTemplate(template.body, fm.slots, artifact.body);
  if (errors.length > 0) return undefined;

  return { body, slots, templateId };
}
