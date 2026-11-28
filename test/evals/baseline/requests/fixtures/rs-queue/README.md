# jobqueue

The in-memory job queue the worker pulls from, and the retry timing it uses when a job fails.

- `src/queue.rs`: the bounded queue, shared between the intake thread and the workers.
- `src/retry.rs`: backoff and the `Retry-After` header of the upstream API.

`cargo test` runs the tests.
