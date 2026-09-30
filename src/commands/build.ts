/**
 * `sigil build` command — compile the catalog to dist/<target>/.
 *
 * Extracted from cli.ts so it can be imported and tested without Commander.
 * cli.ts keeps only the option declarations and wires `.action(runBuild)`.
 *
 * @module
 */
import fs from 'node:fs';
import path from 'node:path';
import { resolveCatalog } from '../resolve';
import { getAllTargets, getTarget } from '../targets';
import { artifactTargetsPlatform } from '../select';
import { checkOutputContract } from '../targets/output-contract';
import { buildRegistry } from '../registry';
import { loadAndValidate, writeFilesSync, pkg } from '../cli-helpers';
import { SigilError } from '../errors';
import { renderViolations } from './shared/contract';
import { JSON_INDENT } from '../json-util';
import type { CompileOptions, ResolvedCatalog, Target } from '../types';

export interface BuildOptions {
  target: string;
  catalogDir: string;
  packs: string;
  outDir: string;
}

/** Filter a resolved catalog to only artifacts targeting a given platform. */
function filterForTarget(resolved: ResolvedCatalog, name: string): ResolvedCatalog {
  const filtered = resolved.artifacts.filter(a => artifactTargetsPlatform(a, name));
  return { ...resolved, artifacts: filtered, byId: new Map(filtered.map(a => [a.id, a])) };
}

/** Compiles one target's catalog slice, checks output conformance, and writes it to disk. */
async function buildOneTarget(
  target: Target,
  resolved: ResolvedCatalog,
  compileOpts: CompileOptions,
  outDir: string,
): Promise<void> {
  console.log(`\nBuilding target: ${target.name}`);
  const files = await target.compile(filterForTarget(resolved, target.name), compileOpts);

  // Output-conformance check: verify emitted file shapes match the target's contracts.
  const violations = checkOutputContract(files, target.outputContracts ?? []);
  if (violations.length > 0) {
    throw new SigilError(
      `${violations.length} output-conformance error(s) in target '${target.name}'. Fix the catalog source or adapter before shipping.`,
      { hint: renderViolations(violations) },
    );
  }

  writeFilesSync(files, path.join(outDir, target.name));
  console.log(`  ✓ ${Object.keys(files).length} file(s) written to dist/${target.name}/`);
}

/** Writes registry.json alongside the per-target dist directories. */
function writeRegistry(resolved: ResolvedCatalog, outDir: string): void {
  const registry = buildRegistry(resolved, pkg.version, new Date().toISOString());
  const registryPath = path.join(outDir, 'registry.json');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(registryPath, JSON.stringify(registry, null, JSON_INDENT) + '\n', 'utf-8');
  console.log(`  ✓ registry.json  (${registry.artifacts.length} artifacts)`);
}

export async function runBuild(opts: BuildOptions): Promise<void> {
  const { catalog, packsConfig } = await loadAndValidate(opts.catalogDir, opts.packs);
  const resolved = resolveCatalog(catalog);

  const targets = opts.target === 'all' ? getAllTargets() : [getTarget(opts.target)];
  const compileOpts = { version: pkg.version, packs: packsConfig.packs, homepage: pkg.homepage };

  for (const target of targets) {
    await buildOneTarget(target, resolved, compileOpts, opts.outDir);
  }

  writeRegistry(resolved, opts.outDir);
  console.log('\nBuild complete.');
}
