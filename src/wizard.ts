/**
 * Interactive guided installer for `sigil add`.
 *
 * Triggered when `add` is run with no positional selectors in an interactive TTY.
 * Uses @clack/prompts for a clean, step-by-step experience.
 * Every answer maps 1:1 to a CLI flag so guided and scripted paths are equivalent.
 *
 * Guard: never runs when stdout/stdin is not a TTY (CI, pipes) — callers must check
 * isInteractiveTTY() before invoking runWizard().
 */

import {
  intro,
  outro,
  select,
  multiselect,
  text,
  groupMultiselect,
  confirm,
  note,
  log,
  isCancel,
  cancel,
} from '@clack/prompts';
import type { ResolvedCatalog, Pack, ArtifactKind, Target } from './types';
import type { ResolvedArtifact, Artifact } from './types';
import {
  artifactHint,
  resolveSelection,
  computeClosure,
  groupArtifactsByLanguage,
  availableKinds,
  buildLanguageOptions,
  kindNoun,
  kindPlural,
  kindHint,
} from './select';
import type { ClosurePreview } from './select';
import { getAllTargets } from './targets';
import { kindSupportingTargets, setPlatforms } from './authoring/platforms';

// ── Shared constants ──────────────────────────────────────────────────────────

/** Friendly labels and install-destination hints for known target names. */
export const TARGET_META: Record<string, { label: string; hint: string }> = {
  claude: { label: 'Claude Code', hint: 'writes to .claude/' },
  copilot: { label: 'GitHub Copilot', hint: 'writes to .github/' },
};

export interface WizardResult {
  /** Platform target (claude or copilot). */
  target: string;
  /**
   * Resolved selector strings ready to pass to resolveSelection().
   * E.g. ['skill:csharp/xunit-testing', 'agent:shared/code-reviewer'] or ['all'].
   */
  selectors: string[];
  /** Whether to install dependency closure (rules/agents referenced by uses). */
  includeDeps: boolean;
  /** Whether to overwrite existing files. */
  overwrite: boolean;
  /**
   * Optional language filter (e.g. 'csharp', 'python'). When set, only artifacts for
   * this language (plus shared/cross-language artifacts) are installed.
   * Undefined means all languages.
   */
  language?: string;
}

