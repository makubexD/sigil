/**
 * Writes docs/reference/capabilities.md from the registered targets' capability tables.
 * Run via: npm run build (after the schema emit). The output is committed and checked for
 * staleness by test/targets/capabilities.test.ts — the same pattern as schema/*.schema.json.
 */
import fs from 'fs';
import path from 'path';
import { getAllTargets } from './index';
import { renderCapabilityMatrix } from './capability-matrix';

const OUTPUT_PATH = path.resolve(__dirname, '../../docs/reference/capabilities.md');

fs.writeFileSync(OUTPUT_PATH, renderCapabilityMatrix(getAllTargets()), 'utf-8');
console.log('  ✓ docs/reference/capabilities.md');
