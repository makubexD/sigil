/**
 * `sigil init` command — prepare a consumer project for a target platform.
 *
 * Extracted from cli.ts so it can be imported and tested without Commander.
 *
 * @module
 */
import fs from 'node:fs';
import path from 'node:path';
import { getAllTargets, getTarget } from '../targets';
import { SigilError } from '../errors';

export interface InitOptions {
  target: string;
  projectDir: string;
}

export function runInit(opts: InitOptions): void {
  // Directory list and display name come from the target adapter — no hardcoded names here.
  let target;
  try {
    target = getTarget(opts.target);
  } catch {
    const names = getAllTargets()
      .map(t => t.name)
      .join(', ');
    throw new SigilError(`Unknown target '${opts.target}'. Valid options: ${names}`);
  }
  for (const dir of target.initDirs ?? []) {
    const full = path.join(opts.projectDir, dir);
    fs.mkdirSync(full, { recursive: true });
    console.log(`  created ${dir}/`);
  }
  console.log(`\n✓ ${target.name} project structure initialised.`);
  console.log(
    `  Next: sigil add --target ${target.name}  (interactive) or  sigil add skill:<language>/<name> --target ${target.name}`,
  );
}
