/**
 * The "Install plan" box shown before the final confirmation. Pure text building plus one `note`
 * call, so `proceed.ts` stays a thin step.
 *
 * @module
 */
import { note } from '../../prompts';
import { kindNoun, CONFIG_KINDS } from '../../../select';
import type { ClosurePreview, SkippedArtifact } from '../../../select';
import type { ConfigKind } from '../../../types';
import { CLI_LABEL_COL_WIDTH } from '../../../cli-helpers';
import { chosenTarget } from './state';
import type { AddWizardState } from './state';

/** Above this many co-installing skills, the `via` hint is truncated to "first +N more". */
const VIA_INLINE_LIMIT = 2;

/** Everything the plan box shows, computed once by the proceed step. */
export interface PlanView {
  closure: ClosurePreview;
  /** Ids the target cannot take (kind or platform), so the box never promises them. */
  skipped: SkippedArtifact[];
  /** Ids already installed and unchanged: skipped unless "replace" is on. */
  upToDate: ReadonlySet<string>;
  /** How many artifacts will actually be written. */
  writeCount: number;
}

type TargetOrUndefined = ReturnType<typeof chosenTarget>;

const plural = (n: number, word: string): string => `${n} ${word}${n !== 1 ? 's' : ''}`;

function tag(view: PlanView, id: string, base: string): string {
  return view.upToDate.has(id) ? `${base}  (already up to date, skipped)` : base;
}

function dependencyLines(view: PlanView, ct: TargetOrUndefined): string[] {
  return view.closure.dependencies.map(({ artifact: a, via }) => {
    const shown =
      via.length <= VIA_INLINE_LIMIT ? via.join(', ') : `${via[0]} +${via.length - 1} more`;
    const label = kindNoun(ct, a.kind).padEnd(CLI_LABEL_COL_WIDTH);
    return tag(view, a.id, `  ${label}  ${a.id}  (dependency of ${shown})`);
  });
}

/** The artifact lines: each pick, then the dependencies when they are included. */
function artifactLines(view: PlanView, ct: TargetOrUndefined, includeDeps: boolean): string[] {
  const picks = view.closure.primary.map(a => {
    const label = kindNoun(ct, a.kind).padEnd(CLI_LABEL_COL_WIDTH);
    return tag(view, a.id, `  ${label}  ${a.id}  (your pick)`);
  });
  const extra = view.closure.dependencies.length;
  if (includeDeps) return [...picks, ...dependencyLines(view, ct)];
  return extra > 0 ? [...picks, `  (${plural(extra, 'recommended helper')} left out)`] : picks;
}

function configKindsOf(ids: string[], s: AddWizardState): ConfigKind[] {
  const kinds = ids.map(id => s.ctx.catalog.byId.get(id)?.kind);
  return [...new Set(kinds.filter((k): k is ConfigKind => CONFIG_KINDS.has(k ?? '')))];
}

/** "Config scope / Destination" lines when the install includes an MCP server, hook or settings. */
function configScopeLines(s: AddWizardState, ids: string[]): string[] {
  const ct = chosenTarget(s);
  const kinds = configKindsOf(ids, s);
  if (kinds.length === 0 || !ct?.configScopes) return [];
  const scope = s.configScope ?? 'project';
  const info = ct.configScopes(kinds, s.ctx.projectDir).find(si => si.value === scope);
  const places = (info?.destinations ?? []).map(d =>
    d.section ? `${d.fullPath}  › ${d.section}` : d.fullPath,
  );
  return [
    `Config scope: ${scope}`,
    ...[...new Set(places)].map((p, i) => (i === 0 ? `Destination:  ${p}` : `              ${p}`)),
  ];
}

function headerLines(s: AddWizardState, ct: TargetOrUndefined, scopeLines: string[]): string[] {
  return [
    `AI tool:      ${ct?.displayName ?? s.target}`,
    ...(s.language ? [`Language:     ${s.language}`] : []),
    `Existing files: ${s.overwrite ? 'replaced with the catalog version' : 'kept (never replaced)'}`,
    ...scopeLines,
  ];
}

/** One line naming what the target cannot take, e.g. "2 items skipped: GitHub Copilot does not support hook". */
function unsupportedLine(skipped: SkippedArtifact[], ct: TargetOrUndefined): string[] {
  if (skipped.length === 0) return [];
  const kinds = [...new Set(skipped.map(x => x.kind))];
  const named = kinds.map(k => kindNoun(ct, k as Parameters<typeof kindNoun>[1])).join(', ');
  const who = ct?.displayName ?? 'This tool';
  return ['', `${plural(skipped.length, 'item')} skipped: ${who} does not support ${named}.`];
}

/** Artifacts another pick already carries (a base rule inlined into a rule that extends it). */
function includedLine(skipped: SkippedArtifact[]): string[] {
  if (skipped.length === 0) return [];
  const ids = skipped.map(x => x.id).join(', ');
  return ['', `Already included in another pick, nothing to add: ${ids}.`];
}

/** The lines explaining what the plan leaves out and why; an inlined rule is not "unsupported". */
export function skippedLine(view: PlanView, ct: TargetOrUndefined): string[] {
  const included = view.skipped.filter(x => x.cause === 'inlined');
  const unsupported = view.skipped.filter(x => x.cause !== 'inlined');
  return [...unsupportedLine(unsupported, ct), ...includedLine(included)];
}

/** Ids the plan covers: the picks, plus their helpers when those are included. */
function planIds(s: AddWizardState, view: PlanView): string[] {
  return [
    ...view.closure.primary.map(a => a.id),
    ...(s.includeDeps ? view.closure.dependencies.map(d => d.artifact.id) : []),
  ];
}

/** Shows the install-plan box above the "Ready to install?" prompt. */
export function showPlanBox(s: AddWizardState, view: PlanView): void {
  const ct = chosenTarget(s);
  const head = headerLines(s, ct, configScopeLines(s, planIds(s, view)));
  const body =
    view.writeCount > 0
      ? `Will install ${plural(view.writeCount, 'artifact')}:`
      : 'Nothing new to install: everything you picked is already installed and up to date.';
  note(
    [
      ...head,
      '',
      body,
      ...artifactLines(view, ct, Boolean(s.includeDeps)),
      ...skippedLine(view, ct),
    ].join('\n'),
    'Install plan',
  );
}
