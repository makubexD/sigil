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

import { intro, outro, select, multiselect, text, groupMultiselect, confirm, note, log, isCancel, cancel } from '@clack/prompts';
import type { ResolvedCatalog, Pack, ArtifactKind, Target } from './types';
import type { ResolvedArtifact } from './types';
import { artifactHint, resolveSelection, computeClosure, groupArtifactsByLanguage, availableKinds, buildLanguageOptions, kindNoun, kindPlural, kindHint } from './select';
import type { ClosurePreview } from './select';
import { getAllTargets } from './targets';
import { kindSupportingTargets, setPlatforms } from './authoring/platforms';

// ── Shared constants ──────────────────────────────────────────────────────────

/** Friendly labels and install-destination hints for known target names. */
export const TARGET_META: Record<string, { label: string; hint: string }> = {
  claude:  { label: 'Claude Code',    hint: 'writes to .claude/' },
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

export async function runWizard(
  catalog: ResolvedCatalog,
  packs: Pack[],
  detectedTarget: string,
): Promise<WizardResult | null> {
  intro('📦  maku-catalog  —  interactive installer');

  // ── Step 1: target — derived from the registered adapters that support `add` ──
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
    // Build kind options using the target's native vocabulary (falls back to neutral catalog names).
    // Default hints are a fallback when the target's vocabulary doesn't supply one.
    const KIND_DEFAULT_HINTS: Record<string, string> = {
      skill:    'procedural how-to guides for the AI',
      agent:    'specialised AI personas',
      rule:     'coding style guidelines',
      prompt:   'reusable parameterised prompts',
      workflow: 'multi-step automated workflows',
    };
    const presentKinds = availableKinds(visible);
    const kindOptions = presentKinds.map(k => {
      const count = visible.filter(a => a.kind === k).length;
      const plural = kindPlural(chosenTarget, k);
      const hint = kindHint(chosenTarget, k) ?? KIND_DEFAULT_HINTS[k] ?? '';
      return {
        value: k as string,
        label: plural,
        hint: `${count} artifact${count !== 1 ? 's' : ''}  — ${hint}`,
      };
    });

    let chosenKinds: string[];
    if (presentKinds.length === 1) {
      // Only one kind available — auto-select it to avoid a pointless one-option prompt.
      const k = presentKinds[0];
      log.info(`Only ${kindPlural(chosenTarget, k)} available for this target — selected automatically.`);
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
        return { value: val, label: `${a.id}  (${kindNoun(chosenTarget, a.kind)})`, hint: artifactHint(a) };
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
        return `  ${kindNoun(chosenTarget, a.kind).padEnd(12)}  ${a.id}  — ${title}  (via ${viaDisplay})`;
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
    artifactLines.push(`  ${kindNoun(chosenTarget, a.kind).padEnd(12)}  ${a.id}  (your pick)`);
  }
  if (includeDeps) {
    for (const { artifact: a, via } of closurePreview.dependencies) {
      const viaDisplay = via.length <= 2 ? via.join(', ') : `${via[0]} +${via.length - 1} more`;
      artifactLines.push(`  ${kindNoun(chosenTarget, a.kind).padEnd(12)}  ${a.id}  (dependency of ${viaDisplay})`);
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

// ─── new artifact wizard ──────────────────────────────────────────────────────

/** Return value of `runNewWizard` — maps 1:1 to `maku-catalog new` CLI flags. */
export interface NewWizardResult {
  kind: string;
  name: string;
  title: string;
  description: string;
  language?: string;
  platforms?: string[];
}

/**
 * Interactive guided wizard for `maku-catalog new`.
 *
 * Steps: kind → platforms (DRY default = all pre-checked) → language →
 *        name / title / description → confirm.
 *
 * Caller must check `isInteractiveTTY()` before invoking.
 * Returns `null` when the user cancels at any step.
 */
export async function runNewWizard(
  catalog: ResolvedCatalog,
  targets: Target[],
): Promise<NewWizardResult | null> {
  intro('✨  maku-catalog new  —  scaffold a new catalog artifact');

  // ── Step 1: Kind ─────────────────────────────────────────────────────────
  const kindOptions = [
    { value: 'skill',  label: 'Skill',  hint: 'procedural how-to workflow — invoked when the user asks for guidance' },
    { value: 'agent',  label: 'Agent',  hint: 'persistent AI persona with an ongoing role' },
    { value: 'rule',   label: 'Rule',   hint: 'always-on coding convention (style, naming, patterns)' },
    { value: 'prompt', label: 'Prompt', hint: 'parameterised one-shot command (language-agnostic)' },
    // workflow is not scaffoldable — shown as info below, not as a selectable option
  ];
  log.info('Note: workflow artifacts are not yet scaffoldable via `new`.');
  const kindAnswer = await select({
    message: 'What kind of artifact?',
    options: kindOptions,
  });
  if (isCancel(kindAnswer)) { cancel('Scaffold cancelled.'); return null; }
  const kind = kindAnswer as string;

  // ── Step 2: Platforms (pre-filtered to kind-supporting; all pre-checked = DRY default) ──
  const supporting = kindSupportingTargets(kind, targets);
  let platforms: string[] | undefined;
  if (supporting.length > 1) {
    const platformOptions = supporting.map(t => ({
      value: t.name,
      label: TARGET_META[t.name]?.label ?? t.name,
      hint:  TARGET_META[t.name]?.hint  ?? '',
    }));
    note(
      'By default, this artifact propagates to EVERY AI that supports its kind (DRY rule).\n' +
      'Deselect AIs to restrict. You can always widen later with:\n' +
      '  maku-catalog retarget <id> --add <platform>',
      'Platform targeting',
    );
    const pickedPlatforms = await multiselect({
      message: 'Which AIs should this artifact propagate to?',
      options: platformOptions,
      initialValues: supporting.map(t => t.name),
      required: true,
    });
    if (isCancel(pickedPlatforms)) { cancel('Scaffold cancelled.'); return null; }
    // Normalize: if all kind-supporting targets selected → undefined (DRY field removed)
    const { platforms: normalized } = setPlatforms(kind, pickedPlatforms as string[], targets);
    platforms = normalized;
  }
  // Only 1 supporting target: no choice needed — default to all (undefined)

  // ── Step 3: Language ─────────────────────────────────────────────────────
  const skillRequiresLanguage = kind === 'skill';
  const langOptions = buildLanguageOptions(catalog.artifacts);
  // For skills, filter out "All languages" (blank value = shared is not allowed)
  const filteredLangOptions = skillRequiresLanguage
    ? langOptions.filter(o => o.value !== '')
    : langOptions;

  let language: string | undefined;
  if (filteredLangOptions.length > 0) {
    const langAnswer = await select({
      message: skillRequiresLanguage
        ? 'Language?  (skills must belong to a specific language)'
        : 'Language?  (choose a language or "All languages / shared")',
      options: filteredLangOptions,
      initialValue: filteredLangOptions[0].value,
    });
    if (isCancel(langAnswer)) { cancel('Scaffold cancelled.'); return null; }
    language = (langAnswer as string) || undefined;
  }

  // ── Step 4: Name / Title / Description ────────────────────────────────────
  const isKebabCase = (s: string) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s);

  const nameAnswer = await text({
    message: 'Artifact name  (kebab-case, e.g. ef-core-migrations)',
    placeholder: `new-${kind}`,
    validate(v) {
      const s = (v ?? '').trim();
      if (!s) return 'Name is required.';
      if (!isKebabCase(s)) return 'Name must be kebab-case: lowercase letters, digits, hyphens only.';
    },
  });
  if (isCancel(nameAnswer)) { cancel('Scaffold cancelled.'); return null; }
  const name = (nameAnswer as string).trim();

  const titleDefault = name.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const titleAnswer = await text({
    message: 'Title  (human-readable, e.g. "EF Core Migrations")',
    placeholder: titleDefault,
  });
  if (isCancel(titleAnswer)) { cancel('Scaffold cancelled.'); return null; }
  const title = ((titleAnswer as string) || '').trim() || titleDefault;

  const descAnswer = await text({
    message: 'Description  (one-liner for catalog listings)',
    placeholder: `${title} — TODO`,
  });
  if (isCancel(descAnswer)) { cancel('Scaffold cancelled.'); return null; }
  const description = ((descAnswer as string) || '').trim() || `TODO — ${name} description.`;

  // ── Step 5: Confirm ──────────────────────────────────────────────────────
  const idPrefix = language ?? 'shared';
  const id = `${idPrefix}/${name}`;
  const platformSummary = platforms ? platforms.join(', ') : 'all supporting AIs (DRY default)';
  note(
    [
      `Kind:         ${kind}`,
      `ID:           ${id}`,
      `Title:        ${title}`,
      `Description:  ${description}`,
      `Platforms:    ${platformSummary}`,
    ].join('\n'),
    'New artifact summary',
  );

  const proceed = await confirm({ message: 'Create this artifact?' });
  if (isCancel(proceed) || !proceed) { cancel('Scaffold cancelled.'); return null; }

  outro('Creating artifact…');

  return { kind, name, title, description, language, platforms };
}

/**
 * Builds a copy-pasteable `maku-catalog new … --yes` command string from a
 * wizard result (or equivalent set of flags).
 * Omits --language when shared; omits --platforms when unrestricted (DRY default).
 */
export function buildEquivalentNewCommand(result: {
  kind: string;
  name: string;
  language?: string;
  platforms?: string[];
}): string {
  const parts = ['maku-catalog new', result.kind, `--name ${result.name}`];
  if (result.language) parts.push(`--language ${result.language}`);
  if (result.platforms && result.platforms.length > 0) {
    parts.push(`--platforms ${result.platforms.join(',')}`);
  }
  parts.push('--yes');
  return parts.join(' ');
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
