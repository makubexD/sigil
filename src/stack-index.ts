/**
 * The stack table of a shared skill whose stack text lives in stack parts (load-references.ts).
 * SKILL.md holds `<!-- stack-index -->` where the table goes; resolve.ts replaces it with one row per
 * part, labelled by the part's own H1 (the language layer names its libraries, the shared skill
 * names none) and linked by the path the part ships at. The table is generated at resolve time, so
 * the source SKILL.md stays neutral and an authoring command that rewrites it never bakes it in.
 *
 * @module
 */
import type { ReferenceFile } from './types';

export const STACK_INDEX_MARKER = '<!-- stack-index -->';

const STACK_FILE_RE = /^stack-.+\.md$/;
const H1_RE = /^#[ \t]+(.+?)[ \t]*$/m;

/** Whether `name` is a stack file (`stack-<stack>.md`). */
export function isStackFile(name: string): boolean {
  return STACK_FILE_RE.test(name);
}

/** One table row: the part's H1 (its file name when it has none) and a link to it. */
function row(ref: ReferenceFile): string {
  const label = H1_RE.exec(ref.content)?.[1] ?? ref.name;
  const link = `references/${ref.name}`;
  return `| ${label} | [\`${link}\`](${link}) |`;
}

/** `body` with the marker replaced by the table of `references`' stack files, in name order. */
export function fillStackIndex(body: string, references: readonly ReferenceFile[] = []): string {
  if (!body.includes(STACK_INDEX_MARKER)) return body;
  const rows = references.filter(ref => isStackFile(ref.name)).map(row);
  const table = ['| Stack | File |', '|---|---|', ...rows].join('\n');
  return body.replace(STACK_INDEX_MARKER, table);
}
