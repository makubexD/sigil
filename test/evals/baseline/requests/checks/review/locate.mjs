// Where in a review a planted defect is named, and whether the review says where it is.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FIXTURES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'fixtures');
/** How far from the words that name a defect its place may be written, in characters. */
const REACH = 320;
/** How many lines off a line number may be. */
const SLACK = 3;

/** The 1-based line ranges a case was planted on: one per entry of `at`, each a text or [first, last]. */
export function plantedLines(spec) {
  const lines = readFileSync(path.join(FIXTURES, spec.fixture, spec.file), 'utf8').split('\n');
  const lineOf = text => {
    const hits = lines.flatMap((line, index) => (line.includes(text) ? [index + 1] : []));
    if (hits.length !== 1) throw new Error(`${spec.file}: ${hits.length} lines hold ${text}`);
    return hits[0];
  };
  return spec.at
    .map(place => [place].flat())
    .map(place => [lineOf(place[0]), lineOf(place.at(-1))]);
}

/** Every line reference in a text: "line 42", "lines 40-44", "L42", "file.go:42". */
function lineRefs(text) {
  const pattern = /(?:\blines?\s+|\bL|#L|:)(\d{1,4})(?:\s*(?:-|–|—|to|and)\s*L?(\d{1,4}))?/gi;
  return [...text.matchAll(pattern)].map(match => ({
    index: match.index,
    first: Number(match[1]),
    last: Number(match[2] ?? match[1]),
  }));
}

/**
 * The file a place in the answer is about: a file name written on the same line, or else the last
 * one written above it (a heading over a list of findings), or else the first one below.
 */
function fileAt(answer, index, names) {
  const lineStart = answer.lastIndexOf('\n', index - 1) + 1;
  const lineEnd = (answer.indexOf('\n', index) + 1 || answer.length + 1) - 1;
  const mentions = names
    .flatMap(name => [...answer.matchAll(new RegExp(name.replace(/\./g, '\\.'), 'g'))])
    .map(match => ({ name: match[0], at: match.index }))
    .sort((a, b) => a.at - b.at);
  const onLine = mentions.filter(mention => mention.at >= lineStart && mention.at < lineEnd);
  if (onLine.length)
    return onLine.reduce((best, mention) =>
      Math.abs(mention.at - index) < Math.abs(best.at - index) ? mention : best,
    ).name;
  return (mentions.findLast(mention => mention.at < index) ?? mentions[0])?.name;
}

/**
 * Whether the answer names the defect and says where it is. `spec`: { fixture, file, at, words, fn },
 * and `group`, the files the request asked about.
 */
export function located(answer, spec) {
  const ranges = plantedLines(spec);
  const own = path.basename(spec.file);
  const names = spec.group.map(file => path.basename(file));
  const refs = lineRefs(answer);
  let named = false;
  for (const match of answer.matchAll(new RegExp(spec.words.source, 'gis'))) {
    named = true;
    const from = Math.max(0, match.index - REACH);
    const to = match.index + match[0].length + REACH;
    if (spec.fn.test(answer.slice(from, to))) return { ok: true };
    const placed = refs.some(
      ref =>
        ref.index >= from &&
        ref.index < to &&
        ranges.some(([first, last]) => ref.last >= first - SLACK && ref.first <= last + SLACK) &&
        (fileAt(answer, ref.index, names) ?? own) === own,
    );
    if (placed) return { ok: true };
  }
  const where = ranges
    .map(([first, last]) => (last > first ? `${first}-${last}` : first))
    .join(', ');
  return { ok: false, why: named ? `named, but not placed at ${own}:${where}` : 'not named' };
}
