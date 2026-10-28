import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createCaptureRouter, type Logger, type PaymentProvider } from "../src/capture.js";

type Status = "authorized" | "capturing" | "captured" | "refunded";

interface PaymentRow {
  id: string;
  amount_cents: number;
  status: Status;
  card_token: string;
}

interface Ledger {
  payment_id: string;
  entry_type: string;
  amount_cents: number;
  request_id: string | null;
}

// In-memory stand-in for pg. Transactions take a mutex from BEGIN to COMMIT/ROLLBACK,
// which mirrors how SELECT ... FOR UPDATE serializes concurrent captures in Postgres.
function fakeDb(payments: PaymentRow[], opts: { failFinalize?: boolean } = {}) {
  const rows = new Map(payments.map((p) => [p.id, { ...p }]));
  const ledger: Ledger[] = [];
  let lockTail: Promise<void> = Promise.resolve();
  let releaseLock: (() => void) | null = null;

  const acquire = async () => {
    const prev = lockTail;
    let release!: () => void;
    lockTail = new Promise<void>((r) => (release = r));
    await prev;
    releaseLock = release;
  };
  const unlock = () => {
    const r = releaseLock;
    releaseLock = null;
    r?.();
  };

  async function run(sql: string, params: unknown[] = []) {
    const text = sql.replace(/\s+/g, " ").trim();
    const id = params[0] as string;

    if (text.startsWith("SELECT amount_cents, status FROM payments")) {
      const p = rows.get(id);
      return { rows: p ? [{ amount_cents: String(p.amount_cents), status: p.status }] : [], rowCount: p ? 1 : 0 };
    }
    if (text.startsWith("UPDATE payments SET status = 'capturing'")) {
      rows.get(id)!.status = "capturing";
      return { rows: [], rowCount: 1 };
    }
    if (text.startsWith("UPDATE payments SET status = 'authorized'")) {
      const p = rows.get(id);
      if (p?.status === "capturing") p.status = "authorized";
      return { rows: [], rowCount: p?.status === "authorized" ? 1 : 0 };
    }
    if (text.startsWith("UPDATE payments SET status = 'captured'")) {
      const p = rows.get(id);
      if (p?.status !== "capturing") return { rows: [], rowCount: 0 };
      p.status = "captured";
      return { rows: [], rowCount: 1 };
    }
    if (text.startsWith("INSERT INTO ledger_entries")) {
      if (opts.failFinalize) throw new Error("connection reset during ledger insert");
      const [payment_id, amount_cents, request_id] = params as [string, number, string];
      ledger.push({ payment_id, entry_type: "capture", amount_cents, request_id });
      return { rows: [], rowCount: 1 };
    }
    throw new Error(`unexpected SQL in fake: ${text}`);
  }

  let snapshot: { rows: [string, PaymentRow][]; ledgerLength: number } | null = null;

  const makeClient = () => ({
    query: async (sql: string, params?: unknown[]) => {
      const text = sql.trim();
      if (text === "BEGIN") {
        await acquire();
        snapshot = { rows: [...rows].map(([k, v]) => [k, { ...v }]), ledgerLength: ledger.length };
        return { rows: [], rowCount: 0 };
      }
      if (text === "COMMIT" || text === "ROLLBACK") {
        if (text === "ROLLBACK" && snapshot) {
          rows.clear();
          for (const [k, v] of snapshot.rows) rows.set(k, v);
          ledger.length = snapshot.ledgerLength;
        }
        snapshot = null;
        unlock();
        return { rows: [], rowCount: 0 };
      }
      return run(sql, params);
    },
    release: () => {},
  });

  const pool = {
    connect: async () => makeClient(),
    query: async (sql: string, params?: unknown[]) => run(sql, params),
  };

  return {
    pool: pool as unknown as import("pg").Pool,
    rows,
    ledger,
  };
}

function buildApp(opts: {
  payments: PaymentRow[];
  capture?: PaymentProvider["capture"];
  failFinalize?: boolean;
}) {
  const db = fakeDb(opts.payments, { failFinalize: opts.failFinalize });
  const logs: { level: "info" | "error"; fields: Record<string, unknown>; msg: string }[] = [];
  const logger: Logger = {
    info: (fields, msg) => logs.push({ level: "info", fields, msg }),
    error: (fields, msg) => logs.push({ level: "error", fields, msg }),
  };
  const calls: [string, number][] = [];
  const provider: PaymentProvider = {
    capture: async (paymentId, amountCents) => {
      calls.push([paymentId, amountCents]);
      return opts.capture ? opts.capture(paymentId, amountCents) : { ok: true };
    },
  };

  const app = express();
  app.use(express.json());
  app.use(createCaptureRouter({ pool: db.pool, provider, logger }));
  return { app, db, logs, calls };
}

const authorized: PaymentRow = { id: "pay_1", amount_cents: 1500, status: "authorized", card_token: "tok_SECRET_123" };

