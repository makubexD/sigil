import { randomUUID } from "node:crypto";
import { Router } from "express";
import type { Pool, PoolClient } from "pg";

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

// Columns deliberately exclude card_token: it must never reach logs or responses.
type ClaimResult =
  | { kind: "not_found" }
  | { kind: "already_captured"; amountCents: number }
  | { kind: "in_progress" }
  | { kind: "invalid_state"; status: string }
  | { kind: "claimed"; amountCents: number };

const jsonLogger: Logger = {
  info: (fields, msg) => console.log(JSON.stringify({ level: "info", msg, time: new Date().toISOString(), ...fields })),
  error: (fields, msg) => console.error(JSON.stringify({ level: "error", msg, time: new Date().toISOString(), ...fields })),
};

// Moves an authorized payment to "capturing" under a row lock. The lock is released
// before the provider call so that a slow provider does not hold a DB transaction open.
async function claimPayment(pool: Pool, paymentId: string): Promise<ClaimResult> {
  const client: PoolClient = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<{ amount_cents: string; status: string }>(
      "SELECT amount_cents, status FROM payments WHERE id = $1 FOR UPDATE",
      [paymentId],
    );
    const row = rows[0];
    if (!row) {
      await client.query("ROLLBACK");
      return { kind: "not_found" };
    }
    const amountCents = Number(row.amount_cents);

    if (row.status === "captured") {
      await client.query("COMMIT");
      return { kind: "already_captured", amountCents };
    }
    if (row.status === "capturing") {
      await client.query("COMMIT");
      return { kind: "in_progress" };
    }
    if (row.status !== "authorized") {
      await client.query("COMMIT");
      return { kind: "invalid_state", status: row.status };
    }

    await client.query(
      "UPDATE payments SET status = 'capturing', updated_at = now() WHERE id = $1",
      [paymentId],
    );
    await client.query("COMMIT");
    return { kind: "claimed", amountCents };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

// Provider failed: put the payment back so the client's retry can claim it again.
async function releaseClaim(pool: Pool, paymentId: string): Promise<void> {
  await pool.query(
    "UPDATE payments SET status = 'authorized', updated_at = now() WHERE id = $1 AND status = 'capturing'",
    [paymentId],
  );
}

// Provider succeeded: mark captured and write the ledger entry in one transaction.
async function finalizeCapture(
  pool: Pool,
  paymentId: string,
  amountCents: number,
  requestId: string,
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const updated = await client.query(
      "UPDATE payments SET status = 'captured', captured_at = now(), updated_at = now() WHERE id = $1 AND status = 'capturing'",
      [paymentId],
    );
    if (updated.rowCount !== 1) {
      throw new Error(`payment ${paymentId} was not in capturing state at finalize`);
    }
    await client.query(
      "INSERT INTO ledger_entries (payment_id, entry_type, amount_cents, request_id) VALUES ($1, 'capture', $2, $3)",
      [paymentId, amountCents, requestId],
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

export function createCaptureRouter({ pool, provider, logger = jsonLogger }: CaptureDeps): Router {
  const router = Router();

  router.post("/payments/:id/capture", async (req, res) => {
    const requestId = req.header("x-request-id") || randomUUID();
    const paymentId = req.params.id;
    res.setHeader("x-request-id", requestId);
    const base = { requestId, paymentId };

    try {
      const claim = await claimPayment(pool, paymentId);

      switch (claim.kind) {
        case "not_found":
          logger.info({ ...base, outcome: "not_found" }, "capture rejected");
          res.status(404).json({ error: "payment_not_found", requestId });
          return;
        case "already_captured":
          // Mobile clients resend on dropped connections; a repeat is a success, not an error.
          logger.info({ ...base, outcome: "already_captured" }, "capture replayed");
          res.json({ id: paymentId, status: "captured", amountCents: claim.amountCents, requestId });
          return;
        case "in_progress":
          logger.info({ ...base, outcome: "in_progress" }, "capture rejected");
          res.status(409).json({ error: "capture_in_progress", requestId });
          return;
        case "invalid_state":
          logger.info({ ...base, outcome: "invalid_state", status: claim.status }, "capture rejected");
          res.status(409).json({ error: "invalid_payment_state", status: claim.status, requestId });
          return;
      }

      logger.info({ ...base, stage: "provider_capture_start", amountCents: claim.amountCents }, "calling provider");
      try {
        await provider.capture(paymentId, claim.amountCents);
      } catch (err) {
        logger.error({ ...base, stage: "provider_capture_failed", error: errorMessage(err) }, "provider capture failed");
        await releaseClaim(pool, paymentId).catch((releaseErr) =>
          logger.error({ ...base, stage: "release_failed", error: errorMessage(releaseErr) }, "could not release claim"),
        );
        res.status(502).json({ error: "provider_capture_failed", requestId });
        return;
      }

      try {
        await finalizeCapture(pool, paymentId, claim.amountCents, requestId);
      } catch (err) {
        // The provider has already captured the funds. Retrying would be wrong without reconciliation.
        logger.error(
          { ...base, stage: "finalize_failed", error: errorMessage(err) },
          "provider captured but local finalize failed; needs reconciliation",
        );
        res.status(500).json({ error: "capture_finalize_failed", requestId });
        return;
      }

      logger.info({ ...base, stage: "captured", amountCents: claim.amountCents }, "capture completed");
      res.json({ id: paymentId, status: "captured", amountCents: claim.amountCents, requestId });
    } catch (err) {
      logger.error({ ...base, stage: "unexpected", error: errorMessage(err) }, "capture failed");
      res.status(500).json({ error: "internal_error", requestId });
    }
  });

  return router;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
