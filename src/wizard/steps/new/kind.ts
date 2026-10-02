import { select, log, isCancel } from '../../prompts';
import { cancel } from '../../frame';
import type { WizardStep, StepOutcome } from '../../engine';
import type { NewWizardState } from './state';

const KIND_OPTIONS = [
  {
    value: 'skill',
    label: 'Skill',
    hint: 'procedural how-to workflow — invoked when the user asks for guidance',
  },
  { value: 'agent', label: 'Agent', hint: 'persistent AI persona with an ongoing role' },
  { value: 'rule', label: 'Rule', hint: 'always-on coding convention (style, naming, patterns)' },
  {
    value: 'prompt',
    label: 'Prompt',
    hint: 'parameterised one-shot command (language-agnostic)',
  },
];

/** First step: what kind of artifact? No "← Back" — this is the first step. */
export const kindStep: WizardStep<NewWizardState> = {
  id: 'kind',
  async run(s): Promise<StepOutcome> {
    log.info('Note: workflow artifacts are not yet scaffoldable via `new`.');
    const answer = await select({
      message: 'What kind of artifact?',
      options: KIND_OPTIONS,
      ...(s.kind ? { initialValue: s.kind } : {}),
    });
    if (isCancel(answer)) {
      cancel('Scaffold cancelled.');
      return 'cancel';
    }
    s.kind = answer as string;
    return 'next';
  },
};
