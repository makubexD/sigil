/**
 * The representative install that the output snapshot and the frozen-install migration test share:
 * one artifact of each shape the emitters treat differently, installed over config files the user
 * already had, so merging is covered and not only creating.
 */
import fs from 'node:fs';
import path from 'node:path';
import { runAdd } from '../../dist-cli/commands/add';
import { runUpdate } from '../../dist-cli/commands/update';

const ROOT = path.resolve(__dirname, '../..');
export const CATALOG = path.join(ROOT, 'catalog');
export const PACKS = path.join(ROOT, 'packs.yaml');
export const TARGETS = ['claude', 'copilot'] as const;
const JSON_INDENT = 2;

/** A skill with `uses`, a skill with references, a templated skill, a rule with `extends`, a prompt, and every config kind. */
export const FULL_SELECTION = [
  'skill:csharp/cs-generate-tests',
  'skill:shared/cli',
  'skill:typescript/ts-release',
  'rule:angular/ng-conventions',
  'prompt:shared/explain-diff',
  'mcp:shared/filesystem',
  'hook:shared/protect-config',
  'settings:shared/allow-dev-tools',
];

const USER_CONFIG: Record<string, unknown> = {
  '.claude/settings.json': { model: 'user-choice', permissions: { allow: ['Bash(make test)'] } },
  '.mcp.json': { mcpServers: { 'user-server': { command: 'user-mcp' } } },
  '.vscode/mcp.json': { servers: { 'user-server': { command: 'user-mcp' } } },
};

/** Writes the user's own config files into `dir`. */
export function seedUserConfig(dir: string): void {
  for (const [rel, content] of Object.entries(USER_CONFIG)) {
    const file = path.join(dir, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(content, null, JSON_INDENT) + '\n');
  }
}

/** Non-interactive `sigil add <selectors> --target <target>` into `dir`. */
export async function add(
  dir: string,
  target: string,
  selectors: string[],
  deps = true,
): Promise<void> {
  await runAdd(selectors, {
    projectDir: dir,
    catalogDir: CATALOG,
    packs: PACKS,
    target,
    deps,
    dryRun: false,
    interactive: false,
    yes: true,
    overwrite: false,
    settingsLocal: false,
  });
}

/** Non-interactive `sigil update --yes` in `dir`. */
export async function update(dir: string, target: string): Promise<void> {
  await runUpdate([], {
    projectDir: dir,
    target,
    catalogDir: CATALOG,
    packs: PACKS,
    force: false,
    dryRun: false,
    yes: true,
  });
}
