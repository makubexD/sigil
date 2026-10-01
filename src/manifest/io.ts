/**
 * Manifest disk I/O: load, save, and path resolution.
 *
 * loadManifest returns an empty manifest when the file doesn't exist.
 * saveManifest creates .sigil/ if needed before writing.
 */
import fs from 'fs';
import path from 'path';
import { MANIFEST_VERSION, MANIFEST_RELATIVE_PATH } from './types';
import type { Manifest } from './types';
import { JSON_INDENT } from '../json-util';

/** Returns the absolute path of the manifest file for a given project directory. */
export function manifestPath(projectDir: string): string {
  return path.join(projectDir, MANIFEST_RELATIVE_PATH);
}

const EMPTY_MANIFEST: Manifest = { manifestVersion: MANIFEST_VERSION, entries: [] };

/** JSON.parse with a manifest-specific error message; throws on invalid JSON. */
function parseManifestJson(raw: string, p: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(
      `Manifest at ${p} is not valid JSON. Run \`sigil\` and choose "Repair the install record", or delete the file.`,
    );
  }
}

/** Validates a parsed manifest's version, throwing when it's newer than supported. */
function validateManifestVersion(m: Manifest, p: string): Manifest | undefined {
  if (typeof m.manifestVersion !== 'number') {
    // Pre-schema manifest (empty-ish) — treat as empty
    return EMPTY_MANIFEST;
  }
  if (m.manifestVersion > MANIFEST_VERSION) {
    throw new Error(
      `Manifest at ${p} was written by a newer version of sigil (manifestVersion ${m.manifestVersion}). ` +
        `Upgrade sigil (npm i -g sigil) to use it.`,
    );
  }
  return undefined;
}

/** Parses and validates raw manifest JSON text, throwing on newer-than-supported versions. */
function parseManifest(raw: string, p: string): Manifest {
  const m = parseManifestJson(raw, p) as Manifest;
  const early = validateManifestVersion(m, p);
  if (early) return early;

  return {
    manifestVersion: MANIFEST_VERSION,
    entries: Array.isArray(m.entries) ? m.entries : [],
  };
}

/**
 * Load the manifest from disk. Returns an empty manifest when the file doesn't
 * exist. Throws when the file exists but is not valid JSON.
 */
export function loadManifest(projectDir: string): Manifest {
  const p = manifestPath(projectDir);
  if (!fs.existsSync(p)) return EMPTY_MANIFEST;

  let raw: string;
  try {
    raw = fs.readFileSync(p, 'utf-8');
  } catch (err) {
    throw new Error(`Failed to read manifest at ${p}`, { cause: err });
  }

  return parseManifest(raw, p);
}

/** Write the manifest to disk, creating .sigil/ if needed. */
export function saveManifest(projectDir: string, manifest: Manifest): void {
  const p = manifestPath(projectDir);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(manifest, null, JSON_INDENT) + '\n', 'utf-8');
}
