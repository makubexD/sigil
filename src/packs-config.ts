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

const PackSchema = z
  .object({
    name: z.string().regex(KEBAB_NAME_RE, 'must be kebab-case (lowercase letters, digits, -)'),
    displayName: z.string(),
    description: z.string(),
    languages: z.array(z.string()).optional(),
    artifacts: z.array(z.string()).optional(),
    pluginExclude: z.array(z.string()).optional(),
  })
  .refine(pack => (pack.pluginExclude ?? []).every(id => pack.artifacts?.includes(id) === true), {
    message: "pluginExclude ids must also be listed in that pack's artifacts",
    path: ['pluginExclude'],
  });

const MarketplacePersonSchema = z
  .object({
    name: z.string().min(1),
    url: z.string().optional(),
    email: z.string().optional(),
  })
  .strict();

const MarketplaceSchema = z
  .object({
    name: z
      .string()
      .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, 'must be alphanumerics, dots, dashes or underscores')
      .refine(n => !n.includes('..'), 'must not contain ".."'),
    owner: MarketplacePersonSchema,
    description: z.string().optional(),
    author: MarketplacePersonSchema.optional(),
    license: z.string().optional(),
    homepage: z.string().optional(),
  })
  .strict();

const PacksConfigSchema = z.object({
  packs: z.array(PackSchema),
  marketplace: MarketplaceSchema.optional(),
});

/** Parses packs.yaml's text; throws a SigilError naming `source` when it is malformed. */
export function parsePacksConfig(raw: string, source: string): PacksConfig {
  const result = PacksConfigSchema.safeParse(yaml.load(raw, { schema: yaml.JSON_SCHEMA }));
  // zod types an absent optional key as `| undefined`, but never adds one, so this is a Pack.
  if (result.success) return result.data as PacksConfig;
  const problems = result.error.issues.map(i => `${i.path.join('.') || '(root)'}: ${i.message}`);
  throw new SigilError(`${source} is invalid:\n  ${problems.join('\n  ')}`);
}
