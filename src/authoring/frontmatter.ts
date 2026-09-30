/**
 * Shared frontmatter writer for authoring commands (retarget, edit).
 *
 * Reads an artifact file, merges a patch object into its parsed frontmatter,
 * and writes the file back — preserving the body verbatim.
 *
 * Why not gray-matter stringify? gray-matter's default stringify uses js-yaml
 * which may alter key order, add extra blank lines, and doesn't match the
 * hand-authored style of the catalog sources. The hand-rolled serialiser below
 * matches the retarget command's existing output format exactly.
 */
import fs from 'fs';
import matter from 'gray-matter';

// ─── Serialisation ────────────────────────────────────────────────────────────

/**
 * Serialise a scalar value to a safe YAML representation.
 * Strings that contain YAML-special characters are double-quoted.
 * Booleans, numbers, and null emit as plain scalars.
 *
 * Characters that require quoting:
 *   - `\n`  — literal newline in string value
 *   - `:`   — key-value separator (e.g. "Fix: the bug")
 *   - `"`   — would escape out of a double-quoted context
 *   - `#`   at start — comment marker
 *   - `*`   at start — YAML alias anchor (`**\/*.cs` is read as alias `*` + `/*.cs`)
 *   - `[`   at start — YAML flow sequence indicator (`[optional]` is read as sequence)
 *   - `{`   at start — YAML flow mapping indicator
 */
function serializeScalar(val: unknown): string {
  if (typeof val === 'string') {
    if (
      val.includes('\n') ||
      val.includes(':') ||
      val.includes('"') ||
      val.startsWith('#') ||
      val.startsWith('*') || // glob patterns: **/*.cs triggers YAML alias parsing unquoted
      val.startsWith('[') || // flow sequence: [optional] treated as array literal
      val.startsWith('{') // flow mapping
    ) {
      return `"${val.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
    }
    return val;
  }
  return String(val);
}

/**
 * Serialise a single YAML key-value pair for frontmatter output.
 *
 * Rules (same as the original retarget inline serialiser):
 *  - Arrays of scalars → block sequence (`  - item`)
 *  - Arrays of objects → block sequence of mappings (`  - key: val\n    key2: val2`)
 *  - Empty arrays → flow `[]`
 *  - Objects → indented block mapping (`  key: val`)
 *  - Strings containing `:` or `"` or `\n` → double-quoted
 *  - Everything else → plain scalar
 */
export function serializeYamlEntry(key: string, val: unknown): string {
  if (Array.isArray(val)) {
    if (val.length === 0) return `${key}: []`;
    return `${key}:\n${val
      .map(item => {
        if (typeof item === 'object' && item !== null) {
          // Sequence of mappings — YAML block sequence style:
          //   - firstKey: firstVal
          //     restKey:  restVal
          const entries = Object.entries(item as Record<string, unknown>);
          if (entries.length === 0) return '  - {}';
          const lines = entries.map(([ik, iv], i) => {
            const scalar = serializeScalar(iv);
            return i === 0 ? `  - ${ik}: ${scalar}` : `    ${ik}: ${scalar}`;
          });
          return lines.join('\n');
        }
        // Plain scalar in a sequence
        return `  - ${serializeScalar(item)}`;
      })
      .join('\n')}`;
  }
  if (typeof val === 'object' && val !== null) {
    const lines = Object.entries(val as Record<string, unknown>)
      .map(([ik, iv]) => {
        // Nested arrays (e.g. uses.rules / uses.agents) must render as block sequences,
        // not comma-joined scalars — serializeScalar(array) would call String(array).
        if (Array.isArray(iv)) {
          if (iv.length === 0) return `  ${ik}: []`;
          const items = iv.map(item => `    - ${serializeScalar(item)}`).join('\n');
          return `  ${ik}:\n${items}`;
        }
        return `  ${ik}: ${serializeScalar(iv)}`;
      })
      .join('\n');
    return `${key}:\n${lines}`;
  }
  return `${key}: ${serializeScalar(val)}`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Write updated frontmatter fields back to an artifact file, preserving the body.
 *
 * `patch` is merged into the parsed frontmatter data:
 *  - A defined value replaces or adds the key.
 *  - `undefined` removes the key (e.g. pass `{ platforms: undefined }` to delete it).
 */
export function writeArtifactFrontmatter(filePath: string, patch: Record<string, unknown>): void {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const parsed = matter(raw);

  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) {
      delete parsed.data[k];
    } else {
      parsed.data[k] = v;
    }
  }

  const yamlBlock = Object.entries(parsed.data)
    .map(([k, v]) => serializeYamlEntry(k, v))
    .join('\n');

  fs.writeFileSync(filePath, `---\n${yamlBlock}\n---${parsed.content}`, 'utf-8');
}
