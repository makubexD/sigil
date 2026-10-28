-- Minimal shape the capture handler relies on.
-- payments.status flow: authorized -> capturing -> captured
-- (capturing is a short-lived lock state set while the provider call is in flight)

CREATE TABLE IF NOT EXISTS payments (
  id           TEXT PRIMARY KEY,
  amount_cents BIGINT      NOT NULL CHECK (amount_cents > 0),
  status       TEXT        NOT NULL,
  card_token   TEXT        NOT NULL,
  captured_at  TIMESTAMPTZ,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ledger_entries (
  id           BIGSERIAL PRIMARY KEY,
  payment_id   TEXT        NOT NULL REFERENCES payments (id),
  entry_type   TEXT        NOT NULL,
  amount_cents BIGINT      NOT NULL,
  request_id   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ledger_entries_payment_id_idx ON ledger_entries (payment_id);
