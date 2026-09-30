/**
 * The one place a conformance rule is listed — adding a rule is one file in ./rules/ plus one
 * line here. Nothing else (detect.ts, fix-mechanical.ts, fix-editorial.ts, render.ts) hand-lists
 * rules; they all iterate this array.
 *
 * @module
 */
import type { ConformanceRule } from './types';
import { whenToUseLiftRule } from './rules/when-to-use-lift';
import { whenToUseQualityRule } from './rules/when-to-use-quality';
import { bodyDensityRule } from './rules/body-density';
import { platformPathLeakRule } from './rules/platform-path-leak';
import { appliesToRationaleRule } from './rules/applies-to-rationale';
import { relatedArtifactsRule } from './rules/related-artifacts';
import { providerKindCoverageRule } from './rules/provider-kind-coverage';
import { deprecatedHygieneRule } from './rules/deprecated-hygiene';
import { declaredButUnemittedRule } from './rules/declared-but-unemitted';
import { redundantDefaultRule } from './rules/redundant-default';
import { descriptionBudgetRule } from './rules/description-budget';

export const CONFORMANCE_RULES: readonly ConformanceRule[] = [
  whenToUseLiftRule,
  whenToUseQualityRule,
  bodyDensityRule,
  platformPathLeakRule,
  appliesToRationaleRule,
  relatedArtifactsRule,
  providerKindCoverageRule,
  deprecatedHygieneRule,
  declaredButUnemittedRule,
  redundantDefaultRule,
  descriptionBudgetRule,
];
