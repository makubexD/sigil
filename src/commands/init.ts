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
import { chooseInitTarget } from './init-guided';

export interface InitOptions {
  /** Omit to be asked, in a terminal. Elsewhere a missing target is an error. */
  target?: string | undefined;
  projectDir: string;
}

/** Looks the target up by name; an unknown name lists the valid ones. */
function targetNamed(name: string): ReturnType<typeof getTarget> {
  try {
    return getTarget(name);
  } catch {
    const names = getAllTargets()
      .map(t => t.name)
      .join(', ');
    throw new SigilError(`Unknown target '${name}'. Valid options: ${names}`);
  }
}

export async function runInit(opts: InitOptions): Promise<void> {
  const name = opts.target ?? (await chooseInitTarget(opts.projectDir));
  if (name === null) return;
  // Directory list and display name come from the target adapter — no hardcoded names here.
  const target = targetNamed(name);
  for (const dir of target.initDirs ?? []) {
    const full = path.join(opts.projectDir, dir);
    const existed = fs.existsSync(full);
    fs.mkdirSync(full, { recursive: true });
    console.log(existed ? `  ${dir}/ already exists` : `  created ${dir}/`);
  }
  console.log(`\n✓ ${target.name} project structure is ready.`);
  console.log(
    `  Next: install something. In the sigil menu choose "Install artifacts", or run  sigil add --target ${target.name}`,
  );
}
