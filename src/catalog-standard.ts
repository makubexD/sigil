/**
 * The one reader of `catalog/standard.yaml`: the catalog standard as data
 * (docs/decisions/family-skeleton-standard-2026-10.md). It declares the stacks a skill may carry a
 * `references/stack-<id>.md` for, and the families: each family's kind, its explicit members, and
 * optionally the H2 sections every member has, in order, the frontmatter keys every member sets,
 * the title every language member takes and the reference files every member carries; the shared
 * rules other rules extend (`bases`); and the severity scale every report template grades on.
 *
 * Author-only: the `sync --check` rules read it (`family-skeleton`, `catalog-layout`,
 * `catalog-symmetry`); consumer commands and the wizard never do. A catalog without the file
 * (a custom `--catalog-dir`) is simply not checked against a standard.
 *
 * @module
 */
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { z } from 'zod';
import { KEBAB_ID_RE, KEBAB_NAME_RE } from './schema/shared';
import { SigilError } from './errors';
import { readRegularFile } from './safe-read';
import { sectionKey } from './markdown-headings';
import { NEUTRAL_TOOLS, type NeutralTool } from './tool-vocabulary';
import type { ArtifactKind } from './types';

/** The file's name, at the catalog root. */
export const STANDARD_FILE = 'standard.yaml';

const KIB = 1024;
const MAX_STANDARD_KIB = 256;
const KEBAB = 'must be kebab-case (lowercase letters, digits, -)';

const SectionSchema = z.union([
  z.string().min(1),
  z.object({ heading: z.string().min(1), optional: z.boolean().default(false) }),
]);

/** Why a skill carries a reference file: detail read on demand, an agent's brief, or examples. */
const ReferenceRoleSchema = z.enum(['core', 'brief', 'examples']);
const ReferenceFilesSchema = z.record(z.string().regex(KEBAB_NAME_RE, KEBAB), ReferenceRoleSchema);

const ReferencesSchema = z.object({
  /** One `stack-<id>.md` for every stack the standard declares. */
  stacks: z.boolean().default(false),
  /** Reference files (name without `.md` → role) every member carries. */
  files: ReferenceFilesSchema.default({}),
  /** Reference files one member carries beyond `files`. */
  members: z.record(z.string(), ReferenceFilesSchema).default({}),
});

/** The neutral tools an agent family's members all need, and how a target that cannot match them exactly renders the gap. */
const FamilyToolsSchema = z
  .object({
    allow: z.array(z.enum(NEUTRAL_TOOLS)).min(1),
    /** `strict` (the default) renders only what a target can carry exactly; `nearest` allows its closest tools. */
    policy: z.enum(['strict', 'nearest']).optional(),
  })
  .strict();

const FamilySchema = z.object({
  id: z.string().regex(KEBAB_NAME_RE, KEBAB),
  /** A language member's title is `<title> (<language displayName>)`. */
  title: z.string().min(1).optional(),
  kind: z.enum(['agent', 'rule', 'skill']),
  members: z.array(z.string().regex(KEBAB_ID_RE, 'must be an artifact id')).min(1),
  sections: z.array(SectionSchema).optional(),
  keys: z.array(z.string().min(1)).optional(),
  /** Language id → why this family has no member there (silences `catalog-symmetry`). */
  absent: z.record(z.string(), z.string().min(1)).optional(),
  /** The reference files members carry; absent means `SKILL.md` only. */
  references: ReferencesSchema.optional(),
  /** Agent families: the neutral tools every member needs (absent: the family sets none). */
  tools: FamilyToolsSchema.optional(),
  /** Skill families: the pre-approved neutral tools every member names (absent: the family sets none). */
  allowedTools: z.array(z.enum(NEUTRAL_TOOLS)).min(1).optional(),
  /** Member id → why it may differ from the family's `tools` or `allowedTools`. */
  toolExceptions: z
    .record(z.string().regex(KEBAB_ID_RE, 'must be an artifact id'), z.string().min(1))
    .optional(),
});

const StackSchema = z.object({
  id: z.string().regex(KEBAB_NAME_RE, KEBAB),
  displayName: z.string().min(1),
  /** The one language whose folder holds this stack's text (its stack parts). */
  home: z.string().regex(KEBAB_NAME_RE, KEBAB).optional(),
  /** Library and tool names of this stack that neutral shared text must not name (stack-leak). */
  terms: z.array(z.string().min(1)).optional(),
});

const StandardSchema = z.object({
  stacks: z.array(StackSchema).default([]),
  families: z.array(FamilySchema).default([]),
  severities: z.array(z.string().min(1)).default([]),
  bases: z.array(z.string().regex(KEBAB_ID_RE, 'must be an artifact id')).default([]),
});

/** One required H2 section of a family's skeleton. */
export interface SkeletonSection {
  readonly heading: string;
  readonly optional: boolean;
}

export type ReferenceRole = z.infer<typeof ReferenceRoleSchema>;
export type FamilyReferences = Readonly<z.infer<typeof ReferencesSchema>>;

