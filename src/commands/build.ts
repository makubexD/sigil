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
import { contractsFor } from '../targets/all-emit-specs';
import { buildRegistry } from '../registry';
import { loadAndValidate, resolveDefault, writeFilesSync, pkg } from '../cli-helpers';
import { SigilError } from '../errors';
import { renderViolations } from './shared/contract';
import { JSON_INDENT } from '../json-util';
import type { CompileOptions, FileMap, ResolvedCatalog, Target } from '../types';

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

/** Compiles one target's catalog slice and checks its output against the target's contracts. */
async function compileTarget(
  target: Target,
  resolved: ResolvedCatalog,
  compileOpts: CompileOptions,
): Promise<FileMap> {
  console.log(`\nBuilding target: ${target.name}`);
  const files = await target.compile(filterForTarget(resolved, target.name), compileOpts);

  // Output-conformance check: verify emitted file shapes match the target's contracts.
  const violations = checkOutputContract(files, contractsFor(target));
  if (violations.length > 0) {
    throw new SigilError(
      `${violations.length} output-conformance error(s) in target '${target.name}'. Fix the catalog source or adapter before shipping.`,
      { hint: renderViolations(violations) },
    );
  }

  return files;
}

/** Compiles every target before anything is written, so a failed target changes nothing on disk. */
async function compileTargets(
  targets: Target[],
  resolved: ResolvedCatalog,
  compileOpts: CompileOptions,
): Promise<{ target: Target; files: FileMap }[]> {
  const compiled: { target: Target; files: FileMap }[] = [];
  for (const target of targets) {
    compiled.push({ target, files: await compileTarget(target, resolved, compileOpts) });
  }
  return compiled;
}

/** Replaces a target's folder in outDir with the freshly compiled files. */
function writeTarget(target: Target, files: FileMap, outDir: string): void {
  const dir = path.join(outDir, target.name);
  fs.rmSync(dir, { recursive: true, force: true });
  writeFilesSync(files, dir);
  console.log(`  ✓ ${Object.keys(files).length} file(s) written to dist/${target.name}/`);
}

/** Refuses to replace a target folder in an output root that sigil did not build. */
function assertReplaceable(targets: Target[], outDir: string): void {
  if (fs.existsSync(path.join(outDir, 'registry.json'))) return;
  const existing = targets
    .map(target => path.join(outDir, target.name))
    .find(dir => fs.existsSync(dir));
  if (existing === undefined) return;
  throw new SigilError(
    `Refusing to replace ${existing}: ${outDir} has no registry.json, so it is not a sigil build output.`,
    { hint: 'Use an empty --out-dir, or remove the folder first.' },
  );
}

/** Writes registry.json alongside the per-target dist directories. */
function writeRegistry(resolved: ResolvedCatalog, outDir: string): void {
  const registry = buildRegistry(resolved, pkg.version, new Date().toISOString());
  const registryPath = path.join(outDir, 'registry.json');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(registryPath, JSON.stringify(registry, null, JSON_INDENT) + '\n', 'utf-8');
  console.log(`  ✓ registry.json  (${registry.artifacts.length} artifacts)`);
}

/**
 * Warns once per build when a packs file other than the bundled one names no marketplace,
 * so a fork silently keeps sigil's name and collides with upstream. Building sigil itself
 * uses the bundled packs file and never warns; neither does a build with no Claude marketplace.
 */
function warnIfMarketplaceUnnamed(opts: BuildOptions, hasMarketplace: boolean): void {
  if (opts.target !== 'claude' && opts.target !== 'all') return;
  const packsFile = opts.packs;
  if (hasMarketplace || path.resolve(packsFile) === resolveDefault('packs.yaml')) return;
  const packsPath = path.relative(process.cwd(), path.resolve(packsFile));
  console.warn(
    `Warning: no marketplace: block in ${packsPath}; the marketplace keeps the name 'sigil' and collides with upstream sigil when both are added. Set marketplace.name (see docs/guides/publishing.md).`,
  );
}

export async function runBuild(opts: BuildOptions): Promise<void> {
  const { catalog, packsConfig } = await loadAndValidate(opts.catalogDir, opts.packs);
  const resolved = resolveCatalog(catalog);

  warnIfMarketplaceUnnamed(opts, packsConfig.marketplace !== undefined);

  const targets = opts.target === 'all' ? getAllTargets() : [getTarget(opts.target)];
  const compileOpts = {
    version: pkg.version,
    packs: packsConfig.packs,
    homepage: pkg.homepage,
    marketplace: packsConfig.marketplace,
  };

  const compiled = await compileTargets(targets, resolved, compileOpts);

  assertReplaceable(targets, opts.outDir);

  for (const { target, files } of compiled) {
    writeTarget(target, files, opts.outDir);
  }

  writeRegistry(resolved, opts.outDir);
  console.log('\nBuild complete.');
}
