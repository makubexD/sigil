/**
 * Allow-file loader for .sigil/allow.json.
 *
 * Dynamic require keeps this module importable in test environments
 * without real FS. The callers that actually need it (CLI) always have FS.
 * Returns an empty set when the file doesn't exist or is malformed.
 */
export function loadAllowlist(projectDir: string): Set<string> {
  let fs_: typeof import('fs');
  let path_: typeof import('path');
  try {
    fs_ = require('fs') as typeof import('fs');
    path_ = require('path') as typeof import('path');
  } catch {
    return new Set();
  }

  const allowPath = path_.join(projectDir, '.sigil', 'allow.json');
  if (!fs_.existsSync(allowPath)) return new Set();

  try {
    const raw = fs_.readFileSync(allowPath, 'utf-8');
    const parsed = JSON.parse(raw) as { allow?: string[] };
    return new Set(Array.isArray(parsed.allow) ? parsed.allow : []);
  } catch {
    return new Set();
  }
}
