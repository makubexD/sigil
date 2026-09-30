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
import { zodToJsonSchema } from 'zod-to-json-schema';
import { JSON_INDENT } from '../json-util';
import { SCHEMAS } from './index';

const OUTPUT_DIR = path.resolve(__dirname, '../../schema');

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
    const jsonSchema = zodToJsonSchema(schema, {
      name: `${name}-frontmatter`,
      $refStrategy: 'none',
    });

    const outPath = path.join(OUTPUT_DIR, `${name}.schema.json`);
    fs.writeFileSync(outPath, JSON.stringify(jsonSchema, null, JSON_INDENT) + '\n', 'utf-8');
    console.log(`  ✓ schema/${name}.schema.json`);
  }

  console.log('Schema emit complete.');
}

run();
