/**
 * Step-machine installer wizard for `sigil add`.
 *
 * Each step pushes itself to a history stack when the user moves forward.
 * Every select/multiselect/confirm includes a "← Back" option that pops the
 * history and returns to the previous step — without losing earlier answers.
 * Cancelling (Ctrl-C / Escape) always aborts the entire wizard.
 *
 * Guard: caller must check isInteractiveTTY() before invoking runWizard().
 */
import {
  intro,
  outro,
  select,
  multiselect,
  groupMultiselect,
  note,
  isCancel,
  cancel,
} from '@clack/prompts';
import type { ResolvedCatalog, Pack, ArtifactKind, Target, ConfigKind } from '../types';
import {
  artifactHint,
  resolveSelection,
  computeClosure,
  groupArtifactsByLanguage,
  partitionConfigKinds,
  availableKinds,
  buildLanguageOptions,
  kindNoun,
  kindPlural,
  kindHint,
  CONFIG_KINDS,
  KIND_ORDER,
} from '../select';
import { ALL_KINDS } from '../kinds';
import type { ClosurePreview } from '../select';
import { getAllTargets } from '../targets';
import { computeInstallStates, type ArtifactInstallState } from '../install-state';
import { TARGET_META } from './types';
import type { WizardResult } from './types';
import { stateHintSuffix, renderStateLegend } from './state-display';

type ScopeChoice = 'all' | 'pack' | 'browse';

/** Sentinel value used to signal "go back one step" in wizard prompts. */
const BACK = '__back__';

/** Build a per-picker header summary like "  (3 already installed, 1 new)". */
function buildPickerSummary(
  items: Array<{ id: string }>,
  installStates: Map<string, ArtifactInstallState> | undefined,
): string {
  if (!installStates || items.length === 0) return '';
  const installed = items.filter(a => installStates.get(a.id)?.state === 'up-to-date').length;
  const isNew = items.filter(a => {
    const st = installStates.get(a.id)?.state;
    return st === 'new' || st === undefined;
  }).length;
  const parts: string[] = [];
  if (installed > 0) parts.push(`${installed} already installed`);
  if (isNew > 0) parts.push(`${isNew} new`);
  return parts.length > 0 ? `  (${parts.join(', ')})` : '';
}

/**
 * Builds a short content-summary hint for a pack option in the "Which bundle?" picker.
 * E.g. "2 MCP servers · 1 hook · 1 settings · 1 skill (+deps)"
 * Falls back to the pack displayName when expansion fails.
 */
function packContentHint(
  pack: Pack,
  catalog: ResolvedCatalog,
  packs: Pack[],
  target: Target | undefined,
): string {
  try {
    const { ids } = resolveSelection([`pack:${pack.name}`], {}, catalog, packs, []);
    const kindCounts = new Map<string, number>();
    let hasSkill = false;
    for (const id of ids) {
      const a = catalog.byId.get(id);
      if (!a) continue;
      kindCounts.set(a.kind, (kindCounts.get(a.kind) ?? 0) + 1);
      if (a.kind === 'skill') hasSkill = true;
    }
    // Display order from kinds.ts (config first, then code kinds — single source of truth).
    const displayOrder = ALL_KINDS;
    const parts: string[] = [];
    for (const k of displayOrder) {
      const count = kindCounts.get(k);
      if (!count) continue;
      const label = count === 1 ? kindNoun(target, k) : kindPlural(target, k);
      parts.push(`${count} ${label}`);
    }
    for (const k of KIND_ORDER) {
      if (!displayOrder.includes(k as ArtifactKind)) {
        const count = kindCounts.get(k);
        if (count) parts.push(`${count} ${kindPlural(target, k)}`);
      }
    }
    if (hasSkill) parts.push('+deps');
    return parts.join(' · ') || pack.displayName;
  } catch {
    return pack.displayName;
  }
}

