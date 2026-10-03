/**
 * YAML serialization utilities for adapter frontmatter emission.
 *
 * Why hand-roll instead of yaml.dump?
 * Both adapters build frontmatter as template strings, not via a yaml serializer.
 * Rather than restructuring both emitters, this helper makes every description emit
 * as a double-quoted scalar that is safe for any content.
 */

/**
 * Serializes a string as a YAML double-quoted scalar.
 *
 * Folds embedded newlines to a single space (consistent with how `>-` is parsed
 * by gray-matter — the canonical source style for descriptions), escapes
 * backslashes and double-quotes, and wraps in double-quotes.
 *
 * Safe for any content — colons, special characters, and long text cannot produce
 * invalid YAML when wrapped this way.
 *
 * @example
 * yamlScalar('A long description.')  // → '"A long description."'
 * yamlScalar('Has: colon inside')    // → '"Has: colon inside"'
 * yamlScalar('Line 1\nLine 2')       // → '"Line 1 Line 2"'
 */
export function yamlScalar(s: string): string {
  const normalized = s.replace(/\n+/g, ' ').trim();
  const escaped = normalized.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `"${escaped}"`;
}

/** Characters a comma-separated list may use and still be a plain YAML scalar no key can hide in. */
const PLAIN_LIST_RE = /^[A-Za-z0-9_][A-Za-z0-9_.()/ ,-]*$/;

/**
 * Joins tool names into one comma-separated frontmatter value (`tools: Read, Grep`), the form both
 * tools read. Plain names stay unquoted; anything else (a permission pattern with `:` or `*`) is
 * double-quoted, so the line always parses back to exactly the names given.
 */
export function yamlList(values: readonly string[]): string {
  const joined = values.join(', ');
  return PLAIN_LIST_RE.test(joined) ? joined : yamlScalar(joined);
}
