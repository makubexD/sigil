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
import { artifactLabel, artifactHint, resolveSelection, computeClosure } from './select';
import type { ClosurePreview } from './select';

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
    { value: 'all',        label: 'Everything',       hint: 'full catalog — all skills, agents, rules, prompts' },
    ...(packs.length > 0
      ? [{ value: 'pack' as ScopeChoice, label: 'By pack', hint: packOptions.map(p => p.label).join(', ') }]
      : []),
    { value: 'kind',       label: 'By kind',          hint: 'e.g. all skills, or all agents, rules, prompts' },
    { value: 'individual', label: 'Pick individually', hint: 'choose exact artifacts from the full list' },
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

  // ── Step 3b: language filter (only for scopes that span all languages) ───
  // For 'pack' (language already implied) and 'individual' (explicit picks), skip.
  let language: string | undefined;
  if (scope === 'all' || scope === 'kind') {
    // Collect distinct languages present in the catalog (excluding shared/undefined)
    const catalogLanguages = [
      ...new Set(
        catalog.artifacts
          .map(a => a.frontmatter.language as string | undefined)
          .filter((l): l is string => Boolean(l))
          .sort(),
      ),
    ];

    if (catalogLanguages.length > 0) {
      const langOptions = [
        { value: '',  label: 'All languages', hint: catalogLanguages.join(', ') },
        ...catalogLanguages.map(l => {
          const count = catalog.artifacts.filter(a => a.frontmatter.language === l).length;
          return { value: l, label: l, hint: `${count} artifact${count !== 1 ? 's' : ''}` };
        }),
      ];

      const langAnswer = await select({
        message: 'Filter by language?',
        options: langOptions,
        initialValue: '',
      });
      if (isCancel(langAnswer)) { cancel('Install cancelled.'); return null; }
      language = (langAnswer as string) || undefined;
    }
  }

  // ── Pre-compute dependency closure ────────────────────────────────────────
  // Derive the primary IDs from the selectors + language so we can show concrete
  // dependency info in step 4 and the plan box. Empty supportedKinds = preview mode
  // (all kinds treated as supported; the real install still applies the target filter).
  const { ids: primaryIds } = resolveSelection(selectors, { language }, catalog, packs, []);
  const closurePreview: ClosurePreview = computeClosure(primaryIds, catalog);

  // ── Step 4: dependency closure ────────────────────────────────────────────
  {
    const deps = closurePreview.dependencies;
    let depNoteBody: string;
    if (deps.length > 0) {
      // Name each dependency and which skill's `uses:` frontmatter declared it.
      const lines = deps.map(({ artifact: a, via }) => {
        const title = (a.frontmatter.title as string | undefined)
          ?? (a.frontmatter.description as string | undefined)
          ?? a.id;
        // Compact via: show up to 2 skills, then "+N more"
        const viaDisplay = via.length <= 2 ? via.join(', ') : `${via[0]} +${via.length - 1} more`;
        return `  ${a.kind.padEnd(5)}  ${a.id}  — ${title}  (via ${viaDisplay})`;
      });
      depNoteBody =
        "The skill author recommends installing these alongside it\n" +
        "(declared in the skill's `uses:` frontmatter — not a hard requirement):\n" +
        lines.join('\n') +
        '\n\nYes installs these too. No installs only your selection (--no-deps).';
    } else {
      depNoteBody = 'Your current selection has no uses: dependencies — only your selected artifacts will be written.';
    }
    note(depNoteBody, 'About dependencies');
  }
  const includeDepsAnswer = await confirm({
    message: 'Include dependencies?',
    initialValue: true,
  });
  if (isCancel(includeDepsAnswer)) { cancel('Install cancelled.'); return null; }
  const includeDeps = includeDepsAnswer as boolean;

  // ── Step 5: conflict preview ───────────────────────────────────────────────
  // (Actual file preview happens in cli.ts after scaffold; we just ask about overwrite here)
  note(
    'No keeps your existing files and lists any conflicts at the end.\n' +
    'Yes replaces them in place — equivalent to --overwrite.',
    'About conflicts',
  );
  const overwriteAnswer = await confirm({
    message: 'Overwrite existing files if conflicts are found?',
    initialValue: false,
  });
  if (isCancel(overwriteAnswer)) { cancel('Install cancelled.'); return null; }
  const overwrite = overwriteAnswer as boolean;

  // ── Summary before proceeding ─────────────────────────────────────────────
  // Build the artifact preview list (picks + deps, tagged)
  const artifactLines: string[] = [];
  for (const a of closurePreview.primary) {
    artifactLines.push(`  ${a.kind.padEnd(5)}  ${a.id}  (your pick)`);
  }
  if (includeDeps) {
    for (const { artifact: a, via } of closurePreview.dependencies) {
      const viaDisplay = via.length <= 2 ? via.join(', ') : `${via[0]} +${via.length - 1} more`;
      artifactLines.push(`  ${a.kind.padEnd(5)}  ${a.id}  (dependency of ${viaDisplay})`);
    }
  } else if (closurePreview.dependencies.length > 0) {
    const n = closurePreview.dependencies.length;
    artifactLines.push(`  (${n} recommended dep${n !== 1 ? 's' : ''} excluded)`);
  }
  const artifactCount = closurePreview.primary.length + (includeDeps ? closurePreview.dependencies.length : 0);

  const summaryLines = [
    `Target:       ${target}`,
    `Scope:        ${selectors.join(' ')}`,
    ...(language ? [`Language:     ${language}`] : []),
    `Overwrite:    ${overwrite ? 'yes' : 'no (warn on conflict)'}`,
    '',
    `Will install ${artifactCount} artifact${artifactCount !== 1 ? 's' : ''}:`,
    ...artifactLines,
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
    language,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Builds a copy-pasteable `maku-catalog add …` command string from the effective
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
  const parts = ['maku-catalog add', ...opts.selectors, `--target ${opts.target}`];
  if (opts.language)                 parts.push(`--language ${opts.language}`);
  if (opts.kinds && opts.kinds.length > 0)    parts.push(`--kind ${opts.kinds.join(',')}`);
  if (opts.exclude && opts.exclude.length > 0) parts.push(`--exclude ${opts.exclude.join(',')}`);
  if (!opts.includeDeps)             parts.push('--no-deps');
  if (opts.overwrite)                parts.push('--overwrite');
  parts.push('--yes');
  return parts.join(' ');
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
