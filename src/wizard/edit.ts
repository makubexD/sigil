/**
 * Interactive metadata editor for `sigil edit <id>`.
 *
 * Prefills each prompt with the current frontmatter value.
 * Returns null when the user cancels.
 */
import { intro, outro, text, confirm, note, cancel, isCancel } from '@clack/prompts';
import type { Artifact } from '../types';
import type { EditWizardResult } from './types';

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
      return undefined;
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
      return undefined;
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
