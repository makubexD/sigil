import { text, select, note, outro, isCancel, cancel } from '@clack/prompts';
import type { WizardStep, StepOutcome } from '../../engine';
import type { NewWizardState } from './state';

/** Returns true when `v` is kebab-case (lowercase letters, digits, hyphens). */
function isKebabCase(v: string): boolean {
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(v);
}

/** Prompts for the artifact name; sets `s.name` on success. */
async function promptName(s: NewWizardState): Promise<'ok' | 'cancel'> {
  const nameAnswer = await text({
    message: 'Artifact name  (kebab-case, e.g. ef-core-migrations)',
    placeholder: `new-${s.kind}`,
    initialValue: s.name ?? '',
    validate(v) {
      const trimmed = (v ?? '').trim();
      if (!trimmed) return 'Name is required.';
      if (!isKebabCase(trimmed))
        return 'Name must be kebab-case: lowercase letters, digits, hyphens only.';
      return undefined;
    },
  });
  if (isCancel(nameAnswer)) return 'cancel';
  s.name = (nameAnswer as string).trim();
  return 'ok';
}

/** Prompts for the title (defaulting to a Title-Cased form of the name); sets `s.title`. */
async function promptTitle(s: NewWizardState): Promise<'ok' | 'cancel'> {
  const titleDefault = s.name!.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const titleAnswer = await text({
    message: 'Title  (human-readable, e.g. "EF Core Migrations")',
    placeholder: titleDefault,
    initialValue: s.title ?? '',
  });
  if (isCancel(titleAnswer)) return 'cancel';
  s.title = ((titleAnswer as string) || '').trim() || titleDefault;
  return 'ok';
}

/** Prompts for the description; sets `s.description`. */
async function promptDescription(s: NewWizardState): Promise<'ok' | 'cancel'> {
  const descAnswer = await text({
    message: 'Description  (one-liner for catalog listings)',
    placeholder: `${s.title} — TODO`,
    initialValue: s.description ?? '',
  });
  if (isCancel(descAnswer)) return 'cancel';
  s.description = ((descAnswer as string) || '').trim() || `TODO — ${s.name} description.`;
  return 'ok';
}

async function promptFields(s: NewWizardState): Promise<'ok' | 'cancel'> {
  if ((await promptName(s)) === 'cancel') return 'cancel';
  if ((await promptTitle(s)) === 'cancel') return 'cancel';
  return promptDescription(s);
}

/** Shows the "New artifact summary" note above the "Ready to create?" prompt. */
function showFieldsSummary(s: NewWizardState): void {
  const id = `${s.language ?? 'shared'}/${s.name}`;
  const platformSummary = s.platforms ? s.platforms.join(', ') : 'all supporting AIs (DRY default)';
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
}

/** Prompts "Ready to create?" and returns the raw answer value, or 'cancel' on Esc/Ctrl+C. */
async function promptReadyToCreate(): Promise<string> {
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
  return isCancel(answer) ? 'cancel' : (answer as string);
}

/** Maps the confirm-menu answer to a StepOutcome, or 'editFields' to loop and re-prompt. */
function resolveConfirmAnswer(answer: string): StepOutcome | 'editFields' {
  if (answer === 'cancel') {
    cancel('Scaffold cancelled.');
    return 'cancel';
  }
  if (answer === 'create') {
    outro('Creating artifact…');
    return 'next';
  }
  if (answer === 'editFields') return 'editFields';
  // 'backMore' — skip past this step entirely, back to whatever ran before it.
  return 'back';
}

/**
 * Combined name/title/description entry + confirm menu.
 *
 * Registered as ONE step because the original wizard's text-entry step never
 * enters history — "← Edit fields" re-runs it directly (prefilled) without any
 * history interaction, and "← Back" from confirm must skip over it entirely to
 * land on whatever ran before it (language/platforms/kind). Modeling both as a
 * single step's internal loop reproduces that exactly: the engine only ever
 * sees this step return 'next' (create), 'back' (skip past fields to the
 * previous real step), or 'cancel' — never anything for the internal
 * fields ↔ confirm loop itself.
 */
export const fieldsConfirmStep: WizardStep<NewWizardState> = {
  id: 'fieldsConfirm',
  async run(s): Promise<StepOutcome> {
    while (true) {
      const fieldsResult = await promptFields(s);
      if (fieldsResult === 'cancel') {
        cancel('Scaffold cancelled.');
        return 'cancel';
      }

      showFieldsSummary(s);
      const outcome = resolveConfirmAnswer(await promptReadyToCreate());
      if (outcome === 'editFields') continue; // re-prompt fields, prefilled from s.name/s.title/s.description
      return outcome;
    }
  },
};
