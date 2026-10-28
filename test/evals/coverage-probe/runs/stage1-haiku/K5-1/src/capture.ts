import { randomUUID } from 'crypto';
import express, { Router, RequestHandler } from 'express';
import type { Pool, PoolClient } from 'pg';

// Provider must treat capture(paymentId) as idempotent: if our DB commit fails
// after a successful provider call, the client retry calls it again.
export interface PaymentProvider {
  capture(paymentId: string, amountCents: number): Promise<unknown>;
}

export interface Logger {
  info(fields: Record<string, unknown>, msg: string): void;
  error(fields: Record<string, unknown>, msg: string): void;
}

export interface CaptureDeps {
  pool: Pool;
  provider: PaymentProvider;
  logger?: Logger;
}

// Only the columns we need. The card token is deliberately not selected or logged.
interface PaymentRow {
  id: string;
  amount_cents: number;
  status: string;
}

const CAPTURED = 'captured';
const AUTHORIZED = 'authorized';

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function createCaptureHandler(deps: CaptureDeps): RequestHandler {
  const log: Logger = deps.logger ?? console;

  return async (req, res) => {
    // Accept the caller's request id so logs can be followed across services.
    const requestId = req.header('x-request-id') || randomUUID();
    const paymentId = req.params.id;
    res.setHeader('X-Request-Id', requestId);

    const ctx = { requestId, paymentId, operation: 'payment.capture' };
    let client: PoolClient | undefined;
    // Set once the provider has moved money. If we fail after this point the
    // DB is out of sync with the provider and ops need to know.
    let providerCaptured = false;

    try {
      client = await deps.pool.connect();
      await client.query('BEGIN');

      // Row lock serialises concurrent and retried requests for the same payment.
      const { rows } = await client.query<PaymentRow>(
        'SELECT id, amount_cents, status FROM payments WHERE id = $1 FOR UPDATE',
        [paymentId],
      );
      const payment = rows[0];

      if (!payment) {
        await client.query('ROLLBACK');
        log.info({ ...ctx, outcome: 'not_found' }, 'capture rejected: payment not found');
        res.status(404).json({ error: 'payment_not_found', requestId });
        return;
      }

      // Retry of a capture that already succeeded: report success, do nothing.
      if (payment.status === CAPTURED) {
        await client.query('COMMIT');
        log.info({ ...ctx, outcome: 'already_captured' }, 'capture replayed: already captured');
        res.json({ id: payment.id, status: CAPTURED, amountCents: payment.amount_cents, requestId });
        return;
      }

      if (payment.status !== AUTHORIZED) {
        await client.query('ROLLBACK');
        log.info(
          { ...ctx, outcome: 'invalid_status', status: payment.status },
          'capture rejected: payment not in authorized state',
        );
        res.status(409).json({ error: 'invalid_payment_status', status: payment.status, requestId });
        return;
      }

      try {
        await deps.provider.capture(paymentId, payment.amount_cents);
        providerCaptured = true;
      } catch (err) {
        await client.query('ROLLBACK');
        log.error(
          { ...ctx, outcome: 'provider_failed', error: errorMessage(err) },
          'capture failed at payment provider',
        );
        res.status(502).json({ error: 'provider_capture_failed', requestId });
        return;
      }

      await client.query('UPDATE payments SET status = $2 WHERE id = $1', [paymentId, CAPTURED]);
      await client.query(
        'INSERT INTO ledger_entries (payment_id, entry_type, amount_cents) VALUES ($1, $2, $3)',
        [paymentId, 'capture', payment.amount_cents],
      );
      await client.query('COMMIT');

      log.info({ ...ctx, outcome: 'captured', amountCents: payment.amount_cents }, 'payment captured');
      res.json({ id: payment.id, status: CAPTURED, amountCents: payment.amount_cents, requestId });
    } catch (err) {
      if (client) {
        await client.query('ROLLBACK').catch(() => undefined);
      }
      log.error(
        {
          ...ctx,
          outcome: providerCaptured ? 'provider_captured_db_not_updated' : 'db_error',
          error: errorMessage(err),
        },
        providerCaptured
          ? 'payment captured at provider but local state not recorded; manual reconciliation needed'
          : 'capture failed with database error',
      );
      res.status(500).json({ error: 'capture_failed', requestId });
    } finally {
      client?.release();
    }
  };
}

export function createCaptureRouter(deps: CaptureDeps): Router {
  const router = express.Router();
  router.post('/payments/:id/capture', createCaptureHandler(deps));
  return router;
}
