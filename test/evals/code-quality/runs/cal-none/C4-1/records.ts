export type LedgerRecord = { id: string; amountCents: number };

export type RecordReader = {
  read(): Promise<LedgerRecord | null>;
  close(): Promise<void>;
};

/**
 * Opens one reader, passes each record to `handle` in order until `read()`
 * returns `null`, and resolves with the number of records handled.
 *
 * Readers are a scarce, service-wide resource, so the reader is always closed,
 * whether processing succeeds or fails. If `read` or `handle` fails, that error
 * is the one rejected with; a failure from `close` is only surfaced when
 * processing itself succeeded.
 */
export async function processRecords(
  open: () => Promise<RecordReader>,
  handle: (record: LedgerRecord) => Promise<void>,
): Promise<number> {
  const reader = await open();
  let count = 0;
  try {
    for (let record = await reader.read(); record !== null; record = await reader.read()) {
      await handle(record);
      count++;
    }
  } catch (error) {
    try {
      await reader.close();
    } catch {
      // Keep the original failure; it is the one the caller needs to see.
    }
    throw error;
  }
  await reader.close();
  return count;
}
