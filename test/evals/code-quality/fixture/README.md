# ledger-tools

Small TypeScript utilities for a billing service. No dependencies.

- Node 22 runs the `.ts` files directly (type stripping), so import relative files with the `.ts`
  extension (`import { x } from './x.ts'`) and use only erasable TypeScript syntax.
- Source lives in `src/`, tests in `test/`. Run the tests with `node --test`.
