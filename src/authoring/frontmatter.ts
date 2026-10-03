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
import yaml from 'js-yaml';

// ─── Serialisation ────────────────────────────────────────────────────────────

/** True when `val` written as a plain YAML scalar parses back as exactly that string. */
function readsBackPlain(val: string): boolean {
  try {
    return yaml.load(val) === val;
  } catch {
    return false;
  }
}

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
 *   - and anything else whose plain form would not read back as the same string: a date
 *     (`2026-08-05`), number, boolean, `null`, `~`, an empty string, `- x`, a tag or anchor, a
 *     ` #` comment, leading spaces. A rewrite (`move`, `patch`, `edit`) must not change a value's type.
 */
function serializeScalar(val: unknown): string {
  if (typeof val === 'string') {
    if (
      !readsBackPlain(val) ||
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

/** Renders one item of a YAML block sequence — a nested mapping or a plain scalar. */
function serializeSequenceItem(item: unknown): string {
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
  return `  - ${serializeScalar(item)}`;
}

/** Renders one key of a YAML block mapping, block-sequencing nested arrays (e.g. uses.rules). */
function serializeMappingEntry(ik: string, iv: unknown): string {
  if (Array.isArray(iv)) {
    if (iv.length === 0) return `  ${ik}: []`;
    const items = iv.map(item => `    - ${serializeScalar(item)}`).join('\n');
    return `  ${ik}:\n${items}`;
  }
  return `  ${ik}: ${serializeScalar(iv)}`;
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
    return `${key}:\n${val.map(serializeSequenceItem).join('\n')}`;
  }
  if (typeof val === 'object' && val !== null) {
    const lines = Object.entries(val as Record<string, unknown>)
      .map(([ik, iv]) => serializeMappingEntry(ik, iv))
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
