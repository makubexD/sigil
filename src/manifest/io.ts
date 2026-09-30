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

/** Returns the absolute path of the manifest file for a given project directory. */
export function manifestPath(projectDir: string): string {
  return path.join(projectDir, MANIFEST_RELATIVE_PATH);
}

/**
 * Load the manifest from disk. Returns an empty manifest when the file doesn't
 * exist. Throws when the file exists but is not valid JSON.
 */
export function loadManifest(projectDir: string): Manifest {
  const p = manifestPath(projectDir);
  if (!fs.existsSync(p)) {
    return { manifestVersion: MANIFEST_VERSION, entries: [] };
  }

  let raw: string;
  try {
    raw = fs.readFileSync(p, 'utf-8');
  } catch (err) {
    throw new Error(`Failed to read manifest at ${p}`, { cause: err });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      `Manifest at ${p} is not valid JSON. Delete it or run \`sigil status\` to rebuild.`,
    );
  }

  const m = parsed as Manifest;
  if (typeof m.manifestVersion !== 'number') {
    // Pre-schema manifest (empty-ish) — treat as empty
    return { manifestVersion: MANIFEST_VERSION, entries: [] };
  }
  if (m.manifestVersion > MANIFEST_VERSION) {
    throw new Error(
      `Manifest at ${p} was written by a newer version of sigil (manifestVersion ${m.manifestVersion}). ` +
        `Upgrade sigil (npm i -g sigil) to use it.`,
    );
  }

  return {
    manifestVersion: MANIFEST_VERSION,
    entries: Array.isArray(m.entries) ? m.entries : [],
  };
}

/** Write the manifest to disk, creating .sigil/ if needed. */
export function saveManifest(projectDir: string, manifest: Manifest): void {
  const p = manifestPath(projectDir);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');
}
