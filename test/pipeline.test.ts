/**
 * End-to-end pipeline tests.
 * Tests the full Load → Validate → Resolve → Emit cycle for both targets.
 *
 * Run: npm test   (after npm run build)
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import { loadCatalog } from '../dist-cli/load';
import { validateCatalog } from '../dist-cli/validate';
import { resolveCatalog } from '../dist-cli/resolve';
import {
  computeClosure,
  groupArtifactsByLanguage,
  partitionConfigKinds,
  availableKinds,
  buildLanguageOptions,
  kindNoun,
  kindPlural,
  kindHint,
  CONFIG_KINDS,
  resolveSelection,
  artifactLanguage,
  isAgnostic,
} from '../dist-cli/select';
import { ClaudeCodeTarget } from '../dist-cli/targets/claude-code';
import { CopilotTarget } from '../dist-cli/targets/copilot';
import {
  toClaudePlaceholders,
  toCopilotPlaceholders,
  buildArgumentHint,
} from '../dist-cli/targets/prompt-args';
import { checkOutputContract } from '../dist-cli/targets/output-contract';
import type { PromptArg } from '../dist-cli/targets/prompt-args';
import { artifactTargetsPlatform } from '../dist-cli/select';
import {
  effectivePlatforms,
  isFullCoverage,
  normalizePlatforms,
  addPlatforms,
  removePlatforms,
} from '../dist-cli/authoring/platforms';
import { checkSourceArtifact } from '../dist-cli/authoring/check-source';
import { headerFor } from '../dist-cli/authoring/header';
import { buildEquivalentNewCommand, stateHintSuffix, renderStateLegend } from '../dist-cli/wizard';
import type { ArtifactInstallState } from '../dist-cli/install-state';
import { getAllTargets } from '../dist-cli/targets';
import { bumpVersion, promoteChangelog } from '../dist-cli/release';
import os from 'os';
import fs from 'fs';
import { searchArtifacts, getArtifactDetail, formatDetailText } from '../dist-cli/query';
import { buildFieldPatch, getEditableFields } from '../dist-cli/authoring/update';
import { planMove, summarizePlan, computeDestinationPath } from '../dist-cli/authoring/move';
import {
  loadManifest,
  saveManifest,
  upsertEntries,
  computeStatus,
  removeEntries,
  sha256,
  MANIFEST_VERSION,
} from '../dist-cli/manifest';
import { scanContent, formatScanFindings, RULE_DESCRIPTIONS } from '../dist-cli/trust/scan';
import { applyMerge, reverseMerge, canonicalize } from '../dist-cli/config-merge';
import { upsertConfigEntry } from '../dist-cli/manifest';
import type { ConfigMergeOp } from '../dist-cli/types';
import { resolveClaudeConfigDestination } from '../dist-cli/targets/claude-code';
import { resolveCopilotConfigDestination } from '../dist-cli/targets/copilot';
import { resolveConfigRoot } from '../dist-cli/config-utils';
import { computeInstallStates } from '../dist-cli/install-state';

const CATALOG_DIR = path.resolve(__dirname, '../catalog');
const VERSION = '0.1.0';
const PACKS = [
  {
    name: 'dotnet-pack',
    displayName: '.NET / C# Pack',
    description: 'C# skills and agents',
    languages: ['csharp'],
  },
  {
    name: 'python-pack',
    displayName: 'Python Pack',
    description: 'Python skills and agents',
    languages: ['python'],
  },
  {
    name: 'react-pack',
    displayName: 'React Pack',
    description: 'React skills and agents',
    languages: ['react'],
  },
];

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
