import { readFile } from 'node:fs/promises';

export type Config = {
  host: string;
  port: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
};

const DEFAULTS: Config = { host: 'localhost', port: 8080, logLevel: 'info' };

const LOG_LEVELS: readonly string[] = ['debug', 'info', 'warn', 'error'];

/**
 * Loads config from the JSON file at `path`, layered over the defaults.
 * A missing file yields the defaults; an unreadable, unparsable or invalid
 * file throws so the misconfiguration is not silently ignored.
 */
export async function loadConfig(path: string): Promise<Config> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (err) {
    if ((err as { code?: unknown }).code === 'ENOENT') return { ...DEFAULTS };
    throw new Error(`Cannot read config file ${path}`, { cause: err });
  }

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (err) {
    throw new Error(`Cannot parse config file ${path}`, { cause: err });
  }

  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new Error(`Config file ${path} must contain a JSON object`);
  }
  const raw = data as Record<string, unknown>;
  const config: Config = { ...DEFAULTS };

  if (raw.host !== undefined) {
    if (typeof raw.host !== 'string' || raw.host === '') {
      throw new Error(`Config file ${path}: "host" must be a non-empty string`);
    }
    config.host = raw.host;
  }
  if (raw.port !== undefined) {
    if (typeof raw.port !== 'number' || !Number.isInteger(raw.port) || raw.port < 0 || raw.port > 65535) {
      throw new Error(`Config file ${path}: "port" must be an integer from 0 to 65535`);
    }
    config.port = raw.port;
  }
  if (raw.logLevel !== undefined) {
    if (typeof raw.logLevel !== 'string' || !LOG_LEVELS.includes(raw.logLevel)) {
      throw new Error(`Config file ${path}: "logLevel" must be one of ${LOG_LEVELS.join(', ')}`);
    }
    config.logLevel = raw.logLevel as Config['logLevel'];
  }

  return config;
}
