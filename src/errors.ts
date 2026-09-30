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

/**
 * Standard "artifact not found → here's what exists" error.
 * Replaces 5 verbatim copies across commands/{delete,get,edit,patch,retarget}.ts.
 */
export function notFoundError(
  label: string,
  id: string,
  availableIds: readonly string[],
): SigilError {
  const available = availableIds.join(', ') || '(none)';
  return new SigilError(`${label} '${id}' not found. Available: ${available}`);
}