export async function runWizard(
  catalog: ResolvedCatalog,
  packs: Pack[],
  detectedTarget: string,
  projectDir: string,
): Promise<WizardResult | null> {
  intro('📦  sigil  —  interactive installer');

  const scaffoldableTargets = getAllTargets().filter(t => Boolean(t.scaffold));

  // ── Mutable wizard state ──────────────────────────────────────────────────
  type WState = {
    target?: string;
    scope?: ScopeChoice;
    kindPick?: ArtifactKind;
    selectors?: string[];
    language?: string | undefined;
    includeDeps?: boolean;
    overwrite?: boolean;
    configScope?: string | undefined;
    installStates?: Map<string, ArtifactInstallState>;
    installStatesForTarget?: string;
  };
  const s: WState = {};

  /**
   * History stack: push the CURRENT step ID *when leaving it* (moving forward).
   * Auto-skipped steps are never pushed, so back correctly skips over them.
   */
  const history: string[] = [];
  let step = 'target';

  const getChosenTarget = () => scaffoldableTargets.find(t => t.name === s.target);
  const getVisible = () => {
    const ct = getChosenTarget();
    const kindSet = new Set<string>(ct?.supportedKinds ?? []);
    return kindSet.size === 0
      ? catalog.artifacts
      : catalog.artifacts.filter(a => kindSet.has(a.kind));
  };

  while (true) {
    // ── target ──────────────────────────────────────────────────────────────
    if (step === 'target') {
      const targetOptions = scaffoldableTargets.map(t => ({
        value: t.name,
        label: TARGET_META[t.name]?.label ?? t.name,
        hint: TARGET_META[t.name]?.hint ?? '',
      }));
      const answer = await select({
        message: `Install target  (detected: ${detectedTarget})`,
        options: targetOptions,
        initialValue: s.target ?? detectedTarget,
      });
      if (isCancel(answer)) {
        cancel('Install cancelled.');
        return null;
      }
      s.target = answer as string;
      if (getVisible().length === 0) {
        cancel(`No installable artifacts for target '${s.target}'.`);
        return null;
      }
      // Compute install states for all visible artifacts (once per target selection).
      // Invalidated whenever the user picks a different target via Back navigation.
      if (s.installStatesForTarget !== s.target) {
        const ct = getChosenTarget();
        if (ct) {
          try {
            s.installStates = await computeInstallStates(
              getVisible().map(a => a.id),
              ct,
              catalog,
              projectDir,
            );
          } catch {
            // State detection failed — proceed without annotations (all items appear as 'new').
            s.installStates = new Map();
          }
          s.installStatesForTarget = s.target;
        }
      }
      history.push('target');
      step = 'scope';
      continue;
    }

    // ── scope ──────────────────────────────────────────────────────────────
    if (step === 'scope') {
      const visible = getVisible();
      const totalCount = visible.length;
      const scopeOpts = [
        { value: BACK, label: '← Back', hint: '' },
        {
          value: 'all',
          label: 'Everything',
          hint: `full catalog — ${totalCount} artifact${totalCount !== 1 ? 's' : ''}`,
        },
        ...(packs.length > 0
          ? [
              {
                value: 'pack',
                label: 'Recommended',
                hint: 'curated bundles — mix of tools, skills & settings',
              },
            ]
          : []),
        {
          value: 'browse',
          label: 'Pick specific items',
          hint: 'choose by type, or mix across types',
        },
      ];
      const answer = await select({
        message: 'What would you like to install?',
        options: scopeOpts,
        initialValue: s.scope ?? 'all',
      });
      if (isCancel(answer)) {
        cancel('Install cancelled.');
        return null;
      }
      if (answer === BACK) {
        step = history.pop() ?? 'target';
        continue;
      }
      s.scope = answer as ScopeChoice;
      history.push('scope');
      step = 'narrow';
      continue;
    }

    // ── narrow ─────────────────────────────────────────────────────────────
    if (step === 'narrow') {
      const visible = getVisible();
      const chosenTarget = getChosenTarget();

      if (s.scope === 'all') {
        // Pass-through: no interactive prompt shown, so do NOT push to history.
        // History invariant: only steps that rendered a prompt push a frame.
        s.selectors = ['all'];
        step = 'language';
        continue;
      }

      if (s.scope === 'pack') {
        const opts = [
          { value: BACK, label: '← Back', hint: '' },
          ...packs.map(p => ({
            value: `pack:${p.name}`,
            label: p.displayName,
            hint: packContentHint(p, catalog, packs, chosenTarget),
          })),
        ];
        const answer = await select({
          message: 'Which pack?',
          options: opts,
          initialValue: s.selectors?.[0],
        });
        if (isCancel(answer)) {
          cancel('Install cancelled.');
          return null;
        }
        if (answer === BACK) {
          step = history.pop() ?? 'scope';
          continue;
        }
        s.selectors = [answer as string];
        history.push('narrow');
        step = 'deps'; // pack implies its own language — skip language filter
        continue;
      }

      if (s.scope === 'browse') {
        const presentKinds = availableKinds(visible);
        const ALL_TYPES = '__all__';
        const kindOpts = [
          { value: BACK, label: '← Back', hint: '' },
          {
            value: ALL_TYPES,
            label: 'All types (mix anything)',
            hint: 'pick across kinds in one list',
          },
          ...presentKinds.map(k => {
            const count = visible.filter(a => a.kind === k).length;
            return {
              value: k,
              label: kindPlural(chosenTarget, k),
              hint: `${count} · ${kindHint(chosenTarget, k) ?? ''}`,
            };
          }),
        ];
        const answer = await select({
          message: 'Browse & pick',
          options: kindOpts,
          initialValue: s.kindPick ?? ALL_TYPES,
        });
        if (isCancel(answer)) {
          cancel('Install cancelled.');
          return null;
        }
        if (answer === BACK) {
          step = history.pop() ?? 'scope';
          continue;
        }
        if (answer === ALL_TYPES) {
          history.push('narrow');
          step = 'crossKindPicker';
          continue;
        }
        s.kindPick = answer as ArtifactKind;
        history.push('narrow');
        step = 'kindPicker';
        continue;
      }

      step = 'proceed';
      continue;
    }

    // ── crossKindPicker — cross-kind grouped picker ─────────────────────────
    if (step === 'crossKindPicker') {
      const visible = getVisible();
      const chosenTarget = getChosenTarget();
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
          return null;
        }
        if (langAnswer === BACK) {
          step = history.pop() ?? 'narrow';
          continue;
        }
        pickerLanguage = (langAnswer as string) || undefined;
      }

      const byLang = groupArtifactsByLanguage(codeArtifacts, pickerLanguage);
      const codeTotal = Object.values(byLang).reduce((n, arr) => n + arr.length, 0);
      if (codeTotal === 0 && configArtifacts.length === 0) {
        cancel('No artifacts match the selected language filter.');
        return null;
      }

      type PO = { value: string; label: string; hint: string };
      const groupedOpts: Record<string, PO[]> = {
        '⬆ Navigation': [{ value: BACK, label: '← Back', hint: '' }],
      };
      let firstValue: string | undefined;

      if (configArtifacts.length > 0) {
        groupedOpts['Config — agnostic'] = configArtifacts.map(a => {
          const val = `${a.kind}:${a.id}`;
          if (!firstValue) firstValue = val;
          const is = s.installStates?.get(a.id);
          return {
            value: val,
            label: `${a.id}  (${kindNoun(chosenTarget, a.kind)})`,
            hint: `${stateHintSuffix(is?.state)}  — ${artifactHint(a)}`,
          };
        });
      }

      for (const [gKey, arts] of Object.entries(byLang)) {
        groupedOpts[gKey] = arts.map(a => {
          const val = `${a.kind}:${a.id}`;
          if (!firstValue) firstValue = val;
          const is = s.installStates?.get(a.id);
          return {
            value: val,
            label: `${a.id}  (${kindNoun(chosenTarget, a.kind)})`,
            hint: `${stateHintSuffix(is?.state)}  — ${artifactHint(a)}`,
          };
        });
      }

      const allItems = [...configArtifacts, ...Object.values(byLang).flat()];
      const legend = renderStateLegend(allItems, s.installStates);
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
        return null;
      }
      const arr = picked as string[];
      if (arr.includes(BACK) || arr.length === 0) {
        step = history.pop() ?? 'narrow';
        continue;
      }
      s.selectors = arr;
      history.push('crossKindPicker');
      step = 'deps';
      continue;
    }

    // ── kindPicker (browse scope) — per-kind artifact picker ────────────────
    if (step === 'kindPicker') {
      const chosenTarget = getChosenTarget();
      const visible = getVisible();
      const kind = s.kindPick!;
      const items = visible.filter(a => a.kind === kind);
      const kindLabel = kindPlural(chosenTarget, kind);

      if (CONFIG_KINDS.has(kind)) {
        const pickerSummary = buildPickerSummary(items, s.installStates);
        const opts = [
          { value: BACK, label: '← Back', hint: '' },
          ...items.map(a => {
            const is = s.installStates?.get(a.id);
            return {
              value: `${a.kind}:${a.id}`,
              label: `${a.id}  (${kindNoun(chosenTarget, a.kind)})`,
              hint: `${stateHintSuffix(is?.state)}  — ${artifactHint(a)}`,
            };
          }),
        ];
        const configLegend = renderStateLegend(items, s.installStates);
        if (configLegend) note(configLegend, 'Legend');
        const picked = await multiselect({
          message: `Select ${kindLabel} to install${pickerSummary}  (include "← Back" to return)`,
          options: opts,
          required: false,
          initialValues: [],
        });
        if (isCancel(picked)) {
          cancel('Install cancelled.');
          return null;
        }
        const arr = picked as string[];
        if (arr.includes(BACK) || arr.length === 0) {
          step = history.pop() ?? 'narrow';
          continue;
        }
        s.selectors = arr;
        s.includeDeps = true; // config kinds have no closure — no-op but keeps state consistent
        history.push('kindPicker');
        step = 'overwrite'; // skip language + deps for config kinds
        continue;
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
          return null;
        }
        if (langSel === BACK) {
          step = history.pop() ?? 'narrow';
          continue;
        }
        pickerLanguage = (langSel as string) || undefined;
      }

      const byLang = groupArtifactsByLanguage(items, pickerLanguage);
      const langKeys = Object.keys(byLang);
      type PO = { value: string; label: string; hint: string };
      let firstValue: string | undefined;
      const codePickerSummary = buildPickerSummary(items, s.installStates);

      if (langKeys.length <= 1) {
        // langKeys[0] is guaranteed non-undefined here (length === 1 branch)
        const flatItems = langKeys.length === 1 ? (byLang[langKeys[0]!] ?? items) : items;
        const opts: PO[] = [
          { value: BACK, label: '← Back', hint: '' },
          ...flatItems.map(a => {
            const val = `${a.kind}:${a.id}`;
            if (!firstValue) firstValue = val;
            const is = s.installStates?.get(a.id);
            return {
              value: val,
              label: `${a.id}  (${kindNoun(chosenTarget, a.kind)})`,
              hint: `${stateHintSuffix(is?.state)}  — ${artifactHint(a)}`,
            };
          }),
        ];
        const flatLegend = renderStateLegend(flatItems, s.installStates);
        if (flatLegend) note(flatLegend, 'Legend');
        const picked = await multiselect({
          message: `Select ${kindLabel} to install${codePickerSummary}  (include "← Back" to return)`,
          options: opts,
          required: false,
          initialValues: [],
        });
        if (isCancel(picked)) {
          cancel('Install cancelled.');
          return null;
        }
        const arr = picked as string[];
        if (arr.includes(BACK) || arr.length === 0) {
          step = history.pop() ?? 'narrow';
          continue;
        }
        s.selectors = arr;
      } else {
        const groupedOpts: Record<string, PO[]> = {
          '⬆ Navigation': [{ value: BACK, label: '← Back', hint: '' }],
        };
        for (const [gKey, arts] of Object.entries(byLang)) {
          groupedOpts[gKey] = arts.map(a => {
            const val = `${a.kind}:${a.id}`;
            if (!firstValue) firstValue = val;
            const is = s.installStates?.get(a.id);
            return {
              value: val,
              label: `${a.id}  (${kindNoun(chosenTarget, a.kind)})`,
              hint: `${stateHintSuffix(is?.state)}  — ${artifactHint(a)}`,
            };
          });
        }
        const groupedLegend = renderStateLegend(Object.values(byLang).flat(), s.installStates);
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
          return null;
        }
        const arr = picked as string[];
        if (arr.includes(BACK) || arr.length === 0) {
          step = history.pop() ?? 'narrow';
          continue;
        }
        s.selectors = arr;
      }

      history.push('kindPicker');
      step = 'deps';
      continue;
    }

    // ── language filter (all scope only) ──────────────────────────────────
    if (step === 'language') {
      const visible = getVisible();
      const { rest: codeArtifacts } = partitionConfigKinds(visible);
      const langOpts = buildLanguageOptions(codeArtifacts);
      if (langOpts.length <= 1) {
        s.language = undefined;
        step = 'deps';
        continue;
      }

      const opts = [{ value: BACK, label: '← Back', hint: '' }, ...langOpts];
      const langAnswer = await select({
        message: 'Narrow to a language?  (MCPs, hooks & settings are always included)',
        options: opts,
        initialValue: s.language ?? '',
      });
      if (isCancel(langAnswer)) {
        cancel('Install cancelled.');
        return null;
      }
      if (langAnswer === BACK) {
        step = history.pop() ?? 'scope';
        continue;
      }
      s.language = (langAnswer as string) || undefined;
      history.push('language');
      step = 'deps';
      continue;
    }

    // ── deps ───────────────────────────────────────────────────────────────
    if (step === 'deps') {
      const chosenTarget = getChosenTarget();
      const { ids: primaryIds } = resolveSelection(
        s.selectors!,
        { language: s.language },
        catalog,
        packs,
        [],
      );
      const cp: ClosurePreview = computeClosure(primaryIds, catalog);

      let depBody: string;
      if (cp.dependencies.length > 0) {
        const lines = cp.dependencies.map(({ artifact: a, via }) => {
          const title = (a.frontmatter.title as string | undefined) ?? a.id;
          const viaDisplay = via.length <= 2 ? via.join(', ') : `${via[0]} +${via.length - 1} more`;
          return `  ${kindNoun(chosenTarget, a.kind).padEnd(12)}  ${a.id}  — ${title}  (via ${viaDisplay})`;
        });
        depBody =
          'The skill author recommends installing these alongside it\n' +
          "(declared in the skill's `uses:` frontmatter — not a hard requirement):\n" +
          lines.join('\n') +
          '\n\nYes installs these too. No installs only your selection (--no-deps).';
      } else {
        depBody =
          'Your current selection has no uses: dependencies — only your selected artifacts will be written.';
      }
      note(depBody, 'About dependencies');

      const answer = await select({
        message: 'Include dependencies?',
        options: [
          { value: 'yes', label: 'Yes', hint: 'install skills + their dependency closure' },
          { value: 'no', label: 'No', hint: 'install selected only (--no-deps)' },
          { value: BACK, label: '← Back', hint: '' },
        ],
        initialValue: s.includeDeps === false ? 'no' : 'yes',
      });
      if (isCancel(answer)) {
        cancel('Install cancelled.');
        return null;
      }
      if (answer === BACK) {
        step = history.pop() ?? 'language';
        continue;
      }
      s.includeDeps = answer === 'yes';
      history.push('deps');
      step = 'overwrite';
      continue;
    }

    // ── overwrite ──────────────────────────────────────────────────────────
    if (step === 'overwrite') {
      note(
        'No keeps your existing files and lists any conflicts at the end.\n' +
          'Yes replaces them in place — equivalent to --overwrite.',
        'About conflicts',
      );
      const answer = await select({
        message: 'Overwrite existing files if conflicts are found?',
        options: [
          { value: 'no', label: 'No', hint: 'warn and list conflicts (safe default)' },
          { value: 'yes', label: 'Yes', hint: 'replace existing files (--overwrite)' },
          { value: BACK, label: '← Back', hint: '' },
        ],
        initialValue: s.overwrite ? 'yes' : 'no',
      });
      if (isCancel(answer)) {
        cancel('Install cancelled.');
        return null;
      }
      if (answer === BACK) {
        step = history.pop() ?? 'deps';
        continue;
      }
      s.overwrite = answer === 'yes';
      history.push('overwrite');
      step = 'configScope';
      continue;
    }

    // ── configScope — only shown when any config-kind artifact is selected ─
    if (step === 'configScope') {
      const { ids: allIds } = resolveSelection(
        s.selectors!,
        { language: s.language },
        catalog,
        packs,
        [],
      );
      const hasConfigKind = allIds.some(id => CONFIG_KINDS.has(catalog.byId.get(id)?.kind ?? ''));

      if (!hasConfigKind) {
        step = 'proceed';
        continue;
      }

      const chosenTarget = getChosenTarget();
      const selectedConfigKinds = [
        ...new Set(
          allIds
            .map(id => catalog.byId.get(id)?.kind)
            .filter((k): k is ConfigKind => CONFIG_KINDS.has(k ?? '')),
        ),
      ];

      const scopeInfos = chosenTarget?.configScopes?.(selectedConfigKinds, projectDir) ?? [];
      const scopeOptions = [
        { value: BACK, label: '← Back', hint: '' },
        ...scopeInfos.map(si => {
          const targets = [
            ...new Set(
              si.destinations.map(d => (d.section ? `${d.fullPath}  › ${d.section}` : d.fullPath)),
            ),
          ];
          return {
            value: si.value,
            label: `${si.label}   (precedence ${si.precedence})`,
            hint: `${targets.join('  ·  ')}  — ${si.description}`,
          };
        }),
      ];

      const scopeAnswer = await select({
        message: 'Where should config artifacts (hook/settings/mcp) be installed?',
        options: scopeOptions,
        initialValue: s.configScope ?? 'project',
      });
      if (isCancel(scopeAnswer)) {
        cancel('Install cancelled.');
        return null;
      }
      if (scopeAnswer === BACK) {
        step = history.pop() ?? 'overwrite';
        continue;
      }
      s.configScope = scopeAnswer as string;

      const chosenScopeInfo = scopeInfos.find(si => si.value === s.configScope);
      if (chosenScopeInfo?.blastRadius === 'all-projects') {
        const uniqueTargets = [
          ...new Set(
            chosenScopeInfo.destinations.map(d =>
              d.section ? `${d.fullPath}  › ${d.section}` : d.fullPath,
            ),
          ),
        ];
        const hasSettings = allIds.some(id => catalog.byId.get(id)?.kind === 'settings');
        note(
          `⚠  This scope writes to:\n` +
            uniqueTargets.map(p => `     ${p}`).join('\n') +
            '\n⚠  These files affect ALL your projects.\n' +
            (hasSettings
              ? '⚠  settings artifacts at this scope can change AI behaviour globally.\n'
              : '') +
            'A backup will be saved to <file>.sigil.bak before the first write.\n' +
            'After install, compare the backup against the new file to verify\n' +
            'only your selected artifacts were added.',
          'Blast-radius warning',
        );
      }

      history.push('configScope');
      step = 'proceed';
      continue;
    }

    // ── proceed (summary + confirm) ────────────────────────────────────────
    if (step === 'proceed') {
      const chosenTarget = getChosenTarget();
      const { ids: primaryIds } = resolveSelection(
        s.selectors!,
        { language: s.language },
        catalog,
        packs,
        [],
      );
      const cp: ClosurePreview = computeClosure(primaryIds, catalog);

      const artifactLines: string[] = [];
      for (const a of cp.primary) {
        artifactLines.push(`  ${kindNoun(chosenTarget, a.kind).padEnd(12)}  ${a.id}  (your pick)`);
      }
      if (s.includeDeps) {
        for (const { artifact: a, via } of cp.dependencies) {
          const viaDisplay = via.length <= 2 ? via.join(', ') : `${via[0]} +${via.length - 1} more`;
          artifactLines.push(
            `  ${kindNoun(chosenTarget, a.kind).padEnd(12)}  ${a.id}  (dependency of ${viaDisplay})`,
          );
        }
      } else if (cp.dependencies.length > 0) {
        const n = cp.dependencies.length;
        artifactLines.push(`  (${n} recommended dep${n !== 1 ? 's' : ''} excluded)`);
      }
      const artifactCount = cp.primary.length + (s.includeDeps ? cp.dependencies.length : 0);

      const allIds = primaryIds;
      const hasConfigKind = allIds.some(id => CONFIG_KINDS.has(catalog.byId.get(id)?.kind ?? ''));
      let configScopeLines: string[] = [];
      if (hasConfigKind && chosenTarget?.configScopes) {
        const selectedConfigKinds = [
          ...new Set(
            allIds
              .map(id => catalog.byId.get(id)?.kind)
              .filter((k): k is ConfigKind => CONFIG_KINDS.has(k ?? '')),
          ),
        ];
        const effectiveScopeValue = s.configScope ?? 'project';
        const scopeInfos = chosenTarget.configScopes(selectedConfigKinds, projectDir);
        const chosenScopeInfo = scopeInfos.find(si => si.value === effectiveScopeValue);
        const destinations = chosenScopeInfo?.destinations ?? [];
        const destParts = [
          ...new Set(
            destinations.map(d => (d.section ? `${d.fullPath}  › ${d.section}` : d.fullPath)),
          ),
        ];
        configScopeLines = [
          `Config scope: ${effectiveScopeValue}`,
          ...destParts.map((dp, i) => (i === 0 ? `Destination:  ${dp}` : `              ${dp}`)),
        ];
      }

      note(
        [
          `Target:       ${s.target}`,
          ...(s.language ? [`Language:     ${s.language}`] : []),
          `Overwrite:    ${s.overwrite ? 'yes' : 'no (warn on conflict)'}`,
          ...configScopeLines,
          '',
          `Will install ${artifactCount} artifact${artifactCount !== 1 ? 's' : ''}:`,
          ...artifactLines,
        ].join('\n'),
        'Install plan',
      );

      const answer = await select({
        message: 'Ready to install?',
        options: [
          { value: 'proceed', label: 'Proceed with install', hint: '' },
          { value: BACK, label: '← Back', hint: 'change overwrite preference' },
          { value: 'cancel', label: 'Cancel', hint: '' },
        ],
      });
      if (isCancel(answer) || answer === 'cancel') {
        cancel('Install cancelled.');
        return null;
      }
      if (answer === BACK) {
        step = history.pop() ?? 'overwrite';
        continue;
      }

      outro('Running install…');
      return {
        target: s.target!,
        selectors: s.selectors!,
        includeDeps: s.includeDeps!,
        overwrite: s.overwrite!,
        language: s.language,
        configScope: s.configScope,
      };
    }

    // Unreachable
    return null;
  }
}
