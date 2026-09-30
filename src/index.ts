/**
 * sigil's public library surface.
 *
 * sigil is primarily a CLI (`bin: sigil`, see cli.ts), but the config-merge primitives — pure
 * functions with no filesystem/process side effects — are deliberately promoted as a supported,
 * versioned library API for consumers who want to apply/reverse/inspect a config-kind JSON merge
 * programmatically (e.g. a custom install tool, a CI check) without shelling out to the CLI.
 *
 * This is the ONLY module `package.json`'s `exports` map exposes. Everything else under
 * `dist-cli/` (the pipeline stages, target adapters, wizard, commands) is internal and must not be
 * deep-imported — it was accidentally reachable before an `exports` map existed at all (2026-08-22
 * audit F25, docs/decisions/catalog-benchmark-audit-2026-08-22.md). Adding a new symbol to sigil's
 * public API means exporting it from here, not just from its own module.
 */
export {
  applyMerge,
  reverseMerge,
  detectConfigDrift,
  classifyConfigDrift,
  deepEqual,
  pruneEmpty,
  canonicalize,
  serialize,
} from './config-merge';
export type { ConfigMergeOp, MergeStrategy, DriftClass, ConfigRoot } from './config-merge';
