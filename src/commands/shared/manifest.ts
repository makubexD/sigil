/**
 * `requireManifest` — load the install manifest or throw a SigilError.
 *
 * Replaces 3 copies of the same try/catch around `loadManifest` across
 * commands/{status,uninstall,update}.ts.
 *
 * @module
 */
import { loadManifest } from '../../manifest';
import type { Manifest } from '../../manifest/types';
import { SigilError } from '../../errors';

/** Loads the install manifest for `projectDir`, wrapping any load failure in a SigilError. */
export function requireManifest(projectDir: string): Manifest {
  try {
    return loadManifest(projectDir);
  } catch (err) {
    throw new SigilError((err as Error).message, { cause: err });
  }
}
