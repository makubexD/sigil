// Pure decision logic for the baseline gate (README). No I/O and no model: selftest.mjs checks every
// function here against hand-computed cases, and run.mjs only feeds it records.
import { createRequire } from 'node:module';

const { signTestP } = createRequire(import.meta.url)('../code-quality/stats.cjs');

/** One-sided level a win must reach. With five requests only 5 of 5 gets there (1/32). */
const ALPHA = 0.05;
/** Fewer decided-or-tied requests than this is too little to call anything. */
const MIN_REQUESTS = 5;
/** Mean scores closer than this are the same result. Scores are a share of checks passed, 0 to 1. */
const TIE_MARGIN = 0.05;
/** A stage's first runs are a price check: stop when their median is over this many times the estimate. */
const PRICE_CHECK_RUNS = 10;
const PRICE_CHECK_FACTOR = 2;

const mean = values => values.reduce((a, b) => a + b, 0) / values.length;
const median = values => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/** Share of a run's scripted checks that passed. A run with no checks is a harness error. */
function score(checks) {
  if (checks.length === 0) throw new RangeError('a run needs at least one check');
  return checks.filter(check => check.pass).length / checks.length;
}

/**
 * Records a stage may use: the model that answered is the model that was asked for. A run on any
 * other model is dropped, never counted, so a silent fallback cannot leak into a verdict.
 */
function usable(records, model) {
  return records.filter(record => record.model === model && sameModel(record.reportedModel, model));
}

/** The model a run reports is the one asked for: the same id, or that id with a date suffix. */
function sameModel(reported, asked) {
  if (typeof reported !== 'string' || !asked) return false;
  return (
    reported === asked ||
    (/^-\d{8}$/.test(reported.slice(asked.length)) && reported.startsWith(asked))
  );
}

/** One vote per request: the arm with the higher mean score, or a tie inside the margin. */
function voteRequest(records, request) {
  const scores = arm =>
    records.filter(r => r.request === request && r.arm === arm).map(r => r.score);
  const withArm = scores('with');
  const none = scores('none');
  if (withArm.length === 0 || none.length === 0) return 'missing';
  const diff = mean(withArm) - mean(none);
  if (Math.abs(diff) <= TIE_MARGIN) return 'tie';
  return diff > 0 ? 'win' : 'loss';
}

/**
 * The artifact against no artifact, over its requests.
 * `quiet` is the request it must not act on: true when it stayed quiet in every run.
 */
function verdict(votes, quiet) {
  const counted = votes.filter(vote => vote !== 'missing');
  if (counted.length < MIN_REQUESTS) return 'inconclusive';
  const wins = counted.filter(vote => vote === 'win').length;
  const losses = counted.filter(vote => vote === 'loss').length;
  const decided = wins + losses;
  if (decided > 0 && signTestP(losses, decided) <= ALPHA) return 'worse';
  if (decided > 0 && signTestP(wins, decided) <= ALPHA && quiet) return 'beats';
  return 'ties';
}

/**
 * What the ledger records for a verdict (the plan's outcome table).
 * `holdsFact`: the artifact carries a tool- or repo-specific fact the model cannot know.
 * `fieldUses`: uses seen in real projects. `priorTie`: it already tied once and was reworded.
 */
function action(result, { holdsFact = false, fieldUses = 0, priorTie = false } = {}) {
  if (result === 'inconclusive') return 'nothing moves';
  if (result === 'beats') return 'keep';
  if (result === 'worse') return 'opt-in, reword and re-test';
  if (holdsFact) return 'keep, cut to that fact';
  if (fieldUses > 0) return 'opt-in, re-test';
  return priorTie ? 'delete (owner confirms)' : 'opt-in; delete on a second tie';
}

/** A screen result is final only when it is not a win: a win is confirmed on the next model up. */
function nextStage(result, stage) {
  if (result !== 'beats') return undefined;
  return { screen: 'confirm', confirm: 'final' }[stage];
}

/** Spend so far against the cap set before the stage started. */
class Budget {
  constructor(capUsd, expectedPerRunUsd) {
    if (!(capUsd > 0) || !(expectedPerRunUsd > 0)) {
      throw new RangeError('a stage needs a cap and an expected cost per run, both above zero');
    }
    this.capUsd = capUsd;
    this.expectedPerRunUsd = expectedPerRunUsd;
    this.costs = [];
  }

  add(costUsd) {
    this.costs.push(costUsd);
  }

  get spentUsd() {
    return this.costs.reduce((a, b) => a + b, 0);
  }

  /** Why the stage must stop now, or undefined to go on. Checked before every run. */
  stopReason() {
    if (this.spentUsd >= this.capUsd) {
      return `cap reached: ${this.spentUsd.toFixed(2)} of ${this.capUsd.toFixed(2)} dollars`;
    }
    if (this.costs.length === PRICE_CHECK_RUNS) {
      const seen = median(this.costs);
      if (seen > PRICE_CHECK_FACTOR * this.expectedPerRunUsd) {
        return (
          `price check failed: median ${seen.toFixed(3)} dollars a run is over ` +
          `${PRICE_CHECK_FACTOR} times the expected ${this.expectedPerRunUsd.toFixed(3)}`
        );
      }
    }
    return undefined;
  }
}

export {
  ALPHA,
  MIN_REQUESTS,
  TIE_MARGIN,
  PRICE_CHECK_RUNS,
  score,
  usable,
  sameModel,
  voteRequest,
  verdict,
  action,
  nextStage,
  Budget,
};
