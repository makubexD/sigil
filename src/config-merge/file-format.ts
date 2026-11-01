/**
 * Per-path config-file format dispatch for config-kind artifacts (hook/settings/mcp).
 *
 * Config-kind files are user-owned and merged in place; the file format is chosen by the
 * destination's path. JSON is `JSON.parse` / the order-preserving `serialize()` writer. A `.toml`
 * path (Codex's `config.toml`) parses with smol-toml and renders by splicing text through
 * `renderToml`, so the user's comments and ordering survive. This module is the single seam where
 * a future format (YAML, …) plugs in without touching the install/update/uninstall/status sites.
 *
 * @module
 */
import { parse as parseToml } from 'smol-toml';
import { serialize } from './primitives';
import { renderToml } from './toml-file';

/** True when `fullPath` names a TOML config file (Codex's `config.toml`). */
function isTomlPath(fullPath: string): boolean {
  return fullPath.endsWith('.toml');
}

/** The format's name for an error message about `fullPath`. */
export function configFormatName(fullPath: string): string {
  return isTomlPath(fullPath) ? 'TOML' : 'JSON';
}

/** Parses a config file's text by its path; throws on invalid content. */
export function parseConfig(fullPath: string, text: string): Record<string, unknown> {
  if (isTomlPath(fullPath)) return parseToml(text) as Record<string, unknown>;
  return JSON.parse(text) as Record<string, unknown>;
}

/**
 * The text to write for `merged`. `before` is the file's current text, unused by JSON but the
 * splice source for TOML.
 */
export function renderConfig(
  fullPath: string,
  merged: Record<string, unknown>,
  before?: string,
): string {
  if (isTomlPath(fullPath)) return renderToml(before ?? '', merged);
  return serialize(merged);
}

/**
 * True when `merged` means the file should be deleted as emptied: no keys remain, and — for TOML,
 * which can still hold the user's comments — the rendered text is blank too.
 */
export function isEmptiedConfig(
  fullPath: string,
  merged: Record<string, unknown>,
  text: string,
): boolean {
  if (Object.keys(merged).length > 0) return false;
  return isTomlPath(fullPath) ? text.trim() === '' : true;
}
