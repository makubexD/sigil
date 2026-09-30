/**
 * `sigil __complete` command (hidden) — called by shell completion scripts.
 *
 * Extracted from cli.ts so it can be imported and tested without Commander.
 *
 * @module
 */
import fs from 'node:fs';
import yaml from 'js-yaml';
import { loadCatalog } from '../load';
import { getAllTargets } from '../targets';
import type { PacksConfig } from '../types';

export interface CompleteOptions {
  prev: string;
  catalogDir: string;
  packs: string;
}

export async function runComplete(word: string, opts: CompleteOptions): Promise<void> {
  const prev = opts.prev ?? '';

  // Flag-value completions — derived from the registry so new targets appear automatically.
  if (prev === '--target') {
    process.stdout.write(
      getAllTargets()
        .map(t => t.name)
        .join('\n') + '\n',
    );
    return;
  }
  if (prev === '--kind' || prev === '--exclude') {
    process.stdout.write('skill\nagent\nrule\nprompt\nworkflow\n');
    return;
  }

  const catalog = await loadCatalog(opts.catalogDir).catch(() => null);
  const packsConfig: PacksConfig = fs.existsSync(opts.packs)
    ? (yaml.load(fs.readFileSync(opts.packs, 'utf-8'), {
        schema: yaml.JSON_SCHEMA,
      }) as PacksConfig)
    : { packs: [] };

  if (prev === '--language' && catalog) {
    process.stdout.write([...catalog.languages.keys()].join('\n') + '\n');
    return;
  }

  // Completions for the `add` command selectors
  const completions: string[] = ['all'];

  // pack: completions
  for (const pack of packsConfig.packs) {
    completions.push(`pack:${pack.name}`);
  }

  // kind: completions
  completions.push('kind:skill', 'kind:agent', 'kind:rule', 'kind:prompt', 'kind:workflow');

  // artifact IDs
  if (catalog) {
    for (const a of catalog.artifacts) {
      completions.push(`${a.kind}:${a.id}`);
    }
  }

  const filtered = completions.filter(c => !word || c.startsWith(word));
  process.stdout.write(filtered.join('\n') + '\n');
}
