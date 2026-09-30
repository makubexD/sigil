/**
 * authoring/move — atomic artifact rename with LIFO rollback.
 *
 * Sub-modules:
 *   plan     — computeDestinationPath, Referrer, MovePlan, planMove
 *   execute  — MoveResult, executeMove (I/O + rollback)
 *   summary  — MovePlanSummary, summarizePlan (dry-run preview)
 */
export { computeDestinationPath } from './plan';
export type { Referrer, MovePlan } from './plan';
export { planMove } from './plan';

export type { MoveResult } from './execute';
export { executeMove } from './execute';

export type { MovePlanSummary } from './summary';
export { summarizePlan } from './summary';
