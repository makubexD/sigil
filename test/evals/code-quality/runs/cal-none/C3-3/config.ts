import { readFile } from 'node:fs/promises';

export type Config = {
  host: string;
  port: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
};

const DEFAULTS: Config = { host: 'localhost', port: 8080, logLevel: 'info' };

const LOG_LEVELS: readonly string[] = ['debug', 'info', 'warn', 'error'];

export async function loadConfig(path: string): Promise<Config> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (err) {
    // A missing config file is fine: run on defaults.
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
  const fields = raw as Record<string, unknown>;
  const config: Config = { ...DEFAULTS };

  if (fields.host !== undefined) {
    if (typeof fields.host !== 'string') {
      throw new Error(`Config file ${path}: "host" must be a string`);
    }
    config.host = fields.host;
  }
  if (fields.port !== undefined) {
    if (typeof fields.port !== 'number' || !Number.isInteger(fields.port)) {
      throw new Error(`Config file ${path}: "port" must be an integer`);
    }
    config.port = fields.port;
  }
  if (fields.logLevel !== undefined) {
    if (typeof fields.logLevel !== 'string' || !LOG_LEVELS.includes(fields.logLevel)) {
      throw new Error(`Config file ${path}: "logLevel" must be one of ${LOG_LEVELS.join(', ')}`);
    }
    config.logLevel = fields.logLevel as Config['logLevel'];
  }

  return config;
}
