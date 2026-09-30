/**
 * Pipeline test index — no test bodies live here anymore.
 *
 * This file used to hold the full Load → Validate → Resolve → Emit suite; it has since
 * been split into one focused test file per module (see pointers below). Keeping this
 * file only as an index avoids a stale monolith re-accumulating over time.
 *
 * Run: npm test   (after npm run build)
 */

// Load, Validate, Resolve → see test/load.test.ts, test/validate.test.ts, test/resolve.test.ts

// computeClosure → see test/select/closure.test.ts

// select/closure.test.ts, select/grouping.test.ts, select/vocabulary.test.ts
// targets/claude-code.test.ts, targets/copilot.test.ts
// targets/prompt-args.test.ts, targets/output-contract.test.ts
// authoring/platforms.test.ts, authoring/check-source.test.ts, authoring/header.test.ts
// wizard/new.test.ts — see those files for E1-E5 blocks

// query.test.ts — see that file for F1-F2 blocks

// authoring/update.test.ts — see that file for G buildFieldPatch block

// manifest.test.ts — see that file for H (manifest) + L (manifest config entries) blocks

// trust-scan.test.ts — see that file for I (trust scanner) + M (config kinds) blocks

// authoring/move.test.ts — see that file for J (move planner) block

// targets/config-destinations.test.ts — see that file for N (scope-aware config destinations) block

// wizard/add.test.ts — see that file for O (config-scope wizard) + R (back-nav fix) blocks

// install-state.test.ts — see that file for P (computeInstallStates) block

// wizard/state-display.test.ts — see that file for Q (stateHintSuffix + renderStateLegend) block

// select/selection.test.ts — see that file for R (resolveSelection / language helpers) block
