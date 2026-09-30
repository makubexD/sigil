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

/**
 * Resolves a symbolic ConfigRoot to an absolute base directory.
 *
 *   project    → projectDir  (default, stays inside the consumer repo)
 *   home       → os.homedir()  (user-global: ~/.claude/settings.json, ~/.claude.json)
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
