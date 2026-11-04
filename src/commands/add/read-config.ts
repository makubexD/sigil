/**
 * Reads the config file `sigil add` is about to merge into.
 *
 * @module
 */
import fs from 'fs';
import { configParseProblem, parseConfig } from '../../config-merge';

/** A config file's parsed content plus its raw text, for the TOML splice writer's `before`. */
export interface ReadExistingConfig {
  existing: Record<string, unknown>;
  before: string;
}

/**
 * Reads the existing config at `fullPath`, or `{}`/`''` if absent. On a parse failure it logs,
 * sets a failing exit code and returns undefined, so the install skips this file.
 */
export function readExistingConfig(fullPath: string, id: string): ReadExistingConfig | undefined {
  if (!fs.existsSync(fullPath)) return { existing: {}, before: '' };
  try {
    const before = fs.readFileSync(fullPath, 'utf-8');
    return { existing: parseConfig(fullPath, before), before };
  } catch {
    console.error(
      `✗ Cannot install '${id}': ${fullPath} exists but ${configParseProblem(fullPath)} Fix it first.`,
    );
    process.exitCode = 1;
    return undefined;
  }
}
