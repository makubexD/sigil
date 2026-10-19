/* global module */
// Exact one-sided tests for the code-quality eval (README, Statistics). Pure functions; selftest.mjs
// checks them against hand-computed values.

/** P(X >= wins) for X ~ Binomial(n, 1/2): the sign test over n decided pairs. */
function signTestP(wins, n) {
  let p = 0;
  let coef = 1;
  for (let k = 0; k <= n; k++) {
    if (k >= wins) p += coef / 2 ** n;
    coef = (coef * (n - k)) / (k + 1);
  }
  return p;
}

/**
 * Exact one-sided sign-flip (paired permutation) test over per-task differences, where a positive
 * difference favours the candidate. Under the null each task's sign is a fair coin, so p is the
 * share of the 2^K sign assignments whose sum is at least the observed sum. Unlike the sign test it
 * keeps magnitude, and unlike pairing runs by index it counts each task once.
 */
function signFlipP(diffs) {
  const k = diffs.length;
  if (k === 0) return 1;
  if (k > 20) throw new RangeError(`signFlipP enumerates 2^K assignments; K = ${k} is too many`);
  const observed = diffs.reduce((a, b) => a + b, 0);
  const eps = 1e-9 * Math.max(1, Math.abs(observed));
  let atLeast = 0;
  for (let mask = 0; mask < 2 ** k; mask++) {
    let sum = 0;
    for (let i = 0; i < k; i++) sum += mask & (1 << i) ? -diffs[i] : diffs[i];
    if (sum >= observed - eps) atLeast++;
  }
  return atLeast / 2 ** k;
}

/** Mean of `metric` per task, over the records of one arm. */
function taskMeans(records, metric) {
  const sums = new Map();
  for (const r of records) {
    const [total, n] = sums.get(r.task) ?? [0, 0];
    sums.set(r.task, [total + r[metric], n + 1]);
  }
  return new Map([...sums].map(([task, [total, n]]) => [task, total / n]));
}

module.exports = { signTestP, signFlipP, taskMeans };
