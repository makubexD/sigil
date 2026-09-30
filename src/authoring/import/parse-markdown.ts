/**
 * Tolerant frontmatter + body parser for source Claude template markdown files.
 * Split out of discover.ts to keep that file under the repo's own module-size threshold.
 *
 * We do NOT use gray-matter here because the source Claude template files contain
 * unquoted description strings with colons (e.g., "description: Fix: the bug"), which
 * strict YAML parsers reject. Instead we parse the frontmatter line-by-line:
 *   - A line with `key: value` → key = value (string; everything after the first `: `)
 *   - Special-case: boolean true/false, simple numeric scalars
 *   - A line that looks like `key:` with YAML indented children (e.g. `paths:`) → collect as array
 *
 * This is intentionally tolerant: accuracy matters more than strict YAML compliance
 * for the source-import path.
 *
 * @module
 */
import fs from 'fs';
import path from 'path';

/** YAML frontmatter fence, as it appears at the start and end of a source file. */
const FRONTMATTER_FENCE = '---';
/** The closing fence as it appears mid-file: a newline followed by the fence. */
const CLOSING_FENCE = `\n${FRONTMATTER_FENCE}`;
/** Length of the `- ` YAML list-item marker, stripped from collected list values. */
const LIST_ITEM_MARKER_LEN = 2;

/** Strips a single layer of matching surrounding quotes ("..." or '...'), if present. */
function stripSurroundingQuotes(s: string): string {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

/** True when `line` is indented (a YAML child of the previous key). */
function isIndentedLine(line: string | undefined): boolean {
  return (line ?? '').startsWith('  ') || (line ?? '').startsWith('\t');
}

/**
 * Collects the run of indented list-item lines starting at `lines[startIdx]`.
 * Returns the parsed items (with `- ` markers and quotes stripped) and the index
 * of the first line after the run.
 */
function collectIndentedListItems(
  lines: string[],
  startIdx: number,
): { items: string[]; nextIndex: number } {
  const items: string[] = [];
  let j = startIdx;
  while (j < lines.length && isIndentedLine(lines[j])) {
    let item = (lines[j] ?? '').trim();
    if (item.startsWith('- ')) item = item.slice(LIST_ITEM_MARKER_LEN);
    item = stripSurroundingQuotes(item);
    items.push(item);
    j++;
  }
  return { items, nextIndex: j };
}

/** Parses a single scalar frontmatter value: booleans, numbers, quoted/bare strings. */
function parseScalarValue(valStr: string): unknown {
  if (valStr === 'true') return true;
  if (valStr === 'false') return false;
  if (valStr !== '' && !isNaN(Number(valStr))) return Number(valStr);
  return stripSurroundingQuotes(valStr);
}

/**
 * Parses one `key: value` (or `key:` + indented list) frontmatter entry starting at
 * `lines[i]`. Returns undefined if the line has no key (blank/indented/no colon), in
 * which case the caller should just advance past it.
 */
function parseFrontmatterLine(
  lines: string[],
  i: number,
): { key: string; value: unknown; nextIndex: number } | undefined {
  const line: string = lines[i] ?? '';
  if (!line.trim() || isIndentedLine(line)) return undefined;

  const colonIdx = line.indexOf(':');
  if (colonIdx === -1) return undefined;

  const key = line.slice(0, colonIdx).trim();
  const valStr = line.slice(colonIdx + 1).trimStart();
  if (!key) return undefined;

  if (valStr === '' || valStr === '\n') {
    const { items, nextIndex } = collectIndentedListItems(lines, i + 1);
    if (items.length > 0) return { key, value: items, nextIndex };
  }

  return { key, value: parseScalarValue(valStr), nextIndex: i + 1 };
}

/** Parses frontmatter line-by-line (see parseMarkdown's doc comment for the tolerant format). */
function parseFrontmatterLines(frontmatterText: string): Record<string, unknown> {
  const fm: Record<string, unknown> = {};
  const lines = frontmatterText.split('\n');
  let i = 0;
  while (i < lines.length) {
    const parsed = parseFrontmatterLine(lines, i);
    if (!parsed) {
      i++;
      continue;
    }
    fm[parsed.key] = parsed.value;
    i = parsed.nextIndex;
  }
  return fm;
}

/** Parse a markdown file with simple, tolerant frontmatter (see module doc for why). */
export function parseMarkdown(filePath: string): {
  frontmatter: Record<string, unknown>;
  body: string;
} {
  const raw = fs.readFileSync(filePath, 'utf-8');

  // Must start with ---
  if (!raw.startsWith(FRONTMATTER_FENCE)) {
    return { frontmatter: {}, body: raw };
  }

  // Find closing ---
  const rest = raw.slice(FRONTMATTER_FENCE.length);
  const closeIdx = rest.indexOf(CLOSING_FENCE);
  if (closeIdx === -1) {
    return { frontmatter: {}, body: raw };
  }

  const frontmatterText = rest.slice(0, closeIdx);
  const body = rest.slice(closeIdx + CLOSING_FENCE.length); // skip \n---

  return { frontmatter: parseFrontmatterLines(frontmatterText), body };
}

export function stemOf(filePath: string): string {
  return path.basename(filePath).replace(/\.md$/, '');
}
