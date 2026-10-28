/**
 * Pure utilities for config-kind artifact installation.
 *
 * Exported as a separate module (not from cli.ts) so they can be imported
 * in tests without triggering Commander's program-level side effects.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { reverseMerge } from './config-merge';
import type { ConfigMergeOp, ConfigRoot } from './types';

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
 * The VS Code user-profile directory, warning when it is absent. A reader (status) passes quiet:
 * the warning is about writing there, which a reader never does.
 */
function vsCodeUserRoot(quiet: boolean): string {
  const vsDir = resolveVsCodeUserDir();
  if (!quiet && !fs.existsSync(vsDir)) {
    console.warn(
      `  ⚠  VS Code user-profile directory not found at ${vsDir} — writing anyway (directory will be created).`,
    );
  }
  return vsDir;
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
export function resolveConfigRoot(
  root: ConfigRoot | undefined,
  projectDir: string,
  opts: { quiet?: boolean } = {},
): string {
  switch (root) {
    case 'home':
      return os.homedir();
    case 'copilot-home':
      return resolveCopilotHome();
    case 'vscode-user':
      return vsCodeUserRoot(opts.quiet ?? false);
    default: // 'project' or undefined
      return projectDir;
  }
}

/** True when `root` writes to a directory shared across all of the user's projects. */
export function isHomeScopedRoot(root: ConfigRoot | undefined): boolean {
  return root === 'home' || root === 'copilot-home' || root === 'vscode-user';
}

/** JSON can only parse to an object, an array or a primitive; only a non-array object is usable. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * True when `fullPath` parses to a plain object that holds nothing but the fragments in
 * `sigilOps`: reversing every op in order leaves no keys. Invalid JSON or a non-object is
 * never "sigil-only" — it is backed up as today.
 */
function holdsOnlySigilEntries(fullPath: string, sigilOps: readonly ConfigMergeOp[]): boolean {
  let content: unknown;
  try {
    content = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  } catch {
    return false;
  }
  if (!isPlainObject(content)) return false;
  const remaining = sigilOps.reduce<Record<string, unknown>>(
    (acc, op) => reverseMerge(acc, op),
    content,
  );
  return Object.keys(remaining).length === 0;
}

/**
 * Writes a pristine `.sigil.bak` before the first write/delete of a home-scoped config file;
 * warns either way. Must be called before ANY write or delete of a file at a home-scoped root —
 * originally implemented only in `sigil add`'s write path (`commands/add/execute-config.ts`),
 * which meant `sigil update`/`sigil uninstall` silently skipped this guarantee for the exact
 * files it protects (2026-08-22 audit F23,
 * docs/decisions/catalog-benchmark-audit-2026-08-22.md). No-ops if `fullPath` doesn't exist yet
 * (nothing to back up).
 *
 * The backup protects content sigil did not write: a file holding only the fragments `sigilOps`
 * records for it gets none. Once the user adds content, the next write backs the file up — that
 * copy includes sigil's entries too, so it is the first copy with user content, not a
 * pre-sigil original. Invalid JSON or a non-object is backed up unchanged.
 */
export function ensureHomeBackup(fullPath: string, sigilOps: readonly ConfigMergeOp[] = []): void {
  if (!fs.existsSync(fullPath)) return;
  const bakPath = `${fullPath}.sigil.bak`;
  if (fs.existsSync(bakPath)) {
    console.warn(`  ⚠  Existing backup kept → ${bakPath}  (compare before committing)`);
  } else if (holdsOnlySigilEntries(fullPath, sigilOps)) {
    console.warn(`  ⓘ  ${fullPath} holds only sigil entries; no backup needed.`);
  } else {
    fs.copyFileSync(fullPath, bakPath);
    console.warn(`\n  ⚠  Writing to ${fullPath} — this file affects ALL your projects.`);
    console.warn(`  ⚠  Backup saved → ${bakPath}`);
    console.warn(`  ⚠  Review the diff before committing: diff "${bakPath}" "${fullPath}"\n`);
  }
}
