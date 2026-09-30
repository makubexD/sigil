/**
 * SHA-256 hashing helpers for manifest content integrity checks.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { ManifestFile } from './types';

/** Compute a SHA-256 hex digest of a string (file content). */
export function sha256(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf-8').digest('hex');
}

/**
 * Compute ManifestFile entries for a given FileMap, reading each file from disk.
 * Paths in the FileMap are relative to projectDir.
 */
export function hashFiles(files: Record<string, string>, projectDir: string): ManifestFile[] {
  return Object.keys(files).map(relPath => {
    const fullPath = path.join(projectDir, relPath);
    const content = fs.readFileSync(fullPath, 'utf-8');
    return { path: relPath, sha256: sha256(content) };
  });
}
