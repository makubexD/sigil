/**
 * H2 headings of a Markdown body, for comparing an artifact's section skeleton with its family's
 * (`family-skeleton`). Headings inside fenced code are not headings. Step numbering is not part of
 * a section's identity: `## 1. Reproduce`, `## Step 1 — Reproduce` and `## Reproduce` are the same
 * section, so a member may number its steps or not.
 *
 * @module
 */

const FENCE_RE = /^\s*(```|~~~)/;
const H2_RE = /^##\s+(.+?)\s*#*\s*$/;
const STEP_NUMBER_RE = /^(?:step\s+)?\d+[.):]?\s*(?:[—–:-]\s*)?/i;

/** The text of every `## ` heading outside fenced code, in order. */
export function h2Headings(body: string): string[] {
  const headings: string[] = [];
  let fence: string | undefined;
  for (const line of body.split('\n')) {
    const marker = FENCE_RE.exec(line)?.[1];
    if (marker) {
      if (fence === undefined) fence = marker;
      else if (marker === fence) fence = undefined;
      continue;
    }
    if (fence !== undefined) continue;
    const heading = H2_RE.exec(line)?.[1];
    if (heading !== undefined) headings.push(heading);
  }
  return headings;
}

/** A heading's identity: step numbering dropped, whitespace collapsed, case folded. */
export function sectionKey(heading: string): string {
  return heading.replace(STEP_NUMBER_RE, '').replace(/\s+/g, ' ').trim().toLowerCase();
}
