/**
 * H2 headings of a Markdown body, for comparing an artifact's section skeleton with its family's
 * (`family-skeleton`). Headings inside fenced code are not headings: a fence closes, as in
 * CommonMark, only on a line holding nothing but a run of the same character at least as long as
 * the opening one. Step numbering is not part of a section's identity: `## 1. Reproduce`,
 * `## Step 1 — Reproduce` and `## Reproduce` are the same section, so a member may number its
 * steps or not.
 *
 * @module
 */

const FENCE_RE = /^ {0,3}(`{3,}|~{3,})(.*)$/;
// A closing `#` sequence needs whitespace before it, so `## Use C#` keeps its `#`.
const H2_RE = /^##\s+(.+?)(?:\s+#+)?\s*$/;
// `1. X`, `2) X`, `Step 3: X`, `Step 4 — X`; digits need a separator, so `2FA setup` stays whole.
const STEP_NUMBER_RE = /^(?:step\s+)?\d+(?:[.):]|\s*[—–-])\s*(?:[—–:-]\s*)?/i;

/** Whether `line` closes a fence opened with `open` (a run of ``` ` ``` or `~`). */
function closesFence(line: string, open: string): boolean {
  const match = FENCE_RE.exec(line);
  if (!match) return false;
  const [, run = '', rest = ''] = match;
  return run[0] === open[0] && run.length >= open.length && rest.trim() === '';
}

/** The text of every `## ` heading outside fenced code, in order. */
export function h2Headings(body: string): string[] {
  const headings: string[] = [];
  let fence: string | undefined;
  for (const line of body.split('\n')) {
    if (fence !== undefined) {
      if (closesFence(line, fence)) fence = undefined;
      continue;
    }
    const opening = FENCE_RE.exec(line)?.[1];
    if (opening) {
      fence = opening;
      continue;
    }
    const heading = H2_RE.exec(line)?.[1];
    if (heading !== undefined) headings.push(heading);
  }
  return headings;
}

/** A heading's identity: step numbering dropped, whitespace collapsed, case folded. */
export function sectionKey(heading: string): string {
  return heading.replace(STEP_NUMBER_RE, '').replace(/\s+/g, ' ').trim().toLowerCase();
}
