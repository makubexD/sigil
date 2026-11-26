export interface Connection {
  host: string;
  database: string;
  user: string;
}

/** Schemes the service can connect to. */
export const SUPPORTED_SCHEMES = ['postgres', 'postgresql'];
