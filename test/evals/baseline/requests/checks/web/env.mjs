// The packages a web grader runs a project against (React, jsdom, ...). They are not dependencies of
// this repo: `depsRoot` installs the pinned set named in `<name>.deps.json` into a temp folder, once,
// without running install scripts, and the module hooks (hooks.mjs) resolve bare imports there.
/* global process */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/** The folder holding `node_modules` for the dependency set `name`, installed on first use. */
export function depsRoot(name) {
  const manifest = readFileSync(join(here, `${name}.deps.json`), 'utf8');
  const key = createHash('sha256').update(manifest).digest('hex').slice(0, 10);
  const root = join(tmpdir(), 'sigil-baseline-graders', `${name}-${key}`);
  const marker = join(root, 'installed');
  if (existsSync(marker)) return root;
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, 'package.json'), manifest);
  const install = spawnSync('npm install --ignore-scripts --no-audit --no-fund', {
    cwd: root,
    shell: true,
    encoding: 'utf8',
  });
  if (install.status !== 0) {
    process.stderr.write(`${install.stdout}${install.stderr}`);
    throw new Error(`could not install the ${name} grader packages in ${root}`);
  }
  writeFileSync(marker, new Date().toISOString());
  return root;
}
