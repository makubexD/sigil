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
import {
  SkillSchema,
  AgentSchema,
  RuleSchema,
  PromptSchema,
  WorkflowSchema,
} from './index';

const OUTPUT_DIR = path.resolve(__dirname, '../../schema');

// Use `any` here — Zod's recursive generics exceed TS's instantiation depth limit.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SCHEMAS: Array<{ name: string; schema: any }> = [
  { name: 'skill',    schema: SkillSchema },
  { name: 'agent',    schema: AgentSchema },
  { name: 'rule',     schema: RuleSchema },
  { name: 'prompt',   schema: PromptSchema },
  { name: 'workflow', schema: WorkflowSchema },
];

function run(): void {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  for (const { name, schema } of SCHEMAS) {
    const jsonSchema = zodToJsonSchema(schema, {
      name: `${name}-frontmatter`,
      $refStrategy: 'none',
    });

    const outPath = path.join(OUTPUT_DIR, `${name}.schema.json`);
    fs.writeFileSync(outPath, JSON.stringify(jsonSchema, null, 2) + '\n', 'utf-8');
    console.log(`  ✓ schema/${name}.schema.json`);
  }

  console.log('Schema emit complete.');
}

run();
