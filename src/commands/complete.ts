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

/** Handles flag-value completions that don't need the catalog (--target, --kind, --exclude). */
function tryStaticFlagCompletion(prev: string): boolean {
  if (prev === '--target') {
    process.stdout.write(
      getAllTargets()
        .map(t => t.name)
        .join('\n') + '\n',
    );
    return true;
  }
  if (prev === '--kind' || prev === '--exclude') {
    process.stdout.write('skill\nagent\nrule\nprompt\nworkflow\n');
    return true;
  }
  return false;
}

/** Loads packs.yaml, or an empty pack list when the file doesn't exist. */
function loadPacksConfig(packsPath: string): PacksConfig {
  if (!fs.existsSync(packsPath)) return { packs: [] };
  return yaml.load(fs.readFileSync(packsPath, 'utf-8'), {
    schema: yaml.JSON_SCHEMA,
  }) as PacksConfig;
}

/** Builds the full `add` selector completion list: all, pack:, kind:, and artifact ids. */
function buildSelectorCompletions(
  packsConfig: PacksConfig,
  catalog: Awaited<ReturnType<typeof loadCatalog>> | null,
): string[] {
  const completions: string[] = ['all'];
  for (const pack of packsConfig.packs) {
    completions.push(`pack:${pack.name}`);
  }
  completions.push('kind:skill', 'kind:agent', 'kind:rule', 'kind:prompt', 'kind:workflow');
  if (catalog) {
    for (const a of catalog.artifacts) {
      completions.push(`${a.kind}:${a.id}`);
    }
  }
  return completions;
}

export async function runComplete(word: string, opts: CompleteOptions): Promise<void> {
  const prev = opts.prev ?? '';
  if (tryStaticFlagCompletion(prev)) return;

  const catalog = await loadCatalog(opts.catalogDir).catch(() => null);
  if (prev === '--language' && catalog) {
    process.stdout.write([...catalog.languages.keys()].join('\n') + '\n');
    return;
  }

  const packsConfig = loadPacksConfig(opts.packs);
  const completions = buildSelectorCompletions(packsConfig, catalog);
  const filtered = completions.filter(c => !word || c.startsWith(word));
  process.stdout.write(filtered.join('\n') + '\n');
}