export interface FamilyDef {
  readonly id: string;
  readonly title?: string;
  readonly kind: Extract<ArtifactKind, 'agent' | 'rule' | 'skill'>;
  readonly members: readonly string[];
  /** Absent: the family declares no section skeleton (only membership and keys). */
  readonly sections?: readonly SkeletonSection[];
  readonly keys: readonly string[];
  readonly absent: Readonly<Record<string, string>>;
  readonly references?: FamilyReferences;
  /** Agent families: the neutral tools every member needs; absent when the family sets none. */
  readonly tools?: {
    readonly allow: readonly NeutralTool[];
    readonly policy?: 'strict' | 'nearest';
  };
  /** Skill families: the pre-approved neutral tools every member names; absent when the family sets none. */
  readonly allowedTools?: readonly NeutralTool[];
  /** Member id → why it may differ from the family's `tools` or `allowedTools`. */
  readonly toolExceptions: Readonly<Record<string, string>>;
}

export interface StackDef {
  readonly id: string;
  readonly displayName: string;
  readonly home?: string | undefined;
  readonly terms?: readonly string[] | undefined;
}

export interface CatalogStandard {
  readonly stacks: readonly StackDef[];
  readonly families: readonly FamilyDef[];
  /** The tiers a report grades findings on, highest first; empty when the catalog sets none. */
  readonly severities: readonly string[];
  /** Shared rules other rules extend (`shared/clean-code`): bases, not family members. */
  readonly bases: readonly string[];
}

/** Parses standard.yaml's text; throws a SigilError naming `source` when it is malformed. */
export function parseCatalogStandard(raw: string, source: string): CatalogStandard {
  const result = StandardSchema.safeParse(parseYaml(raw, source) ?? {});
  if (!result.success) {
    const problems = result.error.issues.map(i => `${i.path.join('.') || '(root)'}: ${i.message}`);
    throw new SigilError(`${source} is invalid:\n  ${problems.join('\n  ')}`);
  }
  const { stacks, severities, bases } = result.data;
  const standard = { stacks, severities, bases, families: result.data.families.map(toFamilyDef) };
  const problems = [...duplicateProblems(standard.families), ...toolProblems(standard.families)];
  if (problems.length > 0) {
    throw new SigilError(`${source} is invalid:\n  ${problems.join('\n  ')}`);
  }
  return standard;
}

function parseYaml(raw: string, source: string): unknown {
  try {
    return yaml.load(raw, { schema: yaml.JSON_SCHEMA, filename: source });
  } catch (err) {
    throw new SigilError(`${source} is not valid YAML`, { cause: err });
  }
}

/**
 * Two families with one id, or a skeleton naming one section twice (after step numbers are
 * dropped): the skeleton check matches sections in order, which needs each one to be distinct.
 */
function duplicateProblems(families: readonly FamilyDef[]): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const family of families) {
    if (ids.has(family.id)) problems.push(`family id '${family.id}' is declared twice`);
    ids.add(family.id);
    const keys = new Set<string>();
    for (const section of family.sections ?? []) {
      const key = sectionKey(section.heading);
      if (keys.has(key)) problems.push(`family '${family.id}': section '${section.heading}' twice`);
      keys.add(key);
    }
  }
  return problems;
}

/**
 * `tools` is an agent family's field and `allowedTools` a skill family's; a tool exception must
 * name one of its family's members.
 */
function toolProblems(families: readonly FamilyDef[]): string[] {
  const problems: string[] = [];
  for (const family of families) {
    if (family.tools && family.kind !== 'agent') {
      problems.push(`family '${family.id}': 'tools' is only valid on an agent family`);
    }
    if (family.allowedTools && family.kind !== 'skill') {
      problems.push(`family '${family.id}': 'allowedTools' is only valid on a skill family`);
    }
    const members = new Set(family.members);
    for (const id of Object.keys(family.toolExceptions)) {
      if (!members.has(id)) {
        problems.push(`family '${family.id}': toolExceptions names '${id}', not a member`);
      }
    }
  }
  return problems;
}

/** Drop an explicit `undefined` policy so the result fits `FamilyDef` under exactOptionalPropertyTypes. */
function toolDef(
  t: NonNullable<z.infer<typeof FamilySchema>['tools']>,
): NonNullable<FamilyDef['tools']> {
  return t.policy ? { allow: t.allow, policy: t.policy } : { allow: t.allow };
}

function toFamilyDef(f: z.infer<typeof FamilySchema>): FamilyDef {
  const base = { id: f.id, kind: f.kind, members: f.members, keys: f.keys ?? [] };
  const family = {
    ...base,
    absent: f.absent ?? {},
    toolExceptions: f.toolExceptions ?? {},
    ...(f.title ? { title: f.title } : {}),
    ...(f.references ? { references: f.references } : {}),
    ...(f.tools ? { tools: toolDef(f.tools) } : {}),
    ...(f.allowedTools ? { allowedTools: f.allowedTools } : {}),
  };
  if (!f.sections) return family;
  const sections = f.sections.map(s =>
    typeof s === 'string' ? { heading: s, optional: false } : s,
  );
  return { ...family, sections };
}

/**
 * Reads `<catalogRoot>/standard.yaml`; undefined when the catalog has none. A file that exists but
 * is a link, oversized or malformed throws, so a broken standard never passes silently.
 */
export function loadCatalogStandard(catalogRoot: string): CatalogStandard | undefined {
  const file = path.join(catalogRoot, STANDARD_FILE);
  if (!fs.existsSync(file) && !isLink(file)) return undefined;
  const read = readRegularFile(file, { maxBytes: MAX_STANDARD_KIB * KIB });
  if ('reason' in read) throw new SigilError(`${file}: ${read.reason}`);
  return parseCatalogStandard(read.content, file);
}

function isLink(file: string): boolean {
  try {
    return fs.lstatSync(file).isSymbolicLink();
  } catch {
    return false;
  }
}
