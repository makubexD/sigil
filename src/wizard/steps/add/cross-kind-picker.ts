import { select, groupMultiselect, note, isCancel, cancel } from '@clack/prompts';
import {
  partitionConfigKinds,
  buildLanguageOptions,
  groupArtifactsByLanguage,
} from '../../../select';
import type { WizardStep, StepOutcome } from '../../engine';
import { BACK, chosenTarget, visibleArtifacts, type AddWizardState } from './state';
import { toArtifactOption, legendFor, type PickerOption } from './options';

/**
 * Cross-kind grouped picker for "All types (mix anything)". Optional language
 * pre-filter when ≥2 languages are present among code artifacts; config kinds
 * (mcp/hook/settings) always appear in their own "Config — agnostic" group,
 * never touched by the language filter.
 */
export const crossKindPickerStep: WizardStep<AddWizardState> = {
  id: 'crossKindPicker',
  shouldShow: s => s.scope === 'browse' && s.browseAll === true,
  async run(s): Promise<StepOutcome> {
    const visible = visibleArtifacts(s);
    const ct = chosenTarget(s);
    const { config: configArtifacts, rest: codeArtifacts } = partitionConfigKinds(visible);
    const indivLangOpts = buildLanguageOptions(codeArtifacts);
    let pickerLanguage: string | undefined;

    if (codeArtifacts.length > 0 && indivLangOpts.length > 1) {
      const opts = [{ value: BACK, label: '← Back', hint: '' }, ...indivLangOpts];
      const langAnswer = await select({
        message: 'Narrow by language?  (optional — Enter to see all)',
        options: opts,
        initialValue: '',
      });
      if (isCancel(langAnswer)) {
        cancel('Install cancelled.');
        return 'cancel';
      }
      if (langAnswer === BACK) return 'back';
      pickerLanguage = (langAnswer as string) || undefined;
    }

    const byLang = groupArtifactsByLanguage(codeArtifacts, pickerLanguage);
    const codeTotal = Object.values(byLang).reduce((n, arr) => n + arr.length, 0);
    if (codeTotal === 0 && configArtifacts.length === 0) {
      cancel('No artifacts match the selected language filter.');
      return 'cancel';
    }

    const groupedOpts: Record<string, PickerOption[]> = {
      '⬆ Navigation': [{ value: BACK, label: '← Back', hint: '' }],
    };
    let firstValue: string | undefined;

    if (configArtifacts.length > 0) {
      groupedOpts['Config — agnostic'] = configArtifacts.map(a => {
        const opt = toArtifactOption(a, ct, s.installStates);
        if (!firstValue) firstValue = opt.value;
        return opt;
      });
    }

    for (const [gKey, arts] of Object.entries(byLang)) {
      groupedOpts[gKey] = arts.map(a => {
        const opt = toArtifactOption(a, ct, s.installStates);
        if (!firstValue) firstValue = opt.value;
        return opt;
      });
    }

    const allItems = [...configArtifacts, ...Object.values(byLang).flat()];
    const legend = legendFor(allItems, s.installStates);
    if (legend) note(legend, 'Legend');

    const picked = await groupMultiselect({
      message: 'Select artifacts to install  (include "← Back" to return)',
      options: groupedOpts,
      required: false,
      initialValues: [],
      ...(firstValue ? { cursorAt: firstValue } : {}),
    });
    if (isCancel(picked)) {
      cancel('Install cancelled.');
      return 'cancel';
    }
    const arr = picked as string[];
    if (arr.includes(BACK) || arr.length === 0) return 'back';

    s.selectors = arr;
    return 'next';
  },
};
