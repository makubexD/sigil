// launch: commands, their options and validators. The parser and help read these
// declarations; every run function takes (values, positionals, io) and returns an exit code.
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

export const TEMPLATES = ['basic', 'api', 'worker'];
export const REGIONS = ['us', 'eu', 'ap'];
export const TIERS = ['free', 'pro'];

/** Returns an error message, or null when the value is valid. */
export function validateName(value) {
  if (!/^[a-z][a-z0-9-]{1,30}$/.test(value)) return `invalid name '${value}': use 2-31 lowercase letters, digits or dashes`;
  return null;
}

export function validateChoice(option, choices) {
  return (value) => (choices.includes(value) ? null : `--${option} must be one of: ${choices.join(', ')} (got '${value}')`);
}

function statePath(cwd) { return join(cwd, '.launch', 'state.json'); }

export function readState(cwd) {
  const path = statePath(cwd);
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : { project: null, envs: [] };
}

function writeState(cwd, state) {
  mkdirSync(join(cwd, '.launch'), { recursive: true });
  writeFileSync(statePath(cwd), JSON.stringify(state, null, 2) + '\n');
}

function createProject(values, [name], io) {
  const state = readState(io.cwd);
  if (state.project) { io.err(`error: a project already exists here: ${state.project.name}`); return 1; }
  const dir = join(io.cwd, name);
  if (values['dry-run']) { io.err(`would create ${dir} from template ${values.template}`); return 0; }
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'launch.json'), JSON.stringify({ name, template: values.template }, null, 2) + '\n');
  writeState(io.cwd, { ...state, project: { name, template: values.template, git: values.git === true } });
  io.out(dir);
  return 0;
}

function addEnv(values, [name], io) {
  const state = readState(io.cwd);
  if (!state.project) { io.err('error: no project here; run `launch project create <name>` first'); return 1; }
  if (state.envs.some((env) => env.name === name)) { io.err(`error: environment '${name}' already exists`); return 1; }
  const env = { name, region: values.region, tier: values.tier };
  if (values['dry-run']) { io.err(`would add ${name} (${env.region}, ${env.tier})`); return 0; }
  writeState(io.cwd, { ...state, envs: [...state.envs, env] });
  io.out(name);
  return 0;
}

function listEnvs(values, _positionals, io) {
  const { envs } = readState(io.cwd);
  if (values.format === 'json') { io.out(JSON.stringify(envs, null, 2)); return 0; }
  for (const env of envs) io.out(`${env.name}\t${env.region}\t${env.tier}`);
  return 0;
}

function deleteEnv(values, [name], io) {
  const state = readState(io.cwd);
  if (!state.envs.some((env) => env.name === name)) { io.err(`error: no environment '${name}'`); return 1; }
  if (!values.yes) { io.err(`error: deleting '${name}' is permanent; re-run with --yes`); return 2; }
  writeState(io.cwd, { ...state, envs: state.envs.filter((env) => env.name !== name) });
  if (state.envs.length === 1) rmSync(join(io.cwd, '.launch', 'cache'), { recursive: true, force: true });
  return 0;
}

const NAME = { label: '<name>', validate: validateName };

export const COMMANDS = {
  'project create': {
    summary: 'create a project from a template',
    positional: NAME,
    options: {
      template: { type: 'string', default: 'basic', choices: TEMPLATES, help: 'starter template' },
      git: { type: 'boolean', help: 'initialise a git repository' },
      'dry-run': { type: 'boolean', help: 'show what would be created' },
    },
    run: createProject,
  },
  'env add': {
    summary: 'add a deployment environment',
    positional: NAME,
    options: {
      region: { type: 'string', default: 'us', choices: REGIONS, help: 'where it runs' },
      tier: { type: 'string', default: 'free', choices: TIERS, help: 'capacity tier' },
      'dry-run': { type: 'boolean', help: 'show what would be added' },
    },
    run: addEnv,
  },
  'env list': {
    summary: 'list environments',
    options: { format: { type: 'string', default: 'text', choices: ['text', 'json'], help: 'text or json' } },
    run: listEnvs,
  },
  'env delete': {
    summary: 'delete an environment (permanent)',
    positional: NAME,
    options: { yes: { type: 'boolean', help: 'confirm without a prompt' } },
    run: deleteEnv,
  },
};
