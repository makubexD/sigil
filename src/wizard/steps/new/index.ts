import type { WizardStep } from '../../engine';
import type { NewWizardState } from './state';
import { kindStep } from './kind';
import { platformsStep } from './platforms';
import { languageStep } from './language';
import { fieldsConfirmStep } from './fields-confirm';

export const NEW_STEPS: readonly WizardStep<NewWizardState>[] = [
  kindStep,
  platformsStep,
  languageStep,
  fieldsConfirmStep,
];

export type { NewWizardState, NewWizardContext } from './state';
