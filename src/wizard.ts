/**
 * Interactive guided installer for `maku-catalog add`.
 *
 * Triggered when `add` is run with no positional selectors in an interactive TTY.
 * Uses @clack/prompts for a clean, step-by-step experience.
 * Every answer maps 1:1 to a CLI flag so guided and scripted paths are equivalent.
 *
 * Guard: never runs when stdout/stdin is not a TTY (CI, pipes) — callers must check
 * isInteractiveTTY() before invoking runWizard().
 */

import { intro, outro, select, multiselect, confirm, note, log, isCancel, cancel } from '@clack/prompts';
import type { ResolvedCatalog, Pack, ArtifactKind } from './types';
import type { ResolvedArtifact } from './types';
import { artifactLabel, artifactHint } from './select';

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
}

/** Returns true when stdin and stdout are both interactive terminals. */
export function isInteractiveTTY(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

type ScopeChoice = 'all' | 'pack' | 'kind' | 'individual';

export async function runWizard(
  catalog: ResolvedCatalog,
  packs: Pack[],
  detectedTarget: string,
): Promise<WizardResult | null> {
  intro('📦  maku-catalog  —  interactive installer');

  // ── Step 1: target ────────────────────────────────────────────────────────
  const targetOptions = [
    { value: 'claude',  label: 'Claude Code',      hint: 'writes to .claude/' },
    { value: 'copilot', label: 'GitHub Copilot',   hint: 'writes to .github/' },
  ];

  const target = await select({
    message: `Install target  (detected: ${detectedTarget})`,
    options: targetOptions,
    initialValue: detectedTarget,
  });
  if (isCancel(target)) { cancel('Install cancelled.'); return null; }

  // ── Step 2: scope ─────────────────────────────────────────────────────────
  const packOptions = packs.map(p => ({
    value: `pack:${p.name}` as const,
    label: p.displayName,
    hint: (p.languages ?? []).join(', '),
  }));

  const scopeOptions: Array<{ value: ScopeChoice; label: string; hint: string }> = [
    { value: 'all',        label: 'Everything',                hint: 'full catalog' },
    ...(packs.length > 0
      ? [{ value: 'pack' as ScopeChoice, label: 'By pack',     hint: packOptions.map(p => p.label).join(', ') }]
      : []),
    { value: 'kind',       label: 'By kind',                   hint: 'skills, agents, rules, prompts' },
    { value: 'individual', label: 'Pick individually',          hint: 'choose from the full list' },
  ];

  const scope = await select({
    message: 'What would you like to install?',
    options: scopeOptions,
  });
  if (isCancel(scope)) { cancel('Install cancelled.'); return null; }

  // ── Step 3: narrow the selection ─────────────────────────────────────────
  let selectors: string[] = [];

  if (scope === 'all') {
    selectors = ['all'];

  } else if (scope === 'pack') {
    const pack = await select({
      message: 'Which pack?',
      options: packOptions,
    });
    if (isCancel(pack)) { cancel('Install cancelled.'); return null; }
    selectors = [pack as string];

  } else if (scope === 'kind') {
    const kinds = await multiselect({
      message: 'Which kinds?',
      options: [
        { value: 'skill',    label: 'Skills',    hint: 'procedural how-to guides for AI' },
        { value: 'agent',    label: 'Agents',    hint: 'specialised AI personas' },
        { value: 'rule',     label: 'Rules',     hint: 'coding style guidelines' },
        { value: 'prompt',   label: 'Prompts',   hint: 'reusable parameterised prompts' },
      ] as Array<{ value: string; label: string; hint: string }>,
      required: true,
    });
    if (isCancel(kinds)) { cancel('Install cancelled.'); return null; }
    selectors = (kinds as string[]).map(k => `kind:${k}`);

  } else {
    // individual — multiselect from full artifact list, grouped
    const kindOrder: ArtifactKind[] = ['skill', 'agent', 'rule', 'prompt', 'workflow'];
    const grouped = new Map<string, ResolvedArtifact[]>();
    for (const k of kindOrder) {
      const group = catalog.artifacts.filter(a => a.kind === k);
      if (group.length > 0) grouped.set(k, group);
    }

    type Choice = { value: string; label: string; hint: string };
    const options: Choice[] = [];
    for (const [kind, group] of grouped) {
      // @clack/prompts doesn't have group separators in multiselect; we fake it with labels
      for (const a of group) {
        options.push({
          value: `${a.kind}:${a.id}`,
          label: `${artifactLabel(a)}  (${kind})`,
          hint: artifactHint(a),
        });
      }
    }

    const picked = await multiselect({
      message: 'Select artifacts to install  (↑↓ navigate, space toggle, enter confirm)',
      options,
      required: true,
    });
    if (isCancel(picked)) { cancel('Install cancelled.'); return null; }
    selectors = picked as string[];
  }

  // ── Step 4: dependency closure ────────────────────────────────────────────
  const includeDepsAnswer = await confirm({
    message: 'Include dependencies? (rules and agents referenced by selected skills)',
    initialValue: true,
  });
  if (isCancel(includeDepsAnswer)) { cancel('Install cancelled.'); return null; }
  const includeDeps = includeDepsAnswer as boolean;

  // ── Step 5: conflict preview ───────────────────────────────────────────────
  // (Actual file preview happens in cli.ts after scaffold; we just ask about overwrite here)
  const overwriteAnswer = await confirm({
    message: 'Overwrite existing files if conflicts are found?',
    initialValue: false,
  });
  if (isCancel(overwriteAnswer)) { cancel('Install cancelled.'); return null; }
  const overwrite = overwriteAnswer as boolean;

  // ── Summary before proceeding ─────────────────────────────────────────────
  const summaryLines = [
    `Target:       ${target}`,
    `Scope:        ${selectors.join(' ')}`,
    `Dependencies: ${includeDeps ? 'yes' : 'no (--no-deps)'}`,
    `Overwrite:    ${overwrite ? 'yes' : 'no (warn on conflict)'}`,
  ];
  note(summaryLines.join('\n'), 'Install plan');

  const proceed = await confirm({ message: 'Proceed with install?' });
  if (isCancel(proceed) || !proceed) {
    cancel('Install cancelled.');
    return null;
  }

  outro('Running install…');

  return {
    target: target as string,
    selectors,
    includeDeps,
    overwrite,
  };
}

/** Print a formatted conflict advisory after a partial install. */
export function printConflictAdvice(conflicting: string[], targetName: string): void {
  log.warn(
    `${conflicting.length} file(s) already exist and were NOT overwritten:\n` +
    conflicting.map(f => `  ${f}`).join('\n') + '\n' +
    `Re-run with --overwrite to replace them, or use --dry-run to preview first.`,
  );
}

/** Print a formatted skipped-kinds advisory. */
export function printSkippedAdvice(skipped: Array<{ id: string; kind: string; reason: string }>): void {
  if (skipped.length === 0) return;
  log.warn(
    `${skipped.length} artifact(s) skipped (not supported by this target):\n` +
    skipped.map(s => `  ${s.id} (${s.kind}): ${s.reason}`).join('\n'),
  );
}
