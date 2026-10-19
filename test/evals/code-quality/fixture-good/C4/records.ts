export type LedgerRecord = { id: string; amountCents: number };

export type RecordReader = {
  read(): Promise<LedgerRecord | null>;
  close(): Promise<void>;
};

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
  } finally {
    // Readers are scarce: give this one back even when read or handle fails.
    await reader.close();
  }
  return count;
}
