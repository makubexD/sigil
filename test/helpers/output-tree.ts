/**
 * Hashes a directory of sigil output so two installs or builds can be compared file by file.
 *
 * Keys are POSIX paths relative to the directory. Values are the sha256 of the file's content, with
 * JSON normalized: run-dependent values (`installedAt`, `generatedAt`, and the package version
 * stamped as `version` / `sigilVersion`) are masked. Every file must be LF-only.
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const MASKED_KEYS = new Set(['installedAt', 'generatedAt']);
const VERSION_KEYS = new Set(['version', 'sigilVersion']);
const JSON_INDENT = 2;

/** The version in package.json, which build and add stamp into plugin.json and the manifest. */
export const PKG_VERSION = (
  JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as { version: string }
).version;

function mask(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(mask);
  if (value === null || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value)) {
    if (MASKED_KEYS.has(key)) out[key] = '<masked>';
    else if (VERSION_KEYS.has(key) && v === PKG_VERSION) out[key] = '<version>';
    else out[key] = mask(v);
  }
  return out;
}

function normalize(relPath: string, content: string): string {
  if (!relPath.endsWith('.json')) return content;
  return JSON.stringify(mask(JSON.parse(content)), null, JSON_INDENT);
}

/** Every file under `dir`, keyed by POSIX path, valued by the sha256 of its normalized content. */
export function hashTree(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (current: string): void => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      const rel = path.relative(dir, full).split(path.sep).join('/');
      const content = fs.readFileSync(full, 'utf8');
      assert.ok(!content.includes('\r'), `${rel} contains a carriage return`);
      out[rel] = crypto.createHash('sha256').update(normalize(rel, content)).digest('hex');
    }
  };
  walk(dir);
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

/** Paths that differ between two hashed trees: `- removed`, `+ added`, `~ changed`. */
export function treeDiff(
  expected: Record<string, string>,
  actual: Record<string, string>,
): string[] {
  return [...new Set([...Object.keys(expected), ...Object.keys(actual)])]
    .sort()
    .filter(key => expected[key] !== actual[key])
    .map(key => (!(key in actual) ? `- ${key}` : !(key in expected) ? `+ ${key}` : `~ ${key}`));
}
