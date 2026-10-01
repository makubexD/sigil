/**
 * docs/reference/cli-flags.md is pasted from `sigil <cmd> --help`. Fail when a registered
 * command has no section, when one of that command's flag tokens is absent from its section,
 * or when the doc has a section for a command that is not registered.
 *
 * Compare flag tokens, not help text. Commander wraps descriptions to the terminal width
 * (non-TTY help is 80 columns; COLUMNS is set anyway and is not what the assertion uses).
 * Skips the implicit `help` command and the hidden `__complete` command. Aliases (`show`,
 * `rename`, `remove`) share the primary command's section.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { stripAnsi } from './helpers/ansi';

const CLI = path.resolve(__dirname, '../dist-cli/cli.js');
const DOC = path.resolve(__dirname, '../docs/reference/cli-flags.md');
const REGENERATE = 'Regenerate docs/reference/cli-flags.md.';
const SKIPPED = new Set(['help', '__complete']);

interface RegisteredCommand {
  /** Name used to spawn `<name> --help` and to find the `## sigil <name>` section. */
  name: string;
  /** Primary name plus aliases. A doc section may use any of these. */
  names: readonly string[];
}

function helpText(args: readonly string[]): string {
  try {
    return stripAnsi(
      execFileSync(process.execPath, [CLI, ...args], {
        encoding: 'utf8',
        env: { ...process.env, COLUMNS: '200', FORCE_COLOR: '0' },
        windowsHide: true,
      }),
    );
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; status?: number | null };
    const detail = stripAnsi(err.stderr || err.stdout || String(error));
    assert.fail(`sigil ${args.join(' ')} exited ${err.status ?? 'unknown'}: ${detail}`);
  }
}

/** Primary command plus aliases from one `Commands:` line (`get|show`). */
function parseRegisteredCommands(help: string): RegisteredCommand[] {
  const lines = help.split(/\r?\n/);
  const start = lines.findIndex(line => line === 'Commands:');
  assert.ok(start >= 0, 'sigil --help did not list a Commands: section. Regenerate cli-flags.md.');
  const commands: RegisteredCommand[] = [];
  for (const line of lines.slice(start + 1)) {
    const match = /^ {2}([a-z][a-z0-9-]*(?:\|[a-z][a-z0-9-]*)*)(?=\s|$)/.exec(line);
    const token = match?.[1];
    if (token === undefined) continue;
    const names = token.split('|');
    const name = names[0];
    if (name === undefined || SKIPPED.has(name)) continue;
    commands.push({ name, names });
  }
  assert.ok(commands.length > 0, 'sigil --help listed no user-facing commands.');
  return commands;
}

/** Body of each `## \`sigil <name>\`` section, from that heading through the line before the next `##`. */
function commandSections(doc: string): Map<string, string> {
  const sections = new Map<string, string>();
  let current: string | undefined;
  let buf: string[] = [];
  const flush = (): void => {
    if (current !== undefined) sections.set(current, buf.join('\n'));
  };
  for (const line of doc.split(/\r?\n/)) {
    const heading = /^## `sigil ([a-z][a-z0-9-]*)`\s*$/.exec(line);
    const name = heading?.[1];
    if (name !== undefined) {
      flush();
      current = name;
      buf = [line];
      continue;
    }
    if (current !== undefined) buf.push(line);
  }
  flush();
  assert.ok(sections.size > 0, 'docs/reference/cli-flags.md has no `## sigil <command>` sections.');
  return sections;
}

/** Long flags (`--force`) and single-letter short flags (`-i`, `-h`) as whole tokens. */
function flagTokens(help: string): string[] {
  const found = new Set<string>();
  for (const match of help.matchAll(/--[a-z][a-z0-9-]*/g)) {
    if (match[0] !== undefined) found.add(match[0]);
  }
  for (const match of help.matchAll(/(?<![\w-])-[a-zA-Z](?![\w-])/g)) {
    if (match[0] !== undefined) found.add(match[0]);
  }
  return [...found];
}

function sectionHasFlag(section: string, flag: string): boolean {
  const escaped = flag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![\\w-])${escaped}(?![\\w-])`).test(section);
}

function loadDocAlignment(): {
  commands: RegisteredCommand[];
  sections: Map<string, string>;
  registered: Set<string>;
} {
  const commands = parseRegisteredCommands(helpText(['--help']));
  const sections = commandSections(fs.readFileSync(DOC, 'utf8'));
  const registered = new Set(commands.flatMap(command => command.names));
  return { commands, sections, registered };
}

describe('cli-flags.md matches sigil --help', () => {
  it('should document every registered command and every flag in its help', () => {
    const { commands, sections } = loadDocAlignment();
    const problems: string[] = [];
    for (const command of commands) {
      const section = sections.get(command.name);
      if (section === undefined) {
        problems.push(
          `sigil ${command.name} is registered but docs/reference/cli-flags.md has no section for it. ${REGENERATE}`,
        );
        continue;
      }
      for (const flag of flagTokens(helpText([command.name, '--help']))) {
        if (!sectionHasFlag(section, flag)) {
          problems.push(
            `sigil ${command.name}: ${flag} is in \`${command.name} --help\` but missing from its section in docs/reference/cli-flags.md. ${REGENERATE}`,
          );
        }
      }
    }
    assert.equal(problems.length, 0, problems.join('\n'));
  });

  it('should have no section for a command that is not registered', () => {
    const { sections, registered } = loadDocAlignment();
    const extras = [...sections.keys()].filter(name => !registered.has(name));
    const problems = extras.map(
      name =>
        `docs/reference/cli-flags.md has a section for sigil ${name}, which is not a registered command. ${REGENERATE}`,
    );
    assert.equal(problems.length, 0, problems.join('\n'));
  });
});
