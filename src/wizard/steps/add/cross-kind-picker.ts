import { select, isCancel, cancel } from '@clack/prompts';
import {
  partitionConfigKinds,
  buildLanguageOptions,
  hasLanguageChoice,
  groupArtifactsByLanguage,
} from '../../../select';
import type { WizardStep, StepOutcome } from '../../engine';
import type { ResolvedArtifact } from '../../../types';
import { BACK, chosenTarget, visibleArtifacts, type AddWizardState } from './state';
import { toArtifactOption } from './options';
import { BACK_OPTION, resolveOutcome } from './prompt-helpers';
import type { ItemRow, PickerGroups } from '../../picker';
import { pickUntilUsable } from './pick';

const BACK_ROW = { kind: 'back' as const, value: BACK };

/** Optional, skippable "Narrow by language?" prompt over code artifacts only. */
async function promptCrossKindLanguage(
  codeArtifacts: ReturnType<typeof visibleArtifacts>,
): Promise<{ language: string | undefined } | StepOutcome> {
  if (codeArtifacts.length === 0 || !hasLanguageChoice(codeArtifacts))
    return { language: undefined };
  const indivLangOpts = buildLanguageOptions(codeArtifacts);

  const langAnswer = await select({
    message: 'Narrow by language?  (optional — Enter to see all)',
    options: [BACK_OPTION, ...indivLangOpts],
    initialValue: '',
  });
  const outcome = resolveOutcome(langAnswer);
  if (outcome) return outcome;
  return { language: (langAnswer as string) || undefined };
}

/** Builds an artifact-to-row mapper that also records the first-seen row's value. */
function makeOptionMapper(
  ct: ReturnType<typeof chosenTarget>,
  s: AddWizardState,
): { toOpt: (a: ResolvedArtifact) => ItemRow; getFirstValue: () => string | undefined } {
  let firstValue: string | undefined;
  const toOpt = (a: ResolvedArtifact): ItemRow => {
    const opt = toArtifactOption(a, ct, s.installStates);
    if (!firstValue) firstValue = opt.value;
    return opt;
  };
  return { toOpt, getFirstValue: () => firstValue };
}

/** Builds the grouped picker options: "Config — agnostic" first, then one group per language. */
function buildCrossKindOptions(
  configArtifacts: ReturnType<typeof visibleArtifacts>,
  byLang: Record<string, ReturnType<typeof visibleArtifacts>>,
  ct: ReturnType<typeof chosenTarget>,
  s: AddWizardState,
): { groupedOpts: PickerGroups; firstValue: string | undefined } {
  const groupedOpts: PickerGroups = { '⬆ Navigation': [BACK_ROW] };
  const { toOpt, getFirstValue } = makeOptionMapper(ct, s);

  if (configArtifacts.length > 0) {
    groupedOpts['Config — agnostic'] = configArtifacts.map(toOpt);
  }
  for (const [gKey, arts] of Object.entries(byLang)) {
    groupedOpts[gKey] = arts.map(toOpt);
  }
  return { groupedOpts, firstValue: getFirstValue() };
}

/** Runs the picker prompt and maps the answer to a StepOutcome or picked ids. */
async function promptCrossKindPick(
  groupedOpts: PickerGroups,
  firstValue: string | undefined,
  previous: string[] | undefined,
): Promise<StepOutcome | string[]> {
  const picked = await pickUntilUsable({
    message: 'Select artifacts to install  (Space ticks, Enter confirms)',
    options: groupedOpts,
    required: false,
    initialValues: previous ?? [],
    ...(firstValue ? { cursorAt: firstValue } : {}),
  });
  if (isCancel(picked)) {
    cancel('Install cancelled.');
    return 'cancel';
  }
  if (picked.includes(BACK)) return 'back';
  return picked;
}

/** Groups code artifacts by language, guarding against an empty combined result. */
function groupOrCancel(
  codeArtifacts: ReturnType<typeof visibleArtifacts>,
  configArtifacts: ReturnType<typeof visibleArtifacts>,
  language: string | undefined,
): Record<string, ReturnType<typeof visibleArtifacts>> | 'cancel' {
  const byLang = groupArtifactsByLanguage(codeArtifacts, language);
  const codeTotal = Object.values(byLang).reduce((n, arr) => n + arr.length, 0);
  if (codeTotal === 0 && configArtifacts.length === 0) {
    cancel('No artifacts match the selected language filter.');
    return 'cancel';
  }
  return byLang;
}

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

    const langResult = await promptCrossKindLanguage(codeArtifacts);
    if (typeof langResult === 'string') return langResult;

    const byLang = groupOrCancel(codeArtifacts, configArtifacts, langResult.language);
    if (byLang === 'cancel') return 'cancel';

    const { groupedOpts, firstValue } = buildCrossKindOptions(configArtifacts, byLang, ct, s);

    const result = await promptCrossKindPick(groupedOpts, firstValue, s.selectors);
    if (typeof result === 'string') return result;

    s.selectors = result;
    return 'next';
  },
};
