import { Injectable } from '@angular/core';

export type LogContext = Record<string, unknown>;

const plain = (value: unknown): unknown =>
  value instanceof Error ? { name: value.name, message: value.message, stack: value.stack } : value;

/**
 * The app's logger. Each record goes to the log collector, where everyone in the company can search
 * it. `context` holds the facts of the record, one field each, so they can be filtered on.
 */
@Injectable({ providedIn: 'root' })
export class LoggerService {
  debug(message: string, context: LogContext = {}): void {
    this.send('debug', message, context);
  }

  info(message: string, context: LogContext = {}): void {
    this.send('info', message, context);
  }

  warn(message: string, context: LogContext = {}): void {
    this.send('warn', message, context);
  }

  error(message: string, context: LogContext = {}): void {
    this.send('error', message, context);
  }

  private send(level: string, message: string, context: LogContext): void {
    const fields = Object.fromEntries(
      Object.entries(plain(context) as LogContext).map(([key, value]) => [key, plain(value)]),
    );
    navigator.sendBeacon('/logs', JSON.stringify({ level, message, context: fields }));
  }
}