/** Returns true when stdin and stdout are both interactive terminals. */
export function isInteractiveTTY(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

type ScopeChoice = 'all' | 'pack' | 'kind' | 'individual';

/** Sentinel value used to signal "go back one step" in wizard prompts. */
const BACK = '__back__';

/**
 * Step-machine installer wizard for `sigil add`.
 *
 * Each step pushes itself to a history stack when the user moves forward.
 * Every select/multiselect/confirm includes a "← Back" option that pops the
 * history and returns to the previous step — without losing earlier answers.
 * Cancelling (Ctrl-C / Escape) always aborts the entire wizard.
 */
export async function runWizard(
  catalog: ResolvedCatalog,
  packs: Pack[],
  detectedTarget: string,
): Promise<WizardResult | null> {
  intro('📦  sigil  —  interactive installer');

  const scaffoldableTargets = getAllTargets().filter(t => Boolean(t.scaffold));

  // ── Mutable wizard state ──────────────────────────────────────────────────
  type WState = {
    target?: string;
    scope?: ScopeChoice;
    selectors?: string[];
    language?: string;
    includeDeps?: boolean;
    overwrite?: boolean;
  };
  const s: WState = {};

  /**
   * History stack: push the CURRENT step ID *when leaving it* (moving forward).
   * Back navigation pops from this stack to find where to return.
   * Auto-skipped steps are never pushed, so back correctly skips over them.
   */
  const history: string[] = [];
  let step = 'target';

  // ── Derived helpers (recomputed from state on every entry) ─────────────
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
        options: targetOptions, // no ← Back — first step
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
      history.push('target');
      step = 'scope';
      continue;
    }

    // ── scope ──────────────────────────────────────────────────────────────
    if (step === 'scope') {
      const packNames = packs.map(p => p.displayName).join(', ');
      const scopeOpts = [
        { value: BACK, label: '← Back', hint: '' },
        {
          value: 'all',
          label: 'Everything',
          hint: 'full catalog — all skills, agents, rules, prompts',
        },
        ...(packs.length > 0 ? [{ value: 'pack', label: 'By pack', hint: packNames }] : []),
        { value: 'kind', label: 'By kind', hint: 'e.g. all skills, or all agents, rules, prompts' },
        {
          value: 'individual',
          label: 'Pick individually',
          hint: 'narrow by language, then choose exact artifacts',
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
        s.selectors = ['all'];
        history.push('narrow');
        step = 'language';
        continue;
      }

      if (s.scope === 'pack') {
        const opts = [
          { value: BACK, label: '← Back', hint: '' },
          ...packs.map(p => ({
            value: `pack:${p.name}`,
            label: p.displayName,
            hint: (p.languages ?? []).join(', '),
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

      if (s.scope === 'kind') {
        const KIND_HINTS: Record<string, string> = {
          skill: 'procedural how-to guides for the AI',
          agent: 'specialised AI personas',
          rule: 'coding style guidelines',
          prompt: 'reusable parameterised prompts',
          workflow: 'multi-step automated workflows',
        };
        const presentKinds = availableKinds(visible);
        if (presentKinds.length === 1) {
          const k = presentKinds[0];
          log.info(
            `Only ${kindPlural(chosenTarget, k)} available for this target — selected automatically.`,
          );
          s.selectors = [`kind:${k}`];
        } else {
          const kindOpts = [
            { value: BACK, label: '← Back', hint: '(select to go back)' },
            ...presentKinds.map(k => {
              const count = visible.filter(a => a.kind === k).length;
              return {
                value: k,
                label: kindPlural(chosenTarget, k),
                hint: `${count} artifact${count !== 1 ? 's' : ''}  — ${kindHint(chosenTarget, k) ?? KIND_HINTS[k] ?? ''}`,
              };
            }),
          ];
          const kinds = await multiselect({
            message: 'Which kinds?  (include "← Back" to return)',
            options: kindOpts,
            initialValues: s.selectors?.map(sel => sel.replace('kind:', '')) ?? presentKinds,
            required: false,
          });
          if (isCancel(kinds)) {
            cancel('Install cancelled.');
            return null;
          }
          const arr = kinds as string[];
          if (arr.includes(BACK) || arr.length === 0) {
            step = history.pop() ?? 'scope';
            continue;
          }
          s.selectors = arr.map(k => `kind:${k}`);
        }
        history.push('narrow');
        step = 'language';
        continue;
      }

      // individual — language pre-filter then grouped picker
      {
        const indivLangOpts = buildLanguageOptions(visible);
        let pickerLanguage: string | undefined;

        if (indivLangOpts.length > 1) {
          const opts = [{ value: BACK, label: '← Back', hint: '' }, ...indivLangOpts];
          const langAnswer = await select({
            message: 'Narrow by language?  (filters the list below)',
            options: opts,
            initialValue: '',
          });
          if (isCancel(langAnswer)) {
            cancel('Install cancelled.');
            return null;
          }
          if (langAnswer === BACK) {
            step = history.pop() ?? 'scope';
            continue;
          }
          pickerLanguage = (langAnswer as string) || undefined;
        }

        const byLang = groupArtifactsByLanguage(visible, pickerLanguage);
        const total = Object.values(byLang).reduce((n, arr) => n + arr.length, 0);
        if (total === 0) {
          cancel('No artifacts match the selected language filter.');
          return null;
        }

        type PO = { value: string; label: string; hint: string };
        const groupedOpts: Record<string, PO[]> = {
          '⬆ Navigation': [{ value: BACK, label: '← Back', hint: '' }],
        };
        let firstValue: string | undefined;
        for (const [gKey, arts] of Object.entries(byLang)) {
          groupedOpts[gKey] = arts.map(a => {
            const val = `${a.kind}:${a.id}`;
            if (!firstValue) firstValue = val;
            return {
              value: val,
              label: `${a.id}  (${kindNoun(chosenTarget, a.kind)})`,
              hint: artifactHint(a),
            };
          });
        }

        const picked = await groupMultiselect({
          message: 'Select artifacts to install  (include "← Back" to return)',
          options: groupedOpts,
          required: false,
          ...(firstValue ? { cursorAt: firstValue } : {}),
        });
        if (isCancel(picked)) {
          cancel('Install cancelled.');
          return null;
        }
        const arr = picked as string[];
        if (arr.includes(BACK) || arr.length === 0) {
          step = history.pop() ?? 'scope';
          continue;
        }
        s.selectors = arr;
        history.push('narrow');
        step = 'deps'; // individual = explicit picks, no language filter needed
        continue;
      }
    }

    // ── language filter (all / kind scopes only) ───────────────────────────
    if (step === 'language') {
      const visible = getVisible();
      const subsetForLang: ResolvedArtifact[] =
        s.scope === 'kind'
          ? (() => {
              const kindSet = new Set(
                s.selectors!.map(sel => sel.replace('kind:', '') as ArtifactKind),
              );
              return visible.filter(a => kindSet.has(a.kind));
            })()
          : visible;

      const langOpts = buildLanguageOptions(subsetForLang);
      if (langOpts.length <= 1) {
        // Only one language or none — auto-skip (don't push to history)
        s.language = undefined;
        step = 'deps';
        continue;
      }

      const opts = [{ value: BACK, label: '← Back', hint: '' }, ...langOpts];
      const langAnswer = await select({
        message: 'Filter by language?',
        options: opts,
        initialValue: s.language ?? '',
      });
      if (isCancel(langAnswer)) {
        cancel('Install cancelled.');
        return null;
      }
      if (langAnswer === BACK) {
        step = history.pop() ?? 'narrow';
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
      note(
        [
          `Target:       ${s.target}`,
          `Scope:        ${s.selectors!.join(' ')}`,
          ...(s.language ? [`Language:     ${s.language}`] : []),
          `Overwrite:    ${s.overwrite ? 'yes' : 'no (warn on conflict)'}`,
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
      };
    }

    // Unreachable
    return null;
  }
}

// ─── new artifact wizard ──────────────────────────────────────────────────────

/** Return value of `runNewWizard` — maps 1:1 to `sigil new` CLI flags. */
export interface NewWizardResult {
  kind: string;
  name: string;
  title: string;
  description: string;
  language?: string;
  platforms?: string[];
}

/**
 * Interactive guided wizard for `sigil new`.
 *
 * Steps (with back navigation at every selectable step):
 *   0: kind
 *   1: platforms  (auto-skipped when only 1 target supports the chosen kind)
 *   2: language   (auto-skipped when ≤1 option is available)
 *   3: name / title / description  (text group — back is via the confirm menu)
 *   4: confirm    (select with "Create" / "← Edit fields" / "← Back" / "Cancel")
 *
 * History stack: push step ID when LEAVING it (forward). Back pops the stack, so
 * auto-skipped steps are never in history and back correctly skips over them.
 * Text prompts show their previous answer as `initialValue` when re-entered.
 *
 * Caller must check `isInteractiveTTY()` before invoking.
 * Returns `null` when the user cancels at any step.
 */
export async function runNewWizard(
  catalog: ResolvedCatalog,
  targets: Target[],
): Promise<NewWizardResult | null> {
  intro('✨  sigil new  —  scaffold a new catalog artifact');

  // ── Mutable state ─────────────────────────────────────────────────────────
  type NState = {
    kind?: string;
    platforms?: string[];
    language?: string;
    name?: string;
    title?: string;
    description?: string;
  };
  const s: NState = {};

  /**
   * History stack: each entry is the step ID that was COMPLETED and LEFT (forward).
   * Back pops the last entry to return to it. Auto-skipped steps are never pushed.
   * Step 3 (text group) is NOT pushed — it is entered directly from the confirm menu.
   */
  const history: number[] = [];
  let step = 0;

  while (true) {
    // ── 0: Kind ─────────────────────────────────────────────────────────────
    if (step === 0) {
      log.info('Note: workflow artifacts are not yet scaffoldable via `new`.');
      const answer = await select({
        message: 'What kind of artifact?',
        options: [
          // No ← Back — this is the first step
          {
            value: 'skill',
            label: 'Skill',
            hint: 'procedural how-to workflow — invoked when the user asks for guidance',
          },
          { value: 'agent', label: 'Agent', hint: 'persistent AI persona with an ongoing role' },
          {
            value: 'rule',
            label: 'Rule',
            hint: 'always-on coding convention (style, naming, patterns)',
          },
          {
            value: 'prompt',
            label: 'Prompt',
            hint: 'parameterised one-shot command (language-agnostic)',
          },
        ],
        ...(s.kind ? { initialValue: s.kind } : {}),
      });
      if (isCancel(answer)) {
        cancel('Scaffold cancelled.');
        return null;
      }
      s.kind = answer as string;
      history.push(0);
      step = 1;
      continue;
    }

    // ── 1: Platforms (auto-skipped when only 1 target supports this kind) ───
    if (step === 1) {
      const supporting = kindSupportingTargets(s.kind!, targets);
      if (supporting.length <= 1) {
        // Auto-skip: only one platform available — no choice needed
        s.platforms = undefined;
        step = 2;
        continue;
      }
      note(
        'By default, this artifact propagates to EVERY AI that supports its kind (DRY rule).\n' +
          'Deselect AIs to restrict. You can always widen later with:\n' +
          '  sigil retarget <id> --add <platform>',
        'Platform targeting',
      );
      const platformOpts = [
        { value: BACK, label: '← Back', hint: 'return to kind selection' },
        ...supporting.map(t => ({
          value: t.name,
          label: TARGET_META[t.name]?.label ?? t.name,
          hint: TARGET_META[t.name]?.hint ?? '',
        })),
      ];
      const pickedPlatforms = await multiselect({
        message: 'Which AIs should this artifact propagate to?  (include "← Back" to return)',
        options: platformOpts,
        initialValues: s.platforms ?? supporting.map(t => t.name),
        required: false,
      });
      if (isCancel(pickedPlatforms)) {
        cancel('Scaffold cancelled.');
        return null;
      }
      const arr = pickedPlatforms as string[];
      if (arr.includes(BACK) || arr.length === 0) {
        step = history.pop() ?? 0;
        continue;
      }
      const { platforms: normalized } = setPlatforms(
        s.kind!,
        arr.filter(v => v !== BACK),
        targets,
      );
      s.platforms = normalized;
      history.push(1);
      step = 2;
      continue;
    }

    // ── 2: Language ──────────────────────────────────────────────────────────
    if (step === 2) {
      const isSkill = s.kind === 'skill';
      const langOpts = buildLanguageOptions(catalog.artifacts);
      // Skills must belong to a specific language (shared skills don't exist)
      const filtered = isSkill ? langOpts.filter(o => o.value !== '') : langOpts;

      if (filtered.length === 0) {
        // No languages defined in catalog yet — auto-skip
        s.language = undefined;
        step = 3;
        continue;
      }

      const opts = [{ value: BACK, label: '← Back', hint: '' }, ...filtered];
      const langAnswer = await select({
        message: isSkill
          ? 'Language?  (skills must belong to a specific language)'
          : 'Language?  (choose a language or "All languages / shared")',
        options: opts,
        initialValue: s.language ?? filtered[0].value,
      });
      if (isCancel(langAnswer)) {
        cancel('Scaffold cancelled.');
        return null;
      }
      if (langAnswer === BACK) {
        step = history.pop() ?? 0;
        continue;
      }
      s.language = (langAnswer as string) || undefined;
      history.push(2);
      step = 3;
      continue;
    }

    // ── 3: Name / Title / Description (text group — no back within this group) ─
    if (step === 3) {
      const isKebabCase = (v: string) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(v);

      const nameAnswer = await text({
        message: 'Artifact name  (kebab-case, e.g. ef-core-migrations)',
        placeholder: `new-${s.kind}`,
        initialValue: s.name ?? '',
        validate(v) {
          const trimmed = (v ?? '').trim();
          if (!trimmed) return 'Name is required.';
          if (!isKebabCase(trimmed))
            return 'Name must be kebab-case: lowercase letters, digits, hyphens only.';
        },
      });
      if (isCancel(nameAnswer)) {
        cancel('Scaffold cancelled.');
        return null;
      }
      s.name = (nameAnswer as string).trim();

      const titleDefault = s.name.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      const titleAnswer = await text({
        message: 'Title  (human-readable, e.g. "EF Core Migrations")',
        placeholder: titleDefault,
        initialValue: s.title ?? '',
      });
      if (isCancel(titleAnswer)) {
        cancel('Scaffold cancelled.');
        return null;
      }
      s.title = ((titleAnswer as string) || '').trim() || titleDefault;

      const descAnswer = await text({
        message: 'Description  (one-liner for catalog listings)',
        placeholder: `${s.title} — TODO`,
        initialValue: s.description ?? '',
      });
      if (isCancel(descAnswer)) {
        cancel('Scaffold cancelled.');
        return null;
      }
      s.description = ((descAnswer as string) || '').trim() || `TODO — ${s.name} description.`;

      // Step 3 is NOT pushed to history (it is re-entered from the confirm menu)
      step = 4;
      continue;
    }

    // ── 4: Confirm ───────────────────────────────────────────────────────────
    if (step === 4) {
      const idPrefix = s.language ?? 'shared';
      const id = `${idPrefix}/${s.name}`;
      const platformSummary = s.platforms
        ? s.platforms.join(', ')
        : 'all supporting AIs (DRY default)';
      note(
        [
          `Kind:         ${s.kind}`,
          `ID:           ${id}`,
          `Title:        ${s.title}`,
          `Description:  ${s.description}`,
          `Platforms:    ${platformSummary}`,
        ].join('\n'),
        'New artifact summary',
      );

      const answer = await select({
        message: 'Ready to create?',
        options: [
          { value: 'create', label: 'Create this artifact', hint: '' },
          {
            value: 'editFields',
            label: '← Edit name / title / description',
            hint: 're-enter the text fields (previous answers pre-filled)',
          },
          {
            value: 'backMore',
            label: '← Back to language / platform',
            hint: 'return to an earlier selection step',
          },
          { value: 'cancel', label: 'Cancel', hint: '' },
        ],
      });
      if (isCancel(answer) || answer === 'cancel') {
        cancel('Scaffold cancelled.');
        return null;
      }
      if (answer === 'create') {
        outro('Creating artifact…');
        return {
          kind: s.kind!,
          name: s.name!,
          title: s.title!,
          description: s.description!,
          language: s.language,
          platforms: s.platforms,
        };
      }
      if (answer === 'editFields') {
        // Re-enter step 3; text prompts pre-fill from s.name/s.title/s.description
        step = 3;
        continue;
      }
      if (answer === 'backMore') {
        // Go to the last pushed selection step (2, 1, or 0)
        const prev = history.pop();
        step = prev ?? 0;
        continue;
      }
    }

    // Unreachable
    return null;
  }
}

/**
 * Builds a copy-pasteable `sigil new … --yes` command string from a
 * wizard result (or equivalent set of flags).
 * Omits --language when shared; omits --platforms when unrestricted (DRY default).
 */
export function buildEquivalentNewCommand(result: {
  kind: string;
  name: string;
  language?: string;
  platforms?: string[];
}): string {
  const parts = ['sigil new', result.kind, `--name ${result.name}`];
  if (result.language) parts.push(`--language ${result.language}`);
  if (result.platforms && result.platforms.length > 0) {
    parts.push(`--platforms ${result.platforms.join(',')}`);
  }
  parts.push('--yes');
  return parts.join(' ');
}

// ─── edit artifact wizard ─────────────────────────────────────────────────────

/** Fields that `edit` can update interactively (metadata only). */
export interface EditWizardResult {
  title: string;
  description: string;
  tags: string[];
}

/**
 * Interactive metadata editor for `sigil edit <id>`.
 * Prefills each prompt with the current frontmatter value.
 * Returns null when the user cancels.
 */
export async function runEditWizard(artifact: Artifact): Promise<EditWizardResult | null> {
  const fm = artifact.frontmatter as Record<string, unknown>;
  const currentTitle = (fm.title as string | undefined) ?? '';
  const currentDesc = (fm.description as string | undefined) ?? '';
  const currentTags = Array.isArray(fm.tags) ? (fm.tags as string[]).join(', ') : '';

  intro(`✏️  sigil edit  —  ${artifact.id}`);

  note(
    'Only metadata fields (title, description, tags) can be changed here.\n' +
      'To change platforms, use: sigil retarget ' +
      artifact.id +
      ' --to <platforms>\n' +
      'To edit the body, open the file directly and run: sigil check ' +
      artifact.id,
    'What edit covers',
  );

  const titleAnswer = await text({
    message: 'Title',
    initialValue: currentTitle,
    validate(v) {
      if (!(v ?? '').trim()) return 'Title is required.';
    },
  });
  if (isCancel(titleAnswer)) {
    cancel('Edit cancelled.');
    return null;
  }
  const title = (titleAnswer as string).trim();

  const descAnswer = await text({
    message: 'Description  (one-liner for catalog listings)',
    initialValue: currentDesc,
    validate(v) {
      if (!(v ?? '').trim()) return 'Description is required.';
    },
  });
  if (isCancel(descAnswer)) {
    cancel('Edit cancelled.');
    return null;
  }
  const description = (descAnswer as string).trim();

  const tagsAnswer = await text({
    message: 'Tags  (comma-separated, or leave blank)',
    initialValue: currentTags,
  });
  if (isCancel(tagsAnswer)) {
    cancel('Edit cancelled.');
    return null;
  }
  const tags = (tagsAnswer as string)
    .split(',')
    .map(t => t.trim())
    .filter(Boolean);

  const proceed = await confirm({
    message: `Save changes to ${artifact.id}?`,
    initialValue: true,
  });
  if (isCancel(proceed) || !proceed) {
    cancel('Edit cancelled.');
    return null;
  }

  outro('Saving…');
  return { title, description, tags };
}

// ── Exported helpers ──────────────────────────────────────────────────────────

/**
 * Builds a copy-pasteable `sigil add …` command string from the effective
 * install options. Includes `--yes` so it runs non-interactively.
 * Used in both the wizard plan-box and the end-of-install summary in cli.ts.
 */
export function buildEquivalentCommand(opts: {
  selectors: string[];
  target: string;
  language?: string;
  kinds?: string[];
  exclude?: string[];
  includeDeps: boolean;
  overwrite: boolean;
}): string {
  const parts = ['sigil add', ...opts.selectors, `--target ${opts.target}`];
  if (opts.language) parts.push(`--language ${opts.language}`);
  if (opts.kinds && opts.kinds.length > 0) parts.push(`--kind ${opts.kinds.join(',')}`);
  if (opts.exclude && opts.exclude.length > 0) parts.push(`--exclude ${opts.exclude.join(',')}`);
  if (!opts.includeDeps) parts.push('--no-deps');
  if (opts.overwrite) parts.push('--overwrite');
  parts.push('--yes');
  return parts.join(' ');
}

/** Print a formatted conflict advisory after a partial install. */
export function printConflictAdvice(conflicting: string[], targetName: string): void {
  log.warn(
    `${conflicting.length} file(s) already exist and were NOT overwritten:\n` +
      conflicting.map(f => `  ${f}`).join('\n') +
      '\n' +
      `Re-run with --overwrite to replace them, or use --dry-run to preview first.`,
  );
}

/** Print a formatted skipped-kinds advisory using the target's native vocabulary. */
export function printSkippedAdvice(
  skipped: Array<{ id: string; kind: string; reason: string }>,
  target?: Target,
): void {
  if (skipped.length === 0) return;
  log.warn(
    `${skipped.length} artifact(s) skipped (not supported by this target):\n` +
      skipped.map(s => `  ${s.id} (${kindNoun(target, s.kind)}): ${s.reason}`).join('\n'),
  );
}

/**
 * Prints the equivalent CLI command once, at the very end of the install flow.
 * In an interactive TTY it renders as a styled clack note box; in CI/pipe it is plain text.
 */
export function printEquivalentCommand(cmd: string, fancy: boolean): void {
  if (fancy) {
    note(cmd, 'Repeat non-interactively');
  } else {
    console.log('\nRepeat non-interactively:\n  ' + cmd);
  }
}
