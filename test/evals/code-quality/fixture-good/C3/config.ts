import { readFile } from 'node:fs/promises';

export type Config = { host: string; port: number; logLevel: 'debug' | 'info' | 'warn' | 'error' };

const DEFAULTS: Config = { host: 'localhost', port: 8080, logLevel: 'info' };

export async function loadConfig(path: string): Promise<Config> {
  try {
    return { ...DEFAULTS, ...JSON.parse(await readFile(path, 'utf8')) };
  } catch (error) {
    // Only a missing file means "use the defaults"; anything else is a misconfiguration.
    if ((error as { code?: unknown }).code === 'ENOENT') return { ...DEFAULTS };
    throw new Error(`Cannot load config file ${path}`, { cause: error });
  }
}
