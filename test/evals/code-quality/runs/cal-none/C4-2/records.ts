export type LedgerRecord = { id: string; amountCents: number };

export type RecordReader = {
  read(): Promise<LedgerRecord | null>;
  close(): Promise<void>;
};

/**
 * Opens one reader, passes each record to `handle` in order until `read()` returns `null`, and
 * resolves with the number of records handled.
 *
 * Readers are a scarce, service-wide resource, so the reader is always closed — on success and
 * when `read` or `handle` fails. A failure from `read` or `handle` takes precedence over a failure
 * from `close`; if only `close` fails, that error is the rejection.
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
  } catch (err) {
    try {
      await reader.close();
    } catch {
      // Keep the original error; it explains why processing stopped.
    }
    throw err;
  }
  await reader.close();
  return count;
}
