/**
 * Interactive metadata editor for `sigil edit <id>`.
 *
 * Prefills each prompt with the current frontmatter value.
 * Returns null when the user cancels.
 */
import { text, confirm, note, isCancel } from '@clack/prompts';
import { intro, outro, cancel } from './frame';
import type { Artifact } from '../types';
import type { EditWizardResult } from './types';

const CANCEL_MESSAGE = 'Edit cancelled.';

/** Prompts for a required text field; returns null (having called cancel()) if the user cancels. */
async function promptRequiredText(message: string, initialValue: string): Promise<string | null> {
  const answer = await text({
    message,
    initialValue,
    validate(v) {
      return (v ?? '').trim() ? undefined : `${message.split(' ')[0]} is required.`;
    },
  });
  if (isCancel(answer)) {
    cancel(CANCEL_MESSAGE);
    return null;
  }
  return (answer as string).trim();
}

/** Prompts for the optional comma-separated tags field. */
async function promptTags(initialValue: string): Promise<string[] | null> {
  const answer = await text({ message: 'Tags  (comma-separated, or leave blank)', initialValue });
  if (isCancel(answer)) {
    cancel(CANCEL_MESSAGE);
    return null;
  }
  return (answer as string)
    .split(',')
    .map(t => t.trim())
    .filter(Boolean);
}

/** Confirms the save; returns false (having called cancel()) if declined or cancelled. */
async function confirmSave(artifactId: string): Promise<boolean> {
  const proceed = await confirm({ message: `Save changes to ${artifactId}?`, initialValue: true });
  if (isCancel(proceed) || !proceed) {
    cancel(CANCEL_MESSAGE);
    return false;
  }
  return true;
}

function showEditIntro(artifact: Artifact): void {
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
}

export async function runEditWizard(artifact: Artifact): Promise<EditWizardResult | null> {
  const fm = artifact.frontmatter as Record<string, unknown>;
  const currentTags = Array.isArray(fm.tags) ? (fm.tags as string[]).join(', ') : '';

  showEditIntro(artifact);

  const title = await promptRequiredText('Title', (fm.title as string | undefined) ?? '');
  if (title === null) return null;

  const description = await promptRequiredText(
    'Description  (one-liner for catalog listings)',
    (fm.description as string | undefined) ?? '',
  );
  if (description === null) return null;

  const tags = await promptTags(currentTags);
  if (tags === null) return null;

  if (!(await confirmSave(artifact.id))) return null;

  outro('Saving…');
  return { title, description, tags };
}
