/**
 * The single process-exit point for the CLI. Every command handler throws
 * `SigilError` (or lets an unexpected error propagate); `cli.ts` catches whatever
 * `parseAsync` rejects with and hands it here.
 *
 * @module
 */
import { CommanderError } from 'commander';
import { SigilError, EXIT } from './errors';

/**
 * Formats and reports a fatal error, then exits.
 *
 * Commander's own exits (help, version, usage errors) arrive here as `CommanderError` because
 * `cli.ts` calls `exitOverride()`. Commander has already printed its message, so only the exit code
 * is kept, set via `process.exitCode` so Node drains stdout before exiting. A `process.exit()` right
 * after a console write can drop the output on Windows (`npm run sigil help` printed nothing).
 */
export function handleFatal(err: unknown): void {
  if (err instanceof CommanderError) {
    process.exitCode = err.exitCode;
    return;
  }
  const isSigilError = err instanceof SigilError;
  const message = err instanceof Error ? err.message : String(err);

  console.error(`✗ ${message}`);
  if (isSigilError && err.hint) console.error(err.hint);
  if (!isSigilError && process.env.SIGIL_DEBUG && err instanceof Error && err.stack) {
    console.error(err.stack);
  }

  process.exit(isSigilError ? err.exitCode : EXIT.USER);
}
