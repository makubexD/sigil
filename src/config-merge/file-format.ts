/**
 * Per-path config-file format dispatch for config-kind artifacts (hook/settings/mcp).
 *
 * Config-kind files are user-owned and merged in place; the file format is chosen by the
 * destination's path. Today the only format is JSON — `parseConfig` is `JSON.parse` and
 * `renderConfig` is the order-preserving `serialize()` writer — so this module is the single
 * seam where a future non-JSON format (TOML, YAML, …) plugs in without touching the
 * install/update/uninstall/status call sites.
 *
 * @module
 */
import { serialize } from './primitives';

/** Parses a config file's text by its path; throws on invalid content. */
export function parseConfig(fullPath: string, text: string): Record<string, unknown> {
  return JSON.parse(text) as Record<string, unknown>;
}

/** The text to write for `merged`. `_before` is the file's current text, unused by JSON. */
export function renderConfig(
  fullPath: string,
  merged: Record<string, unknown>,
  _before?: string,
): string {
  return serialize(merged);
}
