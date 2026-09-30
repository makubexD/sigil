import { select, multiselect, groupMultiselect, note, isCancel, cancel } from '@clack/prompts';
import {
  buildLanguageOptions,
  groupArtifactsByLanguage,
  kindPlural,
  CONFIG_KINDS,
} from '../../../select';
import type { WizardStep, StepOutcome } from '../../engine';
import { BACK, chosenTarget, visibleArtifacts, type AddWizardState } from './state';
import { buildPickerSummary, toArtifactOption, legendFor, type PickerOption } from './options';

/**
 * Per-kind artifact picker for "Pick specific items" → a specific kind.
 * Config kinds (mcp/hook/settings): flat multiselect, skips the language filter
 * entirely (config kinds are language-agnostic) — `includeDeps` defaults to true
 * since config kinds have no `uses:` closure anyway.
 * Code kinds: optional skippable language narrowing, then a flat or
 * language-grouped picker depending on how many languages are present.
 */
export const kindPickerStep: WizardStep<AddWizardState> = {
  id: 'kindPicker',
  shouldShow: s => s.scope === 'browse' && s.browseAll === false,
  async run(s): Promise<StepOutcome> {
    const ct = chosenTarget(s);
    const visible = visibleArtifacts(s);
    const kind = s.kindPick!;
    const items = visible.filter(a => a.kind === kind);
    const kindLabel = kindPlural(ct, kind);

    if (CONFIG_KINDS.has(kind)) {
      const pickerSummary = buildPickerSummary(items, s.installStates);
      const opts = [
        { value: BACK, label: '← Back', hint: '' },
        ...items.map(a => toArtifactOption(a, ct, s.installStates)),
      ];
      const configLegend = legendFor(items, s.installStates);
      if (configLegend) note(configLegend, 'Legend');
      const picked = await multiselect({
        message: `Select ${kindLabel} to install${pickerSummary}  (include "← Back" to return)`,
        options: opts,
        required: false,
        initialValues: [],
      });
      if (isCancel(picked)) {
        cancel('Install cancelled.');
        return 'cancel';
      }
      const arr = picked as string[];
      if (arr.includes(BACK) || arr.length === 0) return 'back';

      s.selectors = arr;
      s.includeDeps = true; // config kinds have no closure — no-op but keeps state consistent
      return 'next';
    }

    // Language-bearing kind: optional, skippable language filter, then artifact picker.
    const langOpts = buildLanguageOptions(items);
    let pickerLanguage: string | undefined;
    if (langOpts.length > 1) {
      const langSel = await select({
        message: 'Narrow by language?  (optional — Enter to see all)',
        options: [{ value: BACK, label: '← Back', hint: '' }, ...langOpts],
        initialValue: '',
      });
      if (isCancel(langSel)) {
        cancel('Install cancelled.');
        return 'cancel';
      }
      if (langSel === BACK) return 'back';
      pickerLanguage = (langSel as string) || undefined;
    }

    const byLang = groupArtifactsByLanguage(items, pickerLanguage);
    const langKeys = Object.keys(byLang);
    let firstValue: string | undefined;
    const codePickerSummary = buildPickerSummary(items, s.installStates);

    if (langKeys.length <= 1) {
      // langKeys[0] is guaranteed non-undefined here (length === 1 branch)
      const flatItems = langKeys.length === 1 ? (byLang[langKeys[0]!] ?? items) : items;
      const opts: PickerOption[] = [
        { value: BACK, label: '← Back', hint: '' },
        ...flatItems.map(a => {
          const opt = toArtifactOption(a, ct, s.installStates);
          if (!firstValue) firstValue = opt.value;
          return opt;
        }),
      ];
      const flatLegend = legendFor(flatItems, s.installStates);
      if (flatLegend) note(flatLegend, 'Legend');
      const picked = await multiselect({
        message: `Select ${kindLabel} to install${codePickerSummary}  (include "← Back" to return)`,
        options: opts,
        required: false,
        initialValues: [],
      });
      if (isCancel(picked)) {
        cancel('Install cancelled.');
        return 'cancel';
      }
      const arr = picked as string[];
      if (arr.includes(BACK) || arr.length === 0) return 'back';
      s.selectors = arr;
    } else {
      const groupedOpts: Record<string, PickerOption[]> = {
        '⬆ Navigation': [{ value: BACK, label: '← Back', hint: '' }],
      };
      for (const [gKey, arts] of Object.entries(byLang)) {
        groupedOpts[gKey] = arts.map(a => {
          const opt = toArtifactOption(a, ct, s.installStates);
          if (!firstValue) firstValue = opt.value;
          return opt;
        });
      }
      const groupedLegend = legendFor(Object.values(byLang).flat(), s.installStates);
      if (groupedLegend) note(groupedLegend, 'Legend');
      const picked = await groupMultiselect({
        message: `Select ${kindLabel} to install${codePickerSummary}  (include "← Back" to return)`,
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
    }

    return 'next';
  },
};
