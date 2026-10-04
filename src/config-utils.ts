/**
 * Pure utilities for config-kind artifact installation.
 *
 * Exported as a separate module (not from cli.ts) so they can be imported
 * in tests without triggering Commander's program-level side effects.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { ConfigRoot } from './types';

/** Resolves the default VS Code user-profile directory for the current platform. */
function resolveVsCodeUserDir(): string {
  switch (process.platform) {
    case 'win32':
      return path.join(process.env.APPDATA ?? os.homedir(), 'Code', 'User');
    case 'darwin':
      return path.join(os.homedir(), 'Library', 'Application Support', 'Code', 'User');
    default:
      return path.join(os.homedir(), '.config', 'Code', 'User');
  }
}

/** $COPILOT_HOME as an absolute path, else ~/.copilot (an empty value counts as unset). */
function resolveCopilotHome(): string {
  const home = process.env.COPILOT_HOME;
  return home ? path.resolve(home) : path.join(os.homedir(), '.copilot');
}

/**
 * Resolves a symbolic ConfigRoot to an absolute base directory.
 *
 *   project    → projectDir  (default, stays inside the consumer repo)
 *   home       → os.homedir()  (user-global: ~/.claude/settings.json, ~/.claude.json)
 *   copilot-home → $COPILOT_HOME, default ~/.copilot (Copilot's user MCP file)
 *   vscode-user → VS Code user-profile directory (best-effort; warns when absent)
 *                 win32   : %APPDATA%/Code/User
 *                 darwin  : ~/Library/Application Support/Code/User
 *                 default : ~/.config/Code/User
 *
 * Note: resolves the DEFAULT VS Code profile only. Projects using custom profiles
 * must specify the path manually.
 */
export function resolveConfigRoot(root: ConfigRoot | undefined, projectDir: string): string {
  switch (root) {
    case 'home':
      return os.homedir();
    case 'copilot-home':
      return resolveCopilotHome();
    case 'vscode-user': {
      const vsDir = resolveVsCodeUserDir();
      if (!fs.existsSync(vsDir)) {
        console.warn(
          `  ⚠  VS Code user-profile directory not found at ${vsDir} — writing anyway (directory will be created).`,
        );
      }
      return vsDir;
    }
    default: // 'project' or undefined
      return projectDir;
  }
}

/** True when `root` writes to a directory shared across all of the user's projects. */
export function isHomeScopedRoot(root: ConfigRoot | undefined): boolean {
  return root === 'home' || root === 'copilot-home' || root === 'vscode-user';
}

/**
 * Writes a pristine `.sigil.bak` before the first write/delete of a home-scoped config file;
 * warns either way. Must be called before ANY write or delete of a file at a home-scoped root —
 * originally implemented only in `sigil add`'s write path (`commands/add/execute-config.ts`),
 * which meant `sigil update`/`sigil uninstall` silently skipped this guarantee for the exact
 * files it protects (2026-08-22 audit F23,
 * docs/decisions/catalog-benchmark-audit-2026-08-22.md). No-ops if `fullPath` doesn't exist yet
 * (nothing to back up).
 */
export function ensureHomeBackup(fullPath: string): void {
  if (!fs.existsSync(fullPath)) return;
  const bakPath = `${fullPath}.sigil.bak`;
  if (!fs.existsSync(bakPath)) {
    fs.copyFileSync(fullPath, bakPath);
    console.warn(`\n  ⚠  Writing to ${fullPath} — this file affects ALL your projects.`);
    console.warn(`  ⚠  Backup saved → ${bakPath}`);
    console.warn(`  ⚠  Review the diff before committing: diff "${bakPath}" "${fullPath}"\n`);
  } else {
    console.warn(`  ⚠  Existing backup kept → ${bakPath}  (compare before committing)`);
  }
}
