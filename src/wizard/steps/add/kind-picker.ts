import { select, isCancel, cancel } from '@clack/prompts';
import {
  buildLanguageOptions,
  hasLanguageChoice,
  groupArtifactsByLanguage,
  kindPlural,
  CONFIG_KINDS,
} from '../../../select';
import type { WizardStep, StepOutcome } from '../../engine';
import { BACK, chosenTarget, visibleArtifacts, type AddWizardState } from './state';
import { buildPickerSummary, toArtifactOption } from './options';
import { BACK_OPTION, resolveOutcome } from './prompt-helpers';
import type { ItemRow, PickerGroups } from '../../picker';
import { pickUntilUsable } from './pick';

const BACK_ROW = { kind: 'back' as const, value: BACK };

/** Resolves a picker answer to either a StepOutcome or the picked ids. */
function resolvePickedIds(picked: string[] | symbol): StepOutcome | string[] {
  if (isCancel(picked)) {
    cancel('Install cancelled.');
    return 'cancel';
  }
  if (picked.includes(BACK)) return 'back';
  return picked;
}

/** Builds the "Select <kindLabel> to install (N already installed…)  (include "← Back"…)" message. */
function buildPickerMessage(
  kindLabel: string,
  items: ReturnType<typeof visibleArtifacts>,
  installStates: AddWizardState['installStates'],
): string {
  const pickerSummary = buildPickerSummary(items, installStates);
  return `Select ${kindLabel} to install${pickerSummary}  (Space ticks, Enter confirms)`;
}

/** Shared context for the per-kind picker helpers below. */
interface PickerCtx {
  s: AddWizardState;
  ct: ReturnType<typeof chosenTarget>;
  items: ReturnType<typeof visibleArtifacts>;
  kindLabel: string;
}

/** Config-kind (mcp/hook/settings) flat picker — language-agnostic, no closure. */
async function runConfigKindPicker(ctx: PickerCtx): Promise<StepOutcome> {
  const { s, ct, items, kindLabel } = ctx;
  const rows: ItemRow[] = items.map(a => toArtifactOption(a, ct, s.installStates));
  const picked = await pickUntilUsable({
    message: buildPickerMessage(kindLabel, items, s.installStates),
    options: { [kindLabel]: [BACK_ROW, ...rows] },
    required: false,
    initialValues: s.selectors ?? [],
  });
  const result = resolvePickedIds(picked);
  if (typeof result === 'string') return result;

  s.selectors = result;
  s.includeDeps = true; // config kinds have no closure — no-op but keeps state consistent
  return 'next';
}

/** Optional, skippable "Narrow by language?" prompt; returns undefined to mean "all languages". */
async function promptPickerLanguage(
  items: ReturnType<typeof visibleArtifacts>,
): Promise<{ language: string | undefined } | StepOutcome> {
  if (!hasLanguageChoice(items)) return { language: undefined };
  const langOpts = buildLanguageOptions(items);

  const langSel = await select({
    message: 'Narrow by language?  (optional — Enter to see all)',
    options: [BACK_OPTION, ...langOpts],
    initialValue: '',
  });
  const outcome = resolveOutcome(langSel);
  if (outcome) return outcome;
  return { language: (langSel as string) || undefined };
}

/** Builds flat picker rows from `flatItems`. */
function buildFlatOptions(
  flatItems: ReturnType<typeof visibleArtifacts>,
  ct: ReturnType<typeof chosenTarget>,
  s: AddWizardState,
): ItemRow[] {
  return flatItems.map(a => toArtifactOption(a, ct, s.installStates));
}

/** Flat (single-language) picker for a code kind — rendered as one group under the kind label. */
async function runFlatCodePicker(
  ctx: PickerCtx,
  flatItems: ReturnType<typeof visibleArtifacts>,
): Promise<StepOutcome> {
  const { s, ct, items, kindLabel } = ctx;
  const rows: PickerGroups[string] = [BACK_ROW, ...buildFlatOptions(flatItems, ct, s)];
  const picked = await pickUntilUsable({
    message: buildPickerMessage(kindLabel, items, s.installStates),
    options: { [kindLabel]: rows },
    required: false,
    initialValues: s.selectors ?? [],
  });
  const result = resolvePickedIds(picked);
  if (typeof result === 'string') return result;
  s.selectors = result;
  return 'next';
}

/** Builds grouped picker options from `byLang`, tracking the first value for cursor placement. */
function buildGroupedOptions(
  byLang: Record<string, ReturnType<typeof visibleArtifacts>>,
  ct: ReturnType<typeof chosenTarget>,
  s: AddWizardState,
): { groupedOpts: PickerGroups; firstValue: string | undefined } {
  let firstValue: string | undefined;
  const groupedOpts: PickerGroups = { '⬆ Navigation': [BACK_ROW] };
  for (const [gKey, arts] of Object.entries(byLang)) {
    groupedOpts[gKey] = arts.map(a => {
      const opt = toArtifactOption(a, ct, s.installStates);
      if (!firstValue) firstValue = opt.value;
      return opt;
    });
  }
  return { groupedOpts, firstValue };
}

/** Language-grouped picker for a code kind (≥2 languages present). */
async function runGroupedCodePicker(
  ctx: PickerCtx,
  byLang: Record<string, ReturnType<typeof visibleArtifacts>>,
): Promise<StepOutcome> {
  const { s, ct, items, kindLabel } = ctx;
  const { groupedOpts, firstValue } = buildGroupedOptions(byLang, ct, s);
  const picked = await pickUntilUsable({
    message: buildPickerMessage(kindLabel, items, s.installStates),
    options: groupedOpts,
    required: false,
    initialValues: s.selectors ?? [],
    ...(firstValue ? { cursorAt: firstValue } : {}),
  });
  return finishPick(s, picked);
}

/** Resolves a pick result and either returns the outcome or commits it to `s.selectors`. */
function finishPick(s: AddWizardState, picked: string[] | symbol): StepOutcome {
  const result = resolvePickedIds(picked);
  if (typeof result === 'string') return result;
  s.selectors = result;
  return 'next';
}

/** Code-kind (skill/agent/rule/prompt/workflow) picker: optional language filter, then flat/grouped. */
async function runCodeKindPicker(ctx: PickerCtx): Promise<StepOutcome> {
  const { items } = ctx;
  const langResult = await promptPickerLanguage(items);
  if (typeof langResult === 'string') return langResult;

  const byLang = groupArtifactsByLanguage(items, langResult.language);
  const langKeys = Object.keys(byLang);

  if (langKeys.length <= 1) {
    // langKeys[0] is guaranteed non-undefined here (length === 1 branch)
    const flatItems = langKeys.length === 1 ? (byLang[langKeys[0]!] ?? items) : items;
    return runFlatCodePicker(ctx, flatItems);
  }
  return runGroupedCodePicker(ctx, byLang);
}

/**
 * Per-kind artifact picker for "Pick specific items" → a specific kind.
 * Config kinds (mcp/hook/settings): flat picker, skips the language filter
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

    const ctx: PickerCtx = { s, ct, items, kindLabel };
    if (CONFIG_KINDS.has(kind)) return runConfigKindPicker(ctx);
    return runCodeKindPicker(ctx);
  },
};