describe("POST /payments/:id/capture", () => {
  it("captures an authorized payment, marks it captured and writes a ledger entry", async () => {
    const { app, db, calls } = buildApp({ payments: [{ ...authorized }] });

    const res = await request(app).post("/payments/pay_1/capture").set("x-request-id", "req-abc");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: "pay_1", status: "captured", amountCents: 1500, requestId: "req-abc" });
    expect(calls).toEqual([["pay_1", 1500]]);
    expect(db.rows.get("pay_1")!.status).toBe("captured");
    expect(db.ledger).toEqual([{ payment_id: "pay_1", entry_type: "capture", amount_cents: 1500, request_id: "req-abc" }]);
  });

  it("treats a resent request for an already captured payment as success without calling the provider again", async () => {
    const { app, db, calls } = buildApp({ payments: [{ ...authorized }] });

    await request(app).post("/payments/pay_1/capture");
    const retry = await request(app).post("/payments/pay_1/capture");

    expect(retry.status).toBe(200);
    expect(retry.body.status).toBe("captured");
    expect(calls).toHaveLength(1);
    expect(db.ledger).toHaveLength(1);
  });

  it("only charges the provider once when two identical requests race", async () => {
    const { app, db, calls } = buildApp({ payments: [{ ...authorized }] });

    const [a, b] = await Promise.all([
      request(app).post("/payments/pay_1/capture"),
      request(app).post("/payments/pay_1/capture"),
    ]);

    expect(calls).toHaveLength(1);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(db.ledger).toHaveLength(1);
  });

  it("returns 404 for an unknown payment and does not call the provider", async () => {
    const { app, calls } = buildApp({ payments: [] });

    const res = await request(app).post("/payments/missing/capture");

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("payment_not_found");
    expect(calls).toHaveLength(0);
  });

  it("returns 409 for a payment that is not in the authorized state", async () => {
    const { app, calls } = buildApp({ payments: [{ ...authorized, status: "refunded" }] });

    const res = await request(app).post("/payments/pay_1/capture");

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: "invalid_payment_state", status: "refunded" });
    expect(calls).toHaveLength(0);
  });

  it("returns 502 when the provider fails, releases the claim, and lets a retry succeed", async () => {
    let attempt = 0;
    const { app, db, logs } = buildApp({
      payments: [{ ...authorized }],
      capture: async () => {
        attempt += 1;
        if (attempt === 1) throw new Error("provider timeout");
      },
    });

    const failed = await request(app).post("/payments/pay_1/capture").set("x-request-id", "req-fail");
    expect(failed.status).toBe(502);
    expect(failed.body).toEqual({ error: "provider_capture_failed", requestId: "req-fail" });
    expect(db.rows.get("pay_1")!.status).toBe("authorized");
    expect(db.ledger).toHaveLength(0);

    const retried = await request(app).post("/payments/pay_1/capture").set("x-request-id", "req-retry");
    expect(retried.status).toBe(200);
    expect(db.rows.get("pay_1")!.status).toBe("captured");

    const failLog = logs.find((l) => l.fields.stage === "provider_capture_failed");
    expect(failLog).toMatchObject({ level: "error", fields: { requestId: "req-fail", paymentId: "pay_1", error: "provider timeout" } });
  });

  it("reports a 500 and leaves the payment in capturing when the provider succeeded but the local write failed", async () => {
    const { app, db, calls, logs } = buildApp({ payments: [{ ...authorized }], failFinalize: true });

    const res = await request(app).post("/payments/pay_1/capture").set("x-request-id", "req-fin");

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "capture_finalize_failed", requestId: "req-fin" });
    expect(calls).toHaveLength(1);
    expect(db.rows.get("pay_1")!.status).toBe("capturing");
    expect(logs.find((l) => l.fields.stage === "finalize_failed")).toMatchObject({
      level: "error",
      msg: expect.stringContaining("needs reconciliation"),
      fields: { requestId: "req-fin", paymentId: "pay_1" },
    });
  });

  it("returns 409 while another capture for the same payment is in flight", async () => {
    const { app, db, calls } = buildApp({ payments: [{ ...authorized, status: "capturing" }] });

    const res = await request(app).post("/payments/pay_1/capture");

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("capture_in_progress");
    expect(calls).toHaveLength(0);
    expect(db.rows.get("pay_1")!.status).toBe("capturing");
  });

  it("propagates an incoming x-request-id to the response and every log line, and generates one when absent", async () => {
    const { app, logs } = buildApp({ payments: [{ ...authorized }] });

    const withHeader = await request(app).post("/payments/pay_1/capture").set("x-request-id", "trace-42");
    expect(withHeader.headers["x-request-id"]).toBe("trace-42");
    expect(logs.length).toBeGreaterThan(0);
    for (const l of logs) expect(l.fields.requestId).toBe("trace-42");

    logs.length = 0;
    const generated = await request(app).post("/payments/pay_1/capture");
    const id = generated.headers["x-request-id"];
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(generated.body.requestId).toBe(id);
  });

  it("never returns or logs the card token", async () => {
    const { app, logs } = buildApp({
      payments: [{ ...authorized }],
      capture: async () => {
        throw new Error("declined");
      },
    });

    const res = await request(app).post("/payments/pay_1/capture");

    expect(JSON.stringify(res.body)).not.toContain("tok_SECRET_123");
    expect(JSON.stringify(logs)).not.toContain("tok_SECRET_123");
  });
});
