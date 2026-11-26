/** Expands a page list such as "1-3, 7" into [1, 2, 3, 7]: sorted, without duplicates. */
export function parseRange(spec: string): number[] {
  const out: number[] = [];
  for (const part of spec.split(',')) {
    const text = part.trim();
    if (text === '') continue;
    const match = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(text);
    if (!match) throw new SyntaxError(`not a page or a range: ${text}`);
    const start = Number(match[1]);
    const end = match[2] === undefined ? start : Number(match[2]);
    if (start > end) throw new RangeError(`range runs backwards: ${text}`);
    for (let page = start; page <= end; page++) out.push(page);
  }
  return [...new Set(out)].sort((a, b) => a - b);
}
