#!/usr/bin/env node
// launch: create a project and manage its deployment environments.
// Eval fixture for the wizard skill: a sound CLI whose wizard is deliberately flawed.
import { parseArgs } from 'node:util';
import { COMMANDS, validateChoice } from './src/commands.mjs';
import { runWizard } from './src/wizard.mjs';

const io = {
  cwd: process.cwd(),
  out: (line) => process.stdout.write(line + '\n'),
  err: (line) => process.stderr.write(line + '\n'),
};

function help() {
  const lines = ['usage: launch <group> <command> [options]', ''];
  for (const [path, command] of Object.entries(COMMANDS)) {
    lines.push(`  launch ${path}${command.positional ? ' ' + command.positional.label : ''}`.padEnd(34) + command.summary);
  }
  lines.push('', 'Run `launch <group> <command> --help` for its options.', 'Exit codes: 0 ok, 1 failed, 2 usage error.');
  return lines.join('\n');
}

function commandHelp(path, command) {
  const lines = [`usage: launch ${path}${command.positional ? ' ' + command.positional.label : ''} [options]`, '', command.summary, ''];
  for (const [name, option] of Object.entries(command.options)) {
    const value = option.type === 'string' ? ' <value>' : '';
    const extra = option.choices ? ` (${option.choices.join('|')}, default ${option.default})` : '';
    lines.push(`  --${name}${value}`.padEnd(24) + option.help + extra);
  }
  return lines.join('\n');
}

function usage(message) {
  io.err('error: ' + message);
  io.err('run `launch --help` for usage');
  return 2;
}

function validate(command, values, positionals) {
  for (const [name, option] of Object.entries(command.options)) {
    if (option.choices && values[name] !== undefined) {
      const problem = validateChoice(name, option.choices)(values[name]);
      if (problem) return problem;
    }
  }
  if (command.positional) {
    if (positionals.length !== 1) return `expects exactly one ${command.positional.label}`;
    return command.positional.validate(positionals[0]);
  }
  return positionals.length > 0 ? `unexpected argument '${positionals[0]}'` : null;
}

export function main(argv) {
  if (argv[0] === 'init') return runWizard(io);
  if (argv.length === 0 || argv[0] === '--help' || argv[0] === '-h') { io.out(help()); return 0; }
  const path = argv.slice(0, 2).join(' ');
  const command = COMMANDS[path];
  if (!command) return usage(`unknown command '${path}'`);
  if (argv.includes('--help')) { io.out(commandHelp(path, command)); return 0; }
  let parsed;
  try {
    parsed = parseArgs({ args: argv.slice(2), options: command.options, allowPositionals: true, strict: true });
  } catch (error) {
    return usage(error.message);
  }
  const values = { ...Object.fromEntries(Object.entries(command.options).map(([k, o]) => [k, o.default])), ...parsed.values };
  const problem = validate(command, values, parsed.positionals);
  if (problem) return usage(problem);
  return command.run(values, parsed.positionals, io);
}

Promise.resolve(main(process.argv.slice(2))).then((code) => { process.exitCode = code; });
