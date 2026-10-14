# Pilot task (identical for both arms)
In a small Node 22 + TypeScript (ESM, strict) project, write `src/orders.ts` exporting
`summarizeOrders(fetchOrders: (page: number) => Promise<{ items: Order[]; nextPage: number | null }>, opts?)`.
- Order = { id: string; customerId: string; amountCents: number; status: 'paid' | 'refunded' | 'pending' }.
- Fetch all pages; retry a failing page fetch up to 3 times with backoff; give up with a clear error.
- Return per-customer totals of paid minus refunded cents, sorted by total desc, plus the count of skipped pending orders.
- Must handle ~1M orders efficiently.
Also write `src/orders.test.ts` (node:test). Write only those two files, nothing else. Do not run anything.
