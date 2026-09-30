/**
 * @clack/prompts mock for wizard tests.
 *
 * runWizard uses @clack/prompts which requires a real TTY. Since tests run in a
 * non-TTY environment we mock @clack/prompts by mutating the already-loaded module
 * object in require.cache. The compiled wizard.js accesses prompts via
 * `prompts_1.<fn>(...)`, so mutating the cached exports object's properties is
 * sufficient — no module reload needed.
 *
 * Strategy:
 *   1. Save originals from require.cache at call time (module is already loaded)
 *   2. Replace each prompt function with a queue-driven stub
 *   3. Call runWizard(...) — it drives through the queue
 *   4. Call the returned restore() in finally{} to put the originals back
 *
 * Usage:
 *   const restore = mockClack(['claude', 'browse', '__all__', ...]);
 *   try {
 *     const result = await runWizard(...);
 *     assert.ok(result);
 *   } finally {
 *     restore();
 *   }
 */

/**
 * Set up @clack/prompts mocks that draw answers from a sequential queue.
 * - `select` and `groupMultiselect` return the next value off the queue.
 * - `multiselect` returns the next value as an array (or the value itself if
 *   already an array).
 * - `text` and `confirm` return the next value off the queue.
 * - `isCancel` always returns false (no simulated cancellation).
 * - All others (intro, outro, note, log, cancel) are silent no-ops.
 *
 * Returns a `restore()` function that puts the originals back — always call it
 * in a `finally` block.
 *
 * @throws {Error} if the queue is exhausted before all prompts are answered.
 */
export function mockClack(queue: Array<string | string[]>): () => void {
  const clackKey = require.resolve('@clack/prompts');
  const clackMod = require.cache[clackKey] as { exports: Record<string, unknown> };
  const ex = clackMod.exports;
  const orig = { ...ex };

  const pop = () => {
    if (queue.length === 0) throw new Error('clack mock: answer queue exhausted');
    return queue.shift()!;
  };

  ex['intro'] = () => {};
  ex['outro'] = () => {};
  ex['note'] = () => {};
  ex['cancel'] = () => {};
  ex['log'] = { info: () => {}, warn: () => {}, error: () => {} };
  ex['isCancel'] = () => false;
  ex['select'] = async (_opts: unknown) => pop();
  ex['multiselect'] = async (_opts: unknown) => {
    const v = pop();
    return Array.isArray(v) ? v : [v];
  };
  ex['groupMultiselect'] = async (_opts: unknown) => {
    const v = pop();
    return Array.isArray(v) ? v : [v];
  };
  ex['text'] = async (_opts: unknown) => pop();
  ex['confirm'] = async (_opts: unknown) => pop();

  return () => {
    for (const k of Object.keys(orig)) ex[k] = orig[k];
  };
}
