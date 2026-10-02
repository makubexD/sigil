/**
 * `sigil add` — resolves the effective selectors/target/flags for the plan phase,
 * running the interactive wizard when no selector was given. Split out of plan.ts
 * to keep that file under the repo's own module-size threshold.
 *
 * @module
 */
import { isInteractiveTTY, runWizardAt, type FixedTarget, type WizardResult } from '../../wizard';
import { SigilError } from '../../errors';
import { detectProjectTarget } from '../../cli-helpers';
import { detectedTargetsIn } from '../../project-context';
import { getTarget } from '../../targets';
import type { ConfigScope, ResolvedCatalog, Target } from '../../types';
import type { AddOpts } from './index';

export interface ResolvedAddInputs {
  selectors: string[];
  target: string | undefined;
  includeDeps: boolean;
  overwrite: boolean;
  language: string | undefined;
  scope: ConfigScope;
}

/** Throws the "no selectors + not a TTY" guidance error. */
function throwNotInteractiveError(): never {
  throw new SigilError('No selectors provided and stdin/stdout is not an interactive terminal.', {
    hint:
      '  Provide at least one selector (e.g. `add all` or `add skill:csharp/cs-generate-tests`)\n' +
      '  or use --yes to confirm non-interactive mode.\n\n' +
      '  Available selectors:\n' +
      '    all                         install the full catalog\n' +
      '    pack:<name>                 install a named pack\n' +
      '    kind:<kind>                 install all of a kind (skill/agent/rule/prompt)\n' +
      '    <kind>:<id>                 install a specific artifact\n\n' +
      '  Run `sigil list` to browse available artifacts.',
  });
}

/** Maps a completed WizardResult to `ResolvedAddInputs`. */
function fromWizardResult(
  wizardResult: WizardResult,
  opts: AddOpts,
  baseScope: ConfigScope,
): ResolvedAddInputs {
  return {
    selectors: wizardResult.selectors,
    target: wizardResult.target,
    includeDeps: wizardResult.includeDeps,
    overwrite: wizardResult.overwrite,
    language: wizardResult.language ?? opts.language,
    scope: (wizardResult.configScope as ConfigScope | undefined) ?? baseScope,
  };
}

const nameOf = (target: Target): string => target.displayName ?? target.name;

/**
 * The tool the wizard should not ask about: the one named with `--target`, else the only one set up
 * in this folder. An unknown or non-installable `--target` fails here, as it does without the wizard.
 */
function fixedTargetFor(opts: AddOpts): FixedTarget | undefined {
  if (opts.target !== undefined) {
    const target = getTarget(opts.target);
    if (!target.scaffold) {
      throw new SigilError(`Target '${opts.target}' does not support the add command.`);
    }
    return { name: target.name, notice: `Installing for ${nameOf(target)} (--target).` };
  }
  const found = detectedTargetsIn(opts.projectDir)
    .map(getTarget)
    .filter(t => t.scaffold);
  const [only] = found;
  if (found.length !== 1 || !only) return undefined;
  return {
    name: only.name,
    notice:
      `Installing for ${nameOf(only)}, the tool set up in this folder. ` +
      'For another tool, set it up first (sigil init) or run sigil add --target <name>.',
  };
}

/** Runs the interactive wizard and maps its result to `ResolvedAddInputs`, or null on cancel. */
async function resolveViaWizard(
  opts: AddOpts,
  resolved: ResolvedCatalog,
  packs: Parameters<typeof runWizardAt>[1],
  baseScope: ConfigScope,
): Promise<ResolvedAddInputs | null> {
  if (!isInteractiveTTY()) throwNotInteractiveError();

  const detectedTarget = detectProjectTarget(opts.projectDir, { verbose: false });
  const wizardResult: WizardResult | null = await runWizardAt(resolved, packs, {
    detectedTarget,
    projectDir: opts.projectDir,
    fixed: fixedTargetFor(opts),
  });
  return wizardResult ? fromWizardResult(wizardResult, opts, baseScope) : null;
}

/** Resolves the effective config scope from CLI flags, before the wizard may override it. */
function resolveBaseScope(opts: AddOpts): ConfigScope {
  if (opts.settingsLocal) return 'local';
  return (opts.scope as ConfigScope | undefined) ?? 'project';
}

/** Resolves the effective selectors/target/flags, running the wizard when needed. */
export async function resolveInputs(
  selectors: string[],
  opts: AddOpts,
  resolved: ResolvedCatalog,
  packs: Parameters<typeof runWizardAt>[1],
): Promise<ResolvedAddInputs | null> {
  const needsWizard = (selectors.length === 0 || opts.interactive) && !opts.yes;
  const baseScope = resolveBaseScope(opts);

  if (!needsWizard) {
    return {
      selectors,
      target: opts.target,
      includeDeps: opts.deps !== false,
      overwrite: opts.overwrite,
      language: opts.language,
      scope: baseScope,
    };
  }

  return resolveViaWizard(opts, resolved, packs, baseScope);
}
