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
  const duplicates = duplicateProblems(standard.families);
  if (duplicates.length > 0) {
    throw new SigilError(`${source} is invalid:\n  ${duplicates.join('\n  ')}`);
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

function toFamilyDef(f: z.infer<typeof FamilySchema>): FamilyDef {
  const base = { id: f.id, kind: f.kind, members: f.members, keys: f.keys ?? [] };
  const family = {
    ...base,
    absent: f.absent ?? {},
    ...(f.title ? { title: f.title } : {}),
    ...(f.references ? { references: f.references } : {}),
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
