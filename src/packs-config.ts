/**
 * The one reader of packs.yaml. A pack's name becomes an output directory
 * (`dist/claude/plugins/<name>`) and a command argument, so it gets the same safe kebab-case
 * shape artifact names have (`KEBAB_NAME_RE`); the rest of the file is checked for shape too.
 *
 * @module
 */
import yaml from 'js-yaml';
import { z } from 'zod';
import { KEBAB_NAME_RE } from './schema/shared';
import { SigilError } from './errors';
import type { PacksConfig } from './types';

const PackSchema = z.object({
  name: z.string().regex(KEBAB_NAME_RE, 'must be kebab-case (lowercase letters, digits, -)'),
  displayName: z.string(),
  description: z.string(),
  languages: z.array(z.string()).optional(),
  artifacts: z.array(z.string()).optional(),
});

const PacksConfigSchema = z.object({ packs: z.array(PackSchema) });

/** Parses packs.yaml's text; throws a SigilError naming `source` when it is malformed. */
export function parsePacksConfig(raw: string, source: string): PacksConfig {
  const result = PacksConfigSchema.safeParse(yaml.load(raw, { schema: yaml.JSON_SCHEMA }));
  // zod types an absent optional key as `| undefined`, but never adds one, so this is a Pack.
  if (result.success) return result.data as PacksConfig;
  const problems = result.error.issues.map(i => `${i.path.join('.') || '(root)'}: ${i.message}`);
  throw new SigilError(`${source} is invalid:\n  ${problems.join('\n  ')}`);
}
