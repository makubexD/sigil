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

import { intro, outro, select, multiselect, groupMultiselect, confirm, note, log, isCancel, cancel } from '@clack/prompts';
import type { ResolvedCatalog, Pack, ArtifactKind } from './types';
import type { ResolvedArtifact } from './types';
import { artifactHint, resolveSelection, computeClosure, groupArtifactsByLanguage, availableKinds, buildLanguageOptions } from './select';
import type { ClosurePreview } from './select';
import { getAllTargets } from './targets';

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

  // ── Step 1: target — derived from the registered adapters that support `add` ──
  // Friendly labels/hints for known names; unknown names fall back to the adapter name.
  const TARGET_META: Record<string, { label: string; hint: string }> = {
    claude:  { label: 'Claude Code',    hint: 'writes to .claude/' },
    copilot: { label: 'GitHub Copilot', hint: 'writes to .github/' },
  };
  const scaffoldableTargets = getAllTargets().filter(t => Boolean(t.scaffold));
  const targetOptions = scaffoldableTargets.map(t => ({
    value: t.name,
    label: TARGET_META[t.name]?.label ?? t.name,
    hint:  TARGET_META[t.name]?.hint  ?? '',
  }));

  const target = await select({
    message: `Install target  (detected: ${detectedTarget})`,
    options: targetOptions,
    initialValue: detectedTarget,
  });
  if (isCancel(target)) { cancel('Install cancelled.'); return null; }

  // ── Compute visible artifact set (target's supportedKinds as a filter) ───
  // This is the "stopper": every subsequent step only shows what this target can install.
  const chosenTarget = scaffoldableTargets.find(t => t.name === (target as string));
  const supportedKindSet = new Set<string>(chosenTarget?.supportedKinds ?? []);
  const visible: ResolvedArtifact[] = supportedKindSet.size === 0
    ? catalog.artifacts
    : catalog.artifacts.filter(a => supportedKindSet.has(a.kind));

  if (visible.length === 0) {
    cancel(`No installable artifacts for target '${target as string}'.`);
    return null;
  }

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
    { value: 'individual', label: 'Pick individually', hint: 'narrow by language, then choose exact artifacts' },
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
    // Build kind options only from what's actually present in the visible (target-filtered) set.
    const KIND_META: Record<string, { label: string; hint: string }> = {
      skill:    { label: 'Skills',    hint: 'procedural how-to guides for AI' },
      agent:    { label: 'Agents',    hint: 'specialised AI personas' },
      rule:     { label: 'Rules',     hint: 'coding style guidelines' },
      prompt:   { label: 'Prompts',   hint: 'reusable parameterised prompts / commands' },
      workflow: { label: 'Workflows', hint: 'multi-step automated workflows' },
    };
    const presentKinds = availableKinds(visible);
    const kindOptions = presentKinds.map(k => {
      const count = visible.filter(a => a.kind === k).length;
      return {
        value: k as string,
        label: KIND_META[k]?.label ?? k,
        hint: `${count} artifact${count !== 1 ? 's' : ''}  — ${KIND_META[k]?.hint ?? ''}`,
      };
    });

    let chosenKinds: string[];
    if (presentKinds.length === 1) {
      // Only one kind available — auto-select it to avoid a pointless one-option prompt.
      const k = presentKinds[0];
      log.info(`Only ${KIND_META[k]?.label ?? k} available for this target — selected automatically.`);
      chosenKinds = [k];
    } else {
      const kinds = await multiselect({
        message: 'Which kinds?',
        options: kindOptions as Array<{ value: string; label: string; hint: string }>,
        required: true,
      });
      if (isCancel(kinds)) { cancel('Install cancelled.'); return null; }
      chosenKinds = kinds as string[];
    }
    selectors = chosenKinds.map(k => `kind:${k}`);

  } else {
    // individual — language pre-filter, then grouped multiselect by language

    // ── Step 3a: narrow by language (display-only; not saved to WizardResult.language) ─
    // Derived from the visible (target-filtered) set, not the whole catalog.
    let pickerLanguage: string | undefined;
    const indivLangOpts = buildLanguageOptions(visible);
    // Show only when ≥2 distinct languages are available — a 1-language set needs no filter.
    if (indivLangOpts.length > 1) {
      const langAnswer = await select({
        message: 'Narrow by language?  (filters the list below; you can still pick cross-language later)',
        options: indivLangOpts,
        initialValue: '',
      });
      if (isCancel(langAnswer)) { cancel('Install cancelled.'); return null; }
      pickerLanguage = (langAnswer as string) || undefined;
    }

    // ── Step 3b-individual: grouped picker (scoped to visible) ───────────────────────
    const byLang = groupArtifactsByLanguage(visible, pickerLanguage);

    // Stopper: pre-filter may have narrowed to nothing (shouldn't happen in practice,
    // but handle gracefully so the user gets a clear message rather than an empty picker).
    const totalFiltered = Object.values(byLang).reduce((n, arr) => n + arr.length, 0);
    if (totalFiltered === 0) {
      cancel('No artifacts match the selected language filter.');
      return null;
    }

    // Convert to groupMultiselect options (Record<groupKey, Option[]>)
    type PickerOption = { value: string; label: string; hint: string };
    const groupedOptions: Record<string, PickerOption[]> = {};
    let firstValue: string | undefined;
    for (const [groupKey, arts] of Object.entries(byLang)) {
      groupedOptions[groupKey] = arts.map(a => {
        const val = `${a.kind}:${a.id}`;
        if (firstValue === undefined) firstValue = val;
        return { value: val, label: `${a.id}  (${a.kind})`, hint: artifactHint(a) };
      });
    }

    const picked = await groupMultiselect({
      message: 'Select artifacts to install  (↑↓ navigate, space toggle, enter confirm)',
      options: groupedOptions,
      required: true,
      ...(firstValue !== undefined ? { cursorAt: firstValue } : {}),
    });
    if (isCancel(picked)) { cancel('Install cancelled.'); return null; }
    selectors = picked as string[];
  }

  // ── Step 3b: language filter (only for scopes that span all languages) ───
  // For 'pack' (language already implied) and 'individual' (explicit picks), skip.
  // Derives from the running artifact subset so counts and available languages are accurate.
  let language: string | undefined;
  if (scope === 'all' || scope === 'kind') {
    // For 'kind', further narrow to the chosen kinds so the language list reflects what remains.
    const subsetForLang: ResolvedArtifact[] = scope === 'kind'
      ? (() => {
          const chosenKindSet = new Set(selectors.map(s => s.replace('kind:', '') as ArtifactKind));
          return visible.filter(a => chosenKindSet.has(a.kind));
        })()
      : visible;

    const langOptions = buildLanguageOptions(subsetForLang);
    // Only show when ≥2 languages exist in the subset (>1 option beyond "All languages").
    if (langOptions.length > 1) {
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

// ── Exported helpers ──────────────────────────────────────────────────────────

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
