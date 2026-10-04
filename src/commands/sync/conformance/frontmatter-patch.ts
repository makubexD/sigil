/**
 * Byte-preserving frontmatter patch application — shared by fix-mechanical.ts (deterministic
 * fixes) and editorial-rails.ts (model-proposed fixes). Both must avoid reformatting untouched
 * frontmatter lines when writing a patch back to disk: a full parse-and-reserialize (via
 * gray-matter + a generic YAML stringifier) silently strips intentional quoting from every field
 * the patch didn't touch, not just the one it did. Only the exact lines a patch adds/removes are
 * ever touched here.
 *
 * @module
 */
import { serializeYamlEntry } from '../../../authoring/frontmatter';
import { SigilError } from '../../../errors';

export interface FrontmatterBlock {
  readonly frontmatterLines: string[];
  readonly bodyStart: number;
}

const FENCE = '---';

/**
 * Splits a raw file into its `---\n...\n---` frontmatter lines and the line index the body starts
 * at. The closing fence is the first later line starting with `---`, as gray-matter (the loader)
 * reads it: text after it on that line (`---# Title`) is the start of the body, which
 * extractOriginalBody keeps. Throws when there is no closing fence rather than letting a writer
 * emit an empty frontmatter block.
 */
export function splitFrontmatterBlock(raw: string): FrontmatterBlock {
  const lines = raw.split(/\r?\n/);
  if (lines[0]?.trimEnd() !== FENCE)
    throw new SigilError('file has no opening --- frontmatter fence; not rewriting it');
  const closeIdx = lines.findIndex((line, i) => i > 0 && line.startsWith(FENCE));
  if (closeIdx < 1)
    throw new SigilError('frontmatter has no closing --- fence; not rewriting this file');
  return { frontmatterLines: lines.slice(1, closeIdx), bodyStart: closeIdx + 1 };
}

/**
 * The character offset where the body starts in `raw`: just past the closing fence and its line
 * break, where gray-matter's `content` starts. Found from the fence, never by searching for the
 * body text (an empty body, or a body that also appears in the frontmatter, would match early).
 */
export function bodyOffset(raw: string): number {
  const closeLine = splitFrontmatterBlock(raw).bodyStart - 1;
  let pos = 0;
  for (let i = 0; i < closeLine; i++) pos = raw.indexOf('\n', pos) + 1;
  pos += FENCE.length;
  const lineBreak = /^\r?\n/.exec(raw.slice(pos))?.[0] ?? '';
  return pos + lineBreak.length;
}

/** Lines not naming a patched key — a patched key's continuation lines (indented) drop with it. */
function dropPatchedKeys(lines: readonly string[], patchedKeys: ReadonlySet<string>): string[] {
  const kept: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? '';
    const key = line.match(/^([A-Za-z][A-Za-z0-9_-]*):/)?.[1];
    if (key && patchedKeys.has(key)) {
      i++;
      while (i < lines.length && /^[ \t]/.test(lines[i] ?? '')) i++; // skip continuation lines
      continue;
    }
    kept.push(line);
    i++;
  }
  return kept;
}

/**
 * Applies a patch to the ORIGINAL frontmatter lines, byte-preserving every untouched key. Only
 * keys actually in `patch` are added, removed, or replaced; `undefined` removes an existing key.
 *
 * A patched key's ENTIRE span is dropped, not just its header line — a multi-line value (a block
 * scalar `>-` continuation, or a nested array like `appliesTo:\n  - "**\/*.ts"`) is every
 * subsequent indented line, which `dropPatchedKeys` walks past before resuming. `added` is built
 * from `patch` directly (not a map mutated during the drop scan) — building it from a map that
 * had already had matched keys deleted was the bug: overwriting an EXISTING key deleted it and
 * then found nothing left to re-add, silently dropping the key. `when-to-use-lift` only ever adds
 * a brand-new key, so it never exercised this path; `when-to-use-quality` (which overwrites an
 * existing `whenToUse`) hit it immediately.
 */
export function applyFrontmatterPatch(
  lines: readonly string[],
  patch: Record<string, unknown>,
): string[] {
  const kept = dropPatchedKeys(lines, new Set(Object.keys(patch)));
  const added = Object.entries(patch)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => serializeYamlEntry(key, value));
  return [...kept, ...added];
}

/** The body text of a raw file, given where the frontmatter block ends (text after the fence too). */
export function extractOriginalBody(raw: string, bodyStart: number): string {
  const lines = raw.split(/\r?\n/);
  const afterFence = (lines[bodyStart - 1] ?? '').slice(FENCE.length);
  return [afterFence, ...lines.slice(bodyStart)].join('\n').trim();
}
