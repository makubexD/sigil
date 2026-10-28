import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { Pool } from 'pg';
import { captureRouter, type LogFn, type PaymentProvider } from '../src/capture';

const CARD_TOKEN = 'tok_visa_secret_4242';

interface PaymentRecord {
  id: string;
  amount_cents: number;
  status: string;
  card_token: string;
}

interface LedgerRecord {
  payment_id: string;
  entry_type: string;
  amount_cents: number;
}

type Undo = () => void;

// In-memory stand-in for the payments tables. It models what the handler relies on:
// SELECT ... FOR UPDATE row locks held until COMMIT/ROLLBACK, and rollback that undoes only its own writes.
class FakeDatabase {
  readonly payments = new Map<string, PaymentRecord>();
  readonly ledger: LedgerRecord[] = [];
  failStatementsMatching?: RegExp;
  private rowLocks = new Map<string, Promise<void>>();

  asPool(): Pick<Pool, 'connect'> {
    return { connect: async () => new FakeClient(this) } as unknown as Pick<Pool, 'connect'>;
  }

  lockRow(id: string): Promise<() => void> {
    const previous = this.rowLocks.get(id) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = () => resolve();
    });
    this.rowLocks.set(id, previous.then(() => current));
    return previous.then(() => release);
  }
}

class FakeClient {
  private undo: Undo[] = [];
  private heldLocks: Array<() => void> = [];

  constructor(private readonly db: FakeDatabase) {}

  async query(sql: string, params: unknown[] = []): Promise<{ rows: any[] }> {
    if (this.db.failStatementsMatching?.test(sql)) throw new Error('simulated database failure');

    if (sql === 'BEGIN') return { rows: [] };
    if (sql === 'COMMIT' || sql === 'ROLLBACK') {
      if (sql === 'ROLLBACK') this.undo.reverse().forEach((revert) => revert());
      this.undo = [];
      this.releaseLocks();
      return { rows: [] };
    }

    if (/^SELECT .+ FROM payments WHERE id = \$1 FOR UPDATE$/.test(sql)) {
      const id = String(params[0]);
      this.heldLocks.push(await this.db.lockRow(id));
      const row = this.db.payments.get(id);
      return { rows: row ? [{ id: row.id, amount_cents: row.amount_cents, status: row.status }] : [] };
    }

    if (/^UPDATE payments SET status = 'captured' WHERE id = \$1$/.test(sql)) {
      const row = this.db.payments.get(String(params[0]));
      if (row) {
        const previous = row.status;
        row.status = 'captured';
        this.undo.push(() => {
          row.status = previous;
        });
      }
      return { rows: [] };
    }

    if (/^INSERT INTO ledger_entries /.test(sql)) {
      const entry: LedgerRecord = {
        payment_id: String(params[0]),
        entry_type: String(params[1]),
        amount_cents: Number(params[2]),
      };
      this.db.ledger.push(entry);
      this.undo.push(() => {
        this.db.ledger.splice(this.db.ledger.indexOf(entry), 1);
      });
      return { rows: [] };
    }

    throw new Error(`fake database: unexpected SQL: ${sql}`);
  }

  release(): void {
    this.releaseLocks();
  }

  private releaseLocks(): void {
    this.heldLocks.splice(0).forEach((release) => release());
  }
}

type LogEntry = { level: string; event: string } & Record<string, unknown>;

function recordLogs() {
  const entries: LogEntry[] = [];
  const log: LogFn = (level, event, fields) => {
    entries.push({ level, event, ...fields });
  };
  return { entries, log };
}

