import { readFile } from 'node:fs/promises';

export type Config = {
  host: string;
  port: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
};

const DEFAULTS: Config = { host: 'localhost', port: 8080, logLevel: 'info' };

const LOG_LEVELS: ReadonlyArray<Config['logLevel']> = ['debug', 'info', 'warn', 'error'];

/**
 * Loads the config at `path`, layering the fields it sets over the defaults.
 * A missing file yields the defaults; an unreadable, unparsable or invalid file throws.
 */
export async function loadConfig(path: string): Promise<Config> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (err) {
    if ((err as { code?: unknown }).code === 'ENOENT') return { ...DEFAULTS };
    throw new Error(`Cannot read config file ${path}`, { cause: err });
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    throw new Error(`Cannot parse config file ${path}`, { cause: err });
  }

  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error(`Config file ${path} must contain a JSON object`);
  }
  const file = raw as Record<string, unknown>;
  const config: Config = { ...DEFAULTS };

  if ('host' in file) {
    if (typeof file.host !== 'string') {
      throw new Error(`Config file ${path}: "host" must be a string`);
    }
    config.host = file.host;
  }
  if ('port' in file) {
    if (typeof file.port !== 'number' || !Number.isInteger(file.port)) {
      throw new Error(`Config file ${path}: "port" must be an integer`);
    }
    config.port = file.port;
  }
  if ('logLevel' in file) {
    if (!LOG_LEVELS.includes(file.logLevel as Config['logLevel'])) {
      throw new Error(`Config file ${path}: "logLevel" must be one of ${LOG_LEVELS.join(', ')}`);
    }
    config.logLevel = file.logLevel as Config['logLevel'];
  }

  return config;
}
