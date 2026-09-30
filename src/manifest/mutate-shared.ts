/** Shared by mutate.ts and mutate-config.ts — kept in its own file to avoid a circular import. */

/** Append each id in `toAdd` that isn't already present in `existing` (mutated in place). */
export function mergeDependentOf(existing: string[], toAdd: string[]): void {
  for (const parent of toAdd) {
    if (!existing.includes(parent)) existing.push(parent);
  }
}
