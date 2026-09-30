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

export interface BuildOptions {
  target: string;
  catalogDir: string;
  packs: string;
  outDir: string;
}

export async function runBuild(opts: BuildOptions): Promise<void> {
  const { catalog, packsConfig } = await loadAndValidate(opts.catalogDir, opts.packs);
  const resolved = resolveCatalog(catalog);

  const targets = opts.target === 'all' ? getAllTargets() : [getTarget(opts.target)];

  /** Filter a resolved catalog to only artifacts targeting a given platform. */
  const filterForTarget = (name: string) => {
    const filtered = resolved.artifacts.filter(a => artifactTargetsPlatform(a, name));
    return { ...resolved, artifacts: filtered, byId: new Map(filtered.map(a => [a.id, a])) };
  };

  const compileOpts = { version: pkg.version, packs: packsConfig.packs, homepage: pkg.homepage };

  for (const target of targets) {
    console.log(`\nBuilding target: ${target.name}`);
    const files = await target.compile(filterForTarget(target.name), compileOpts);

    // Output-conformance check: verify emitted file shapes match the target's contracts.
    const violations = checkOutputContract(files, target.outputContracts ?? []);
    if (violations.length > 0) {
      for (const v of violations) {
        console.error(`  ✗  [${v.label}] ${v.file}`);
        console.error(`       ${v.problem}`);
      }
      console.error(
        `\n✗ ${violations.length} output-conformance error(s) in target '${target.name}'. Fix the catalog source or adapter before shipping.`,
      );
      process.exit(1);
    }

    writeFilesSync(files, path.join(opts.outDir, target.name));
    const count = Object.keys(files).length;
    console.log(`  ✓ ${count} file(s) written to dist/${target.name}/`);
  }

  // Emit registry.json alongside the per-target dist directories
  const registry = buildRegistry(resolved, pkg.version, new Date().toISOString());
  const registryPath = path.join(opts.outDir, 'registry.json');
  fs.mkdirSync(opts.outDir, { recursive: true });
  fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2) + '\n', 'utf-8');
  console.log(`  ✓ registry.json  (${registry.artifacts.length} artifacts)`);

  console.log('\nBuild complete.');
}
