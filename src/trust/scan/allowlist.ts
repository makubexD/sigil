/**
 * Allow-file loader for .sigil/allow.json.
 *
 * Returns an empty set when the file doesn't exist or is malformed — never throws.
 */
import fs from 'node:fs';
import path from 'node:path';

export function loadAllowlist(projectDir: string): Set<string> {
  const allowPath = path.join(projectDir, '.sigil', 'allow.json');
  if (!fs.existsSync(allowPath)) return new Set();

  try {
    const raw = fs.readFileSync(allowPath, 'utf-8');
    const parsed = JSON.parse(raw) as { allow?: string[] };
    return new Set(Array.isArray(parsed.allow) ? parsed.allow : []);
  } catch {
    return new Set();
  }
}
