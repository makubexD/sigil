#!/usr/bin/env node
// shipit: a small release tool. Deliberately flawed: this is the eval fixture for the cli skill.
import { createInterface } from 'node:readline';

const users = [{ id: 1, name: 'octocat' }, { id: 2, name: 'octo-work' }];
const releases = [{ version: '1.2.0', env: 'staging' }, { version: '1.1.0', env: 'production' }];
const red = (s) => '\x1b[31m' + s + '\x1b[0m';
const green = (s) => '\x1b[32m' + s + '\x1b[0m';

const args = process.argv.slice(2);

function has(flag) { return args.includes(flag); }
function valueOf(short, long) {
  const i = args.findIndex((a) => a === short || a === long);
  return i >= 0 ? args[i + 1] : undefined;
}

function listUsers() {
  const format = valueOf('-f', '--format');
  console.log('Fetching users...');
  if (format === 'json') { console.log(JSON.stringify(users)); return; }
  for (const u of users) console.log(green('*') + ' ' + u.id + ' ' + u.name);
}

function removeUser(id) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  rl.question('Really remove user ' + id + '? (y/n) ', (answer) => {
    rl.close();
    if (answer === 'y') console.log('removed ' + id);
  });
}

function listReleases() {
  for (const r of releases) console.log(r.version + '\t' + r.env);
}

function deploy(env, service, version, force) {
  if (!env || !service || !version) { console.log(red('error: missing arguments')); return; }
  const forced = force === 'true' || has('-f');
  console.log(green('deployed') + ' ' + service + '@' + version + ' to ' + env + (forced ? ' (forced)' : ''));
}

function help() {
  console.log('shipit - release tool');
  console.log('  shipit --users --list');
  console.log('  shipit users show-all [-f json]');
  console.log('  shipit users remove <id>');
  console.log('  shipit releases');
  console.log('  shipit deploy <env> <service> <version> <force>');
}

if (has('--users') && has('--list')) listUsers();
else if (args[0] === 'users' && args[1] === 'show-all') listUsers();
else if (args[0] === 'users' && args[1] === 'remove') removeUser(args[2]);
else if (args[0] === 'users') listUsers();
else if (args[0] === 'releases') listReleases();
else if (args[0] === 'deploy') deploy(args[1], args[2], args[3], args[4]);
else if (args[0] === '--help' || args.length === 0) help();
else console.log(red('unknown command: ' + args[0]));
