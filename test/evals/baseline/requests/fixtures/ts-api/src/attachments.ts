import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

/** Folder the files customers attach to a ticket are stored in. */
export const ATTACHMENTS_DIR = join(process.cwd(), 'data', 'attachments');

/** Names of the stored attachments. */
export async function listAttachments(): Promise<string[]> {
  return (await readdir(ATTACHMENTS_DIR)).sort();
}
