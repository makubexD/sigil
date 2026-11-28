# ledger

Account balances for the billing service, kept in minor units (cents), and the exchange rates the
nightly job converts them with.

- `internal/ledger`: balances, entries and the CSV export.
- `internal/rates`: the rates client and its cache.

`go test ./...` runs the tests.
