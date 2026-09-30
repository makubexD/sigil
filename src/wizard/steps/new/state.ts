import type { ResolvedCatalog, Target } from '../../../types';

/** Sentinel value used to signal "go back one step" in wizard prompts. */
export const BACK = '__back__';

export interface NewWizardContext {
  readonly catalog: ResolvedCatalog;
  readonly targets: Target[];
}

export interface NewWizardState {
  readonly ctx: NewWizardContext;
  kind?: string;
  platforms?: string[] | undefined;
  language?: string | undefined;
  name?: string;
  title?: string;
  description?: string;
}
