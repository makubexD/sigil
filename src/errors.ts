/**
 * Error taxonomy for CLI commands — deliberately minimal: one class, one factory,
 * two exit codes.
 *
 * Before this module, 45 `process.exit(1)` calls were scattered across 22 command
 * files (`process.exit` inside a shared helper even killed the process from a module
 * imported by 9 others), and 69 `console.error` sites each hand-formatted the same
 * `✗ ` prefix. Every command now throws `SigilError` instead; `cli-error.ts`'s
 * `handleFatal` is the single place that formats the message and calls `process.exit`.
 *
 * @module
 */

/** Process exit codes. 1 = the user can fix it (bad input, not found, conflict). */
export const EXIT = { USER: 1 } as const;
export type ExitCode = (typeof EXIT)[keyof typeof EXIT];

/** The error type CLI commands throw for any user-facing failure. */
export class SigilError extends Error {
  readonly exitCode: ExitCode;
  readonly hint: string | undefined;

  constructor(message: string, opts: { exitCode?: ExitCode; hint?: string; cause?: unknown } = {}) {
    super(message, opts.cause !== undefined ? { cause: opts.cause } : undefined);
    this.name = 'SigilError';
    this.exitCode = opts.exitCode ?? EXIT.USER;
    this.hint = opts.hint;
  }
}

/** Name part of an id — everything after the last `/`. */
function namePart(id: string): string {
  return id.slice(id.lastIndexOf('/') + 1);
}

/** Levenshtein edit distance between two strings. */
function levenshtein(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr.push(
        Math.min(
          (prev[j] as number) + 1,
          (curr[j - 1] as number) + 1,
          (prev[j - 1] as number) + cost,
        ),
      );
    }
    prev = curr;
  }
  return prev[b.length] as number;
}

/** Default suggestion cap, edit-distance floor/divisor, and containment minimum length. */
const SUGGESTION_LIMIT = 5;
const MIN_EDIT_DISTANCE = 2;
const DISTANCE_DIVISOR = 4;
const MIN_CONTAINS_LENGTH = 3;

/** Rank 1: ids whose name part equals `query`'s under a different prefix. */
function sameNameUnderOtherPrefix(query: string, availableIds: readonly string[]): string[] {
  const queryName = namePart(query);
  return availableIds.filter(candidate => {
    const lower = candidate.toLowerCase();
    return lower !== query && namePart(lower) === queryName;
  });
}

/** Rank 2: ids within a small edit distance of `query`, closest first, ties by id. */
function withinEditDistance(query: string, availableIds: readonly string[]): string[] {
  const threshold = Math.max(MIN_EDIT_DISTANCE, Math.floor(query.length / DISTANCE_DIVISOR));
  return availableIds
    .filter(candidate => candidate.toLowerCase() !== query)
    .map(candidate => ({ candidate, distance: levenshtein(query, candidate.toLowerCase()) }))
    .filter(({ distance }) => distance <= threshold)
    .sort((a, b) =>
      a.distance !== b.distance ? a.distance - b.distance : a.candidate.localeCompare(b.candidate),
    )
    .map(({ candidate }) => candidate);
}

/** Rank 3: ids whose name part contains `query`'s name part, or the reverse. */
function namePartContains(query: string, availableIds: readonly string[]): string[] {
  const queryName = namePart(query);
  return availableIds.filter(candidate => {
    const candidateName = namePart(candidate.toLowerCase());
    if (Math.min(candidateName.length, queryName.length) < MIN_CONTAINS_LENGTH) return false;
    return candidateName.includes(queryName) || queryName.includes(candidateName);
  });
}

/**
 * Suggest up to `max` existing ids close to `id`, best matches first.
 * Ranked: same name part under a different prefix, then small edit distance,
 * then one name part containing the other. Case-insensitive, deduped.
 */
export function suggestIds(
  id: string,
  availableIds: readonly string[],
  max = SUGGESTION_LIMIT,
): string[] {
  const query = id.toLowerCase();
  const chosen: string[] = [];
  for (const candidate of [
    ...sameNameUnderOtherPrefix(query, availableIds),
    ...withinEditDistance(query, availableIds),
    ...namePartContains(query, availableIds),
  ]) {
    const lower = candidate.toLowerCase();
    if (chosen.length < max && !chosen.some(c => c.toLowerCase() === lower)) chosen.push(candidate);
  }
  return chosen;
}

/**
 * Standard "artifact not found" error: names the closest existing ids instead of
 * dumping the catalog, plus a browse hint. Replaces 5 verbatim copies across
 * commands/{delete,get,edit,patch,retarget}.ts.
 */
export function notFoundError(
  label: string,
  id: string,
  availableIds: readonly string[],
): SigilError {
  const suggestions = suggestIds(id, availableIds);
  const didYouMean = suggestions.length > 0 ? ` Did you mean: ${suggestions.join(', ')}?` : '';
  return new SigilError(`${label} '${id}' not found.${didYouMean}`, {
    hint: 'Run sigil list or sigil search <word> to browse.',
  });
}
