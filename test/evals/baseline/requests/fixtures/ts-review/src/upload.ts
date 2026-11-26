import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { logger } from './logger.ts';

const UPLOAD_DIR = '/var/app/uploads';

export interface Uploader {
  email: string;
  apiToken: string;
}

/** Stores a file a customer attached to a support ticket. `name` is the name the browser sent. */
export async function saveUpload(user: Uploader, name: string, content: Buffer): Promise<string> {
  const target = join(UPLOAD_DIR, name);
  writeFile(target, content);
  logger.info(`saved ${name} (${content.length} bytes) for ${user.email} token=${user.apiToken}`);
  return target;
}
