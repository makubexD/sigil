import { randomUUID } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import type { Pool } from 'pg';

export interface PaymentProvider {
  capture(paymentId: string, amountCents: number): Promise<unknown>;
}

export type LogLevel = 'info' | 'warn' | 'error';
export type LogFn = (level: LogLevel, event: string, fields: Record<string, unknown>) => void;

export interface CaptureDeps {
  pool: Pick<Pool, 'connect'>;
  provider: PaymentProvider;
  log?: LogFn;
}

interface PaymentRow {
  id: string;
  amount_cents: number;
  status: string;
}

type LogContext = { requestId: string; paymentId: string; route: string };

type CaptureOutcome =
  | { kind: 'captured'; amountCents: number; replayed: boolean }
  | { kind: 'not_found' }
  | { kind: 'invalid_state'; status: string }
  | { kind: 'provider_failed' };

// One JSON object per line, so log pipelines can filter on requestId or paymentId across services.
export const jsonLog: LogFn = (level, event, fields) => {
  const line = JSON.stringify({ time: new Date().toISOString(), level, event, service: 'payments', ...fields });
  (level === 'error' ? process.stderr : process.stdout).write(`${line}\n`);
};

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;

function requestIdFrom(req: Request): string {
  const incoming = req.get('x-request-id');
  return incoming && REQUEST_ID_PATTERN.test(incoming) ? incoming : randomUUID();
}

function errorFields(err: unknown): Record<string, unknown> {
  if (err instanceof Error) return { errorName: err.name, errorMessage: err.message };
  return { errorMessage: String(err) };
}

// The card token is deliberately never selected or logged: the provider capture call does not need it.
async function captureInTransaction(
  deps: CaptureDeps,
  log: LogFn,
  paymentId: string,
  base: LogContext,
): Promise<CaptureOutcome> {
  const client = await deps.pool.connect();
  try {
    await client.query('BEGIN');

    // FOR UPDATE makes a duplicate request wait here until the first one commits, then it sees 'captured'.
    const { rows } = await client.query<PaymentRow>(
      'SELECT id, amount_cents, status FROM payments WHERE id = $1 FOR UPDATE',
      [paymentId],
    );
    const payment = rows[0];
    if (!payment) {
      await client.query('ROLLBACK');
      return { kind: 'not_found' };
    }
    if (payment.status === 'captured') {
      await client.query('COMMIT');
      return { kind: 'captured', amountCents: payment.amount_cents, replayed: true };
    }
    if (payment.status !== 'authorized') {
      await client.query('ROLLBACK');
      return { kind: 'invalid_state', status: payment.status };
    }

    const providerStarted = Date.now();
    try {
      await deps.provider.capture(paymentId, payment.amount_cents);
    } catch (err) {
      log('error', 'capture.provider_failed', {
        ...base,
        amountCents: payment.amount_cents,
        durationMs: Date.now() - providerStarted,
        ...errorFields(err),
      });
      await client.query('ROLLBACK');
      return { kind: 'provider_failed' };
    }
    log('info', 'capture.provider_succeeded', {
      ...base,
      amountCents: payment.amount_cents,
      durationMs: Date.now() - providerStarted,
    });

    try {
      await client.query("UPDATE payments SET status = 'captured' WHERE id = $1", [paymentId]);
      await client.query(
        'INSERT INTO ledger_entries (payment_id, entry_type, amount_cents) VALUES ($1, $2, $3)',
        [paymentId, 'capture', payment.amount_cents],
      );
      await client.query('COMMIT');
    } catch (err) {
      // The provider has already captured the funds but the local record was not written.
      // Ops must reconcile this payment by hand; a client retry will call the provider again.
      log('error', 'capture.reconcile_required', {
        ...base,
        amountCents: payment.amount_cents,
        message: 'provider captured but local payment and ledger were not recorded',
        ...errorFields(err),
      });
      throw err;
    }
    return { kind: 'captured', amountCents: payment.amount_cents, replayed: false };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

export function createCaptureHandler(deps: CaptureDeps) {
  const log = deps.log ?? jsonLog;

  return async (req: Request, res: Response): Promise<void> => {
    const requestId = requestIdFrom(req);
    const paymentId = req.params.id;
    res.setHeader('x-request-id', requestId);

    const base: LogContext = { requestId, paymentId, route: 'POST /payments/:id/capture' };
    const started = Date.now();
    log('info', 'capture.started', base);

    try {
      const outcome = await captureInTransaction(deps, log, paymentId, base);
      const durationMs = Date.now() - started;

      switch (outcome.kind) {
        case 'captured':
          log('info', 'capture.completed', { ...base, amountCents: outcome.amountCents, replayed: outcome.replayed, durationMs });
          res.status(200).json({ id: paymentId, status: 'captured', amountCents: outcome.amountCents, replayed: outcome.replayed });
          return;
        case 'not_found':
          log('warn', 'capture.rejected', { ...base, reason: 'payment_not_found', durationMs });
          res.status(404).json({ error: 'payment_not_found', requestId });
          return;
        case 'invalid_state':
          log('warn', 'capture.rejected', { ...base, reason: 'invalid_state', status: outcome.status, durationMs });
          res.status(409).json({ error: 'invalid_payment_state', status: outcome.status, requestId });
          return;
        case 'provider_failed':
          log('error', 'capture.failed', { ...base, reason: 'provider_error', durationMs });
          res.status(502).json({ error: 'provider_capture_failed', requestId });
          return;
      }
    } catch (err) {
      log('error', 'capture.failed', { ...base, reason: 'internal_error', durationMs: Date.now() - started, ...errorFields(err) });
      res.status(500).json({ error: 'internal_error', requestId });
    }
  };
}

export function captureRouter(deps: CaptureDeps): Router {
  const router = Router();
  router.post('/payments/:id/capture', createCaptureHandler(deps));
  return router;
}
