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
 *   replace    — replaceMerge (reverse a previously installed fragment, then apply the new one)
 *   drift      — detectConfigDrift (detect whether sigil's keys were changed), classifyConfigDrift
 *               (missing vs modified — see drift.ts's header for why the distinction matters)
 */

export type { ConfigMergeOp, MergeStrategy, ConfigRoot } from './primitives';
export { deepEqual, pruneEmpty, canonicalize, serialize } from './primitives';
export { applyMerge } from './apply';
export { reverseMerge } from './reverse';
export { replaceMerge } from './replace';
export { detectConfigDrift, classifyConfigDrift } from './drift';
export type { DriftClass } from './drift';
