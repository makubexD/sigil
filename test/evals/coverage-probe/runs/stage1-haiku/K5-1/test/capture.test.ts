import { describe, it, expect, vi, afterEach } from 'vitest';
import express from 'express';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import type { Pool } from 'pg';
import { createCaptureRouter, CaptureDeps, PaymentProvider } from '../src/capture';

type PaymentRow = { id: string; amount_cents: number; status: string };

// Fake pg pool. Routes by SQL prefix and records every statement in order.
function makeDb(payment: PaymentRow | undefined, opts: { failOn?: string } = {}) {
  const queries: { sql: string; params?: unknown[] }[] = [];
  const client = {
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      queries.push({ sql, params });
      if (opts.failOn && sql.includes(opts.failOn)) {
        throw new Error(`db failure on ${opts.failOn}`);
      }
      if (sql.startsWith('SELECT')) {
        return { rows: payment ? [payment] : [] };
      }
      return { rows: [] };
    }),
    release: vi.fn(),
  };
  const pool = { connect: vi.fn(async () => client) } as unknown as Pool;
  return { pool, client, queries };
}

function makeProvider(impl?: () => Promise<unknown>): PaymentProvider & { capture: ReturnType<typeof vi.fn> } {
  return { capture: vi.fn(impl ?? (async () => ({ ok: true }))) };
}

function makeLogger() {
  return { info: vi.fn(), error: vi.fn() };
}

let server: Server | undefined;

