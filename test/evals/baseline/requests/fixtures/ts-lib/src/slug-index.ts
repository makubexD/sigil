import { slugify } from './slug.ts';

/** Maps each title to its slug; a later title with the same slug gets a numeric suffix. */
export function slugIndex(titles: string[]): Map<string, string> {
  const taken = new Set<string>();
  const index = new Map<string, string>();
  for (const title of titles) {
    const base = slugify(title);
    let slug = base;
    for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
    taken.add(slug);
    index.set(title, slug);
  }
  return index;
}
