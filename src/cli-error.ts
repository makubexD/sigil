/**
 * The single process-exit point for the CLI. Every command handler throws
 * `SigilError` (or lets an unexpected error propagate); `cli.ts` catches whatever
 * `parseAsync` rejects with and hands it here.
 *
 * @module
 */
import { SigilError, EXIT } from './errors';

/** Formats and reports a fatal error, then exits. Never returns. */
export function handleFatal(err: unknown): never {
  const isSigilError = err instanceof SigilError;
  const message = err instanceof Error ? err.message : String(err);

  console.error(`✗ ${message}`);
  if (isSigilError && err.hint) console.error(err.hint);
  if (!isSigilError && process.env.SIGIL_DEBUG && err instanceof Error && err.stack) {
    console.error(err.stack);
  }

  process.exit(isSigilError ? err.exitCode : EXIT.USER);
}
