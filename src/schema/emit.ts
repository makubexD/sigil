/**
 * Generates schema/*.schema.json from the zod definitions.
 * Run via: npm run build (called automatically after tsc).
 *
 * The generated files are committed so editors get YAML frontmatter autocomplete
 * without requiring a build step. The $schema key in each frontmatter can point
 * to one of these files for in-editor validation.
 */
import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import { JSON_INDENT } from '../json-util';
import { SCHEMAS } from './index';

const OUTPUT_DIR = path.resolve(__dirname, '../../schema');

/** One kind's frontmatter schema as JSON Schema, in the $ref + definitions layout editors read. */
function toFrontmatterSchema(name: string, schema: z.ZodType): Record<string, unknown> {
  const definitionName = `${name}-frontmatter`;
  // io: 'input' describes what an author writes, so a field with a default stays optional.
  const { $schema, ...definition } = z.toJSONSchema(schema, {
    target: 'draft-7',
    io: 'input',
    unrepresentable: 'any',
    // Input mode leaves unknown keys open; sigil's objects strip them, and editors should flag
    // a misspelled key, as the zod-to-json-schema output did. Records keep their own schema.
    override: ctx => {
      const out = ctx.jsonSchema;
      if (out.type === 'object' && out.additionalProperties === undefined) {
        out.additionalProperties = false;
      }
    },
  });
  return {
    $ref: `#/definitions/${definitionName}`,
    definitions: { [definitionName]: definition },
    $schema,
  };
}

function run(): void {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Derived from SCHEMAS (src/schema/index.ts) rather than hand-listed a second time here — a
  // kind added to SCHEMAS now automatically gets a schema/<kind>.schema.json with no further
  // edit to this file. See the SCHEMAS export's own comment for the full reasoning.
  // `any` here for the same reason the old hand-list needed it: Zod's recursive generics exceed
  // TS's instantiation depth limit once the schemas are treated as a heterogeneous collection.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const [name, schema] of Object.entries(SCHEMAS) as Array<[string, any]>) {
    const jsonSchema = toFrontmatterSchema(name, schema);
    const outPath = path.join(OUTPUT_DIR, `${name}.schema.json`);
    fs.writeFileSync(outPath, JSON.stringify(jsonSchema, null, JSON_INDENT) + '\n', 'utf-8');
    console.log(`  ✓ schema/${name}.schema.json`);
  }

  console.log('Schema emit complete.');
}

run();
