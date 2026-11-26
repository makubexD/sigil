export interface Config {
  region: string;
  retries: number;
}

/** Thrown when a job's configuration can't be loaded. */
export class ConfigError extends Error {
  override name = 'ConfigError';
}

export function isValidRegion(region: string): boolean {
  return /^[a-z]{2}-[a-z]+-\d$/.test(region);
}
