/**
 * runNewWizard — interactive wizard for `sigil new`.
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
import { intro, outro, select, multiselect, text, note, log, cancel, isCancel } from '@clack/prompts';
import type { ResolvedCatalog, Target } from '../types';
import { buildLanguageOptions } from '../select';
import { kindSupportingTargets, setPlatforms } from '../authoring/platforms';
import { TARGET_META } from './types';
import type { NewWizardResult } from './types';

/** Sentinel value used to signal "go back one step" in wizard prompts. */
const BACK = '__back__';

export async function runNewWizard(
  catalog: ResolvedCatalog,
  targets: Target[],
): Promise<NewWizardResult | null> {
  intro('✨  sigil new  —  scaffold a new catalog artifact');

  // ── Mutable state ─────────────────────────────────────────────────────────
  type NState = {
    kind?: string;
    platforms?: string[] | undefined;
    language?: string | undefined;
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
        initialValues: s.platforms ?? [],
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
        initialValue: s.language ?? filtered[0]?.value ?? '',
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
  language?: string | undefined;
  platforms?: string[] | undefined;
}): string {
  const parts = ['sigil new', result.kind, `--name ${result.name}`];
  if (result.language) parts.push(`--language ${result.language}`);
  if (result.platforms && result.platforms.length > 0) {
    parts.push(`--platforms ${result.platforms.join(',')}`);
  }
  parts.push('--yes');
  return parts.join(' ');
}