async function start(deps: CaptureDeps): Promise<string> {
  const app = express();
  app.use(createCaptureRouter(deps));
  server = app.listen(0);
  await new Promise<void>((resolve) => server!.once('listening', () => resolve()));
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

function post(base: string, id: string, headers: Record<string, string> = {}) {
  return fetch(`${base}/payments/${id}/capture`, { method: 'POST', headers });
}

afterEach(async () => {
  if (server) {
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;
  }
});

describe('POST /payments/:id/capture', () => {
  it('captures an authorized payment, records a ledger entry and commits', async () => {
    const db = makeDb({ id: 'pay_1', amount_cents: 2500, status: 'authorized' });
    const provider = makeProvider();
    const logger = makeLogger();
    const base = await start({ pool: db.pool, provider, logger });

    const res = await post(base, 'pay_1');
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ id: 'pay_1', status: 'captured', amountCents: 2500 });
    expect(provider.capture).toHaveBeenCalledWith('pay_1', 2500);

    const sqls = db.queries.map((q) => q.sql);
    expect(sqls[0]).toBe('BEGIN');
    expect(sqls[1]).toContain('FOR UPDATE');
    expect(sqls).toContainEqual(expect.stringContaining('UPDATE payments SET status'));
    expect(sqls).toContainEqual(expect.stringContaining('INSERT INTO ledger_entries'));
    expect(sqls[sqls.length - 1]).toBe('COMMIT');
    expect(db.client.release).toHaveBeenCalledOnce();
  });

  it('does not select the card token', async () => {
    const db = makeDb({ id: 'pay_1', amount_cents: 100, status: 'authorized' });
    const base = await start({ pool: db.pool, provider: makeProvider(), logger: makeLogger() });

    await post(base, 'pay_1');

    const select = db.queries.find((q) => q.sql.startsWith('SELECT'));
    expect(select?.sql).not.toContain('card_token');
  });

  it('replays a retry of an already-captured payment without calling the provider again', async () => {
    const db = makeDb({ id: 'pay_1', amount_cents: 2500, status: 'captured' });
    const provider = makeProvider();
    const logger = makeLogger();
    const base = await start({ pool: db.pool, provider, logger });

    const res = await post(base, 'pay_1');

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: 'pay_1', status: 'captured', amountCents: 2500 });
    expect(provider.capture).not.toHaveBeenCalled();
    expect(db.queries.map((q) => q.sql)).not.toContainEqual(expect.stringContaining('INSERT INTO ledger_entries'));
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'already_captured', paymentId: 'pay_1' }),
      expect.any(String),
    );
  });

  it('returns 404 when the payment does not exist', async () => {
    const db = makeDb(undefined);
    const provider = makeProvider();
    const base = await start({ pool: db.pool, provider, logger: makeLogger() });

    const res = await post(base, 'missing');

    expect(res.status).toBe(404);
    expect(provider.capture).not.toHaveBeenCalled();
    expect(db.queries.map((q) => q.sql)).toContain('ROLLBACK');
  });

  it('returns 409 when the payment is not in the authorized state', async () => {
    const db = makeDb({ id: 'pay_1', amount_cents: 100, status: 'declined' });
    const provider = makeProvider();
    const base = await start({ pool: db.pool, provider, logger: makeLogger() });

    const res = await post(base, 'pay_1');

    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: 'invalid_payment_status', status: 'declined' });
    expect(provider.capture).not.toHaveBeenCalled();
  });

  it('returns 502 and rolls back when the provider rejects the capture', async () => {
    const db = makeDb({ id: 'pay_1', amount_cents: 100, status: 'authorized' });
    const provider = makeProvider(async () => {
      throw new Error('provider timeout');
    });
    const logger = makeLogger();
    const base = await start({ pool: db.pool, provider, logger });

    const res = await post(base, 'pay_1', { 'X-Request-Id': 'req-abc' });

    expect(res.status).toBe(502);
    const sqls = db.queries.map((q) => q.sql);
    expect(sqls).toContain('ROLLBACK');
    expect(sqls).not.toContainEqual(expect.stringContaining('UPDATE payments'));
    expect(sqls).not.toContainEqual(expect.stringContaining('INSERT INTO ledger_entries'));
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'req-abc',
        paymentId: 'pay_1',
        outcome: 'provider_failed',
        error: 'provider timeout',
      }),
      expect.any(String),
    );
    expect(db.client.release).toHaveBeenCalledOnce();
  });

  it('returns 500 without calling the provider when the lookup fails', async () => {
    const db = makeDb({ id: 'pay_1', amount_cents: 100, status: 'authorized' }, { failOn: 'FOR UPDATE' });
    const provider = makeProvider();
    const logger = makeLogger();
    const base = await start({ pool: db.pool, provider, logger });

    const res = await post(base, 'pay_1');

    expect(res.status).toBe(500);
    expect(provider.capture).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'db_error' }),
      expect.any(String),
    );
    expect(db.client.release).toHaveBeenCalledOnce();
  });

  it('flags a provider-captured payment whose local write fails', async () => {
    const db = makeDb(
      { id: 'pay_1', amount_cents: 100, status: 'authorized' },
      { failOn: 'INSERT INTO ledger_entries' },
    );
    const provider = makeProvider();
    const logger = makeLogger();
    const base = await start({ pool: db.pool, provider, logger });

    const res = await post(base, 'pay_1', { 'X-Request-Id': 'req-xyz' });

    expect(res.status).toBe(500);
    expect(provider.capture).toHaveBeenCalledWith('pay_1', 100);
    expect(db.queries.map((q) => q.sql)).toContain('ROLLBACK');
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'req-xyz',
        paymentId: 'pay_1',
        outcome: 'provider_captured_db_not_updated',
      }),
      expect.stringContaining('manual reconciliation'),
    );
  });

  it('echoes the caller request id, or generates one when absent', async () => {
    const db = makeDb({ id: 'pay_1', amount_cents: 100, status: 'authorized' });
    const base = await start({ pool: db.pool, provider: makeProvider(), logger: makeLogger() });

    const withHeader = await post(base, 'pay_1', { 'X-Request-Id': 'req-123' });
    expect(withHeader.headers.get('x-request-id')).toBe('req-123');
    expect((await withHeader.json()).requestId).toBe('req-123');

    const generated = await post(base, 'pay_1');
    expect(generated.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/);
  });
});
