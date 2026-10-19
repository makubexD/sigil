// Reads the task prompts from scenarios.md (used by run.mjs and checked by selftest.mjs).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * The quoted prompt under each `## Tn ...` (task) or `## Cn ...` (trap task) heading of
 * scenarios.md. Throws when a line inside a prompt lacks its `>`: it would be dropped silently.
 */
export function prompts() {
  const text = readFileSync(join(here, 'scenarios.md'), 'utf8');
  const result = {};
  for (const section of text.split(/^## /m).slice(1)) {
    const id = /^([TC]\d+)\b/.exec(section)?.[1];
    if (!id) continue;
    const lines = section.split(/\r?\n/);
    const first = lines.findIndex(line => line.startsWith('>'));
    const last = lines.findLastIndex(line => line.startsWith('>'));
    const unquoted = lines.slice(first, last + 1).find(line => line && !line.startsWith('>'));
    if (unquoted !== undefined) throw new Error(`${id}: prompt line without ">": ${unquoted}`);
    result[id] = lines
      .slice(first, last + 1)
      .map(line => line.replace(/^> ?/, ''))
      .join('\n')
      .trim();
  }
  return result;
}
