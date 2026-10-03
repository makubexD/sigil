/**
 * Preloaded into every test process by `scripts/run-tests.cjs` (`--require`).
 *
 * Under `node --test` a test process reports its results to the runner over stdout. A test that runs a
 * command which prints with `console.log` writes ordinary text onto that same pipe, and Node 20 can then
 * misread a chunk and fail the whole file with "Unable to deserialize cloned data" (seen on Windows CI in
 * `update-guided.test.js`). Silencing the stdout-bound console methods here covers every test file, not
 * only the ones someone remembered to wrap. A test that captures output replaces these methods itself,
 * after this runs, so it is unaffected. Set `SIGIL_TEST_OUTPUT=1` to see the output while debugging.
 *
 * `console.error` and `console.warn` go to stderr, a separate pipe, and are left alone.
 */
if (!process.env.SIGIL_TEST_OUTPUT) {
  const quiet = () => {};
  for (const method of ['log', 'info', 'debug']) console[method] = quiet;
}