function fakeProvider() {
  return {
    capture: vi.fn(async (_paymentId: string, _amountCents: number) => ({ providerRef: 'prov_1' })),
  };
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('POST /payments/:id/capture', () => {
  let db: FakeDatabase;
  let provider: ReturnType<typeof fakeProvider>;
  let logs: ReturnType<typeof recordLogs>;

  function buildApp(): express.Express {
    const app = express();
    app.use(captureRouter({ pool: db.asPool(), provider: provider as PaymentProvider, log: logs.log }));
    return app;
  }

  const capture = (app: express.Express, id = 'pay_1') => request(app).post(`/payments/${id}/capture`);

  beforeEach(() => {
    db = new FakeDatabase();
    db.payments.set('pay_1', { id: 'pay_1', amount_cents: 5000, status: 'authorized', card_token: CARD_TOKEN });
    provider = fakeProvider();
    logs = recordLogs();
  });

  it('captures an authorized payment and records a ledger entry', async () => {
    const res = await capture(buildApp());

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: 'pay_1', status: 'captured', amountCents: 5000, replayed: false });
    expect(provider.capture).toHaveBeenCalledOnce();
    expect(provider.capture).toHaveBeenCalledWith('pay_1', 5000);
    expect(db.payments.get('pay_1')?.status).toBe('captured');
    expect(db.ledger).toEqual([{ payment_id: 'pay_1', entry_type: 'capture', amount_cents: 5000 }]);
  });

  it('returns the same 200 without calling the provider again when a resent request arrives after success', async () => {
    const app = buildApp();
    await capture(app);
    const resent = await capture(app);

    expect(resent.status).toBe(200);
    expect(resent.body).toEqual({ id: 'pay_1', status: 'captured', amountCents: 5000, replayed: true });
    expect(provider.capture).toHaveBeenCalledOnce();
    expect(db.ledger).toHaveLength(1);
  });

  it('captures once when duplicate requests arrive concurrently', async () => {
    provider.capture.mockImplementation(async () => {
      await delay(30);
      return { providerRef: 'prov_1' };
    });
    const app = buildApp();

    const [first, second] = await Promise.all([capture(app), capture(app)]);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect([first.body.replayed, second.body.replayed].sort()).toEqual([false, true]);
    expect(provider.capture).toHaveBeenCalledOnce();
    expect(db.ledger).toHaveLength(1);
  });

  it('returns 404 and does not call the provider for an unknown payment', async () => {
    const res = await capture(buildApp(), 'pay_missing');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('payment_not_found');
    expect(provider.capture).not.toHaveBeenCalled();
    expect(logs.entries).toContainEqual(
      expect.objectContaining({ level: 'warn', event: 'capture.rejected', reason: 'payment_not_found', paymentId: 'pay_missing' }),
    );
  });

  it('returns 409 and does not call the provider when the payment is not authorized', async () => {
    db.payments.get('pay_1')!.status = 'declined';

    const res = await capture(buildApp());

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: 'invalid_payment_state', status: 'declined' });
    expect(provider.capture).not.toHaveBeenCalled();
    expect(db.ledger).toHaveLength(0);
  });

  it('returns 502, keeps the payment authorized and logs the failure when the provider errors', async () => {
    provider.capture.mockRejectedValueOnce(new Error('provider timeout'));

    const res = await capture(buildApp());

    expect(res.status).toBe(502);
    expect(res.body.error).toBe('provider_capture_failed');
    expect(db.payments.get('pay_1')?.status).toBe('authorized');
    expect(db.ledger).toHaveLength(0);
    expect(logs.entries).toContainEqual(
      expect.objectContaining({
        level: 'error',
        event: 'capture.provider_failed',
        paymentId: 'pay_1',
        errorMessage: 'provider timeout',
        requestId: res.headers['x-request-id'],
      }),
    );
    expect(JSON.stringify(logs.entries)).not.toContain(CARD_TOKEN);
  });

  it('captures successfully on retry after a provider failure', async () => {
    provider.capture.mockRejectedValueOnce(new Error('provider timeout'));
    const app = buildApp();

    expect((await capture(app)).status).toBe(502);
    const retry = await capture(app);

    expect(retry.status).toBe(200);
    expect(retry.body.replayed).toBe(false);
    expect(db.ledger).toHaveLength(1);
  });

  it('returns 500, rolls back and flags reconciliation when the provider captured but the local write failed', async () => {
    db.failStatementsMatching = /^INSERT INTO ledger_entries /;

    const res = await capture(buildApp());

    expect(res.status).toBe(500);
    expect(provider.capture).toHaveBeenCalledOnce();
    expect(db.payments.get('pay_1')?.status).toBe('authorized');
    expect(db.ledger).toHaveLength(0);
    expect(logs.entries).toContainEqual(
      expect.objectContaining({
        level: 'error',
        event: 'capture.reconcile_required',
        paymentId: 'pay_1',
        amountCents: 5000,
      }),
    );
  });

  it('uses the caller x-request-id and attaches it to every log line for that request', async () => {
    const res = await capture(buildApp()).set('x-request-id', 'mobile-abc-123');

    expect(res.headers['x-request-id']).toBe('mobile-abc-123');
    const requestLines = logs.entries.filter((entry) => entry.requestId === 'mobile-abc-123');
    expect(requestLines.map((entry) => entry.event)).toEqual([
      'capture.started',
      'capture.provider_succeeded',
      'capture.completed',
    ]);
    expect(requestLines.every((entry) => entry.paymentId === 'pay_1')).toBe(true);
  });

  it('replaces a malformed x-request-id with a generated one', async () => {
    const res = await capture(buildApp()).set('x-request-id', 'bad id with spaces');

    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });
});
