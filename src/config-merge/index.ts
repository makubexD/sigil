/**
 * config-merge — pure JSON merge / reverse / drift module for config-kind artifacts.
 *
 * Config kinds (hook, settings, mcp) merge into user-owned JSON files rather than
 * owning whole files. This module re-exports all public operations in one place so
 * importers can continue to write `from './config-merge'` without change.
 *
 * Sub-modules:
 *   primitives — deepEqual, pruneEmpty, canonicalize, serialize, deepMerge
 *   apply      — applyMerge (merge fragment into existing object)
 *   reverse    — reverseMerge (undo sigil's contribution)
 *   drift      — detectConfigDrift (detect whether sigil's keys were changed)
 */

export type { ConfigMergeOp, MergeStrategy } from './primitives';
export { deepEqual, pruneEmpty, canonicalize, serialize } from './primitives';
export { applyMerge } from './apply';
export { reverseMerge } from './reverse';
export { detectConfigDrift } from './drift';
