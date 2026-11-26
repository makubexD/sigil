export type Level = 'debug' | 'info' | 'warn' | 'error';

export interface LogRecord {
  level: Level;
  fields: Record<string, unknown>;
  message: string;
}

/** Everything logged so far; the shipper drains it to the log pipeline. */
export const records: LogRecord[] = [];

type Write = {
  (message: string): void;
  (fields: Record<string, unknown>, message: string): void;
};

const at =
  (level: Level): Write =>
  (first: string | Record<string, unknown>, message?: string): void => {
    if (typeof first === 'string') records.push({ level, fields: {}, message: first });
    else records.push({ level, fields: first, message: message ?? '' });
  };

/** The service logger: `logger.info('started')` or `logger.info({ orderId }, 'order saved')`. */
export const logger = {
  debug: at('debug'),
  info: at('info'),
  warn: at('warn'),
  error: at('error'),
};
