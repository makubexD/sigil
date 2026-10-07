// `launch init`: a guided setup for people new to launch.
import { createInterface } from 'node:readline/promises';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const cyan = (s) => '\x1b[36m' + s + '\x1b[0m';

function looksLikeName(value) {
  return /^[a-zA-Z][a-zA-Z0-9 -]{0,40}$/.test(value);
}

export async function runWizard(io) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  rl.on('close', () => process.exit(0));
  console.log(cyan('Welcome to launch! Let\'s set up your project.'));

  let name = await rl.question('Project name: ');
  while (!looksLikeName(name)) name = await rl.question('Letters, digits, spaces or dashes please. Project name: ');
  const dir = join(io.cwd, name);
  mkdirSync(dir, { recursive: true });

  const template = (await rl.question('Template (basic/api/worker) [basic]: ')) || 'basic';
  const team = Number(await rl.question('How many people will work on it? '));
  const tier = team > 5 ? 'pro' : 'free';
  writeFileSync(join(dir, 'launch.json'), JSON.stringify({ name, template }, null, 2) + '\n');

  const statePath = join(io.cwd, '.launch', 'state.json');
  const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : { envs: [] };
  if (state.envs.length > 0) {
    const reset = await rl.question('Remove the existing environments? (y/n) ');
    if (reset === 'y') state.envs = [];
  }
  const envName = (await rl.question('First environment name [staging]: ')) || 'staging';
  const region = (await rl.question('Region (us/eu/ap) [us]: ')) || 'us';
  mkdirSync(join(io.cwd, '.launch'), { recursive: true });
  writeFileSync(statePath, JSON.stringify({ project: { name, template }, envs: [...state.envs, { name: envName, region, tier }] }, null, 2));

  console.log(cyan('All done! Your project is ready.'));
  rl.removeAllListeners('close');
  rl.close();
  return 0;
}
