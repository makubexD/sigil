/**
 * Linear step order for the `add` wizard. Each step's own `shouldShow` (where
 * present) is what makes branches like scope=all/pack/browse or config-vs-code
 * kinds behave correctly — there is no separate jump table to keep in sync.
 *
 * @module
 */
import type { WizardStep } from '../../engine';
import type { AddWizardState } from './state';
import { targetStep } from './target';
import { scopeStep } from './scope';
import { packStep } from './pack';
import { browseKindStep } from './browse-kind';
import { crossKindPickerStep } from './cross-kind-picker';
import { kindPickerStep } from './kind-picker';
import { languageStep } from './language';
import { depsStep } from './deps';
import { overwriteStep } from './overwrite';
import { configScopeStep } from './config-scope';
import { proceedStep } from './proceed';

export const ADD_STEPS: readonly WizardStep<AddWizardState>[] = [
  targetStep,
  scopeStep,
  packStep,
  browseKindStep,
  crossKindPickerStep,
  kindPickerStep,
  languageStep,
  depsStep,
  overwriteStep,
  configScopeStep,
  proceedStep,
];

export type { AddWizardState, AddWizardContext, ScopeChoice } from './state';
