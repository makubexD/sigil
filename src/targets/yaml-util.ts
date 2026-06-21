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
