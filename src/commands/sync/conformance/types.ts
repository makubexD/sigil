/**
 * Shared types for the conformance engine — `sigil sync`'s second analyzer, sitting alongside
 * template drift (../analyze.ts). Where template drift compares an artifact against its declared
 * `template:`, conformance compares every catalog artifact against the standard set by
 * src/targets/doc-refs.ts and the per-provider KindEmitSpecs: is this artifact shaped the way the
 * current standard requires, on every provider it emits to?
 *
 * A ConformanceRule is data plus two-or-three pure functions — the same philosophy as
 * KindEmitSpec (src/targets/spec-types.ts): adding a rule never touches the runner (detect.ts),
 * the mechanical writer (fix-mechanical.ts), or the editorial pass (fix-editorial.ts).
 *
 * @module
 */
import type { ArtifactKind, LoadedCatalog, Target } from '../../../types';
import type { DocRef } from '../../../targets/spec-types';

/** Everything a rule's detect/fix functions might need — the catalog and the registered targets. */
export interface ConformanceContext {
  readonly catalog: LoadedCatalog;
  readonly targets: readonly Target[];
}

/** `mechanical` findings are safe for `--apply` to rewrite unattended (deterministic fix). */
export type ConformanceClass = 'mechanical' | 'editorial';

/** One concrete deviation from the standard, found by one rule's `detect()`. */
export interface ConformanceFinding {
  readonly ruleId: string;
  readonly severity: 'error' | 'warning';
  /** Absent for catalog/target-level findings (e.g. provider-kind-coverage has no single artifact). */
  readonly artifactId?: string;
  readonly filePath?: string;
  /** Set when the finding concerns one provider specifically (e.g. a Copilot-only content loss). */
  readonly provider?: string;
  readonly detail: string;
}

/** A deterministic, ready-to-write edit — what a `mechanical` rule's `fix()` returns. */
export interface ArtifactEdit {
  readonly artifactId: string;
  readonly filePath: string;
  /** Frontmatter keys to add/overwrite; a value of `undefined` deletes that key. */
  readonly frontmatterPatch?: Record<string, unknown>;
  /** Full replacement body, when the fix must also change body content (e.g. strip a heading). */
  readonly newBody?: string;
}

/** What an `editorial` rule asks the model-backed pass to do for one finding. */
export interface EditorialTask {
  readonly artifactId: string;
  readonly filePath: string;
  readonly kind: ArtifactKind;
  /** Natural-language instruction for the model — what to change and how, with the exemplar named. */
  readonly instruction: string;
  /**
   * Frontmatter keys (or the literal 'body') the model's proposal may touch. Any other change is
   * rejected by the editorial pass's identity-fields rail — see fix-editorial.ts.
   */
  readonly ownedFields: readonly string[];
}

/** The full declarative contract for one conformance check — see module header. */
export interface ConformanceRule {
  readonly id: string;
  readonly title: string;
  readonly class: ConformanceClass;
  /** Scopes this rule to specific kinds/providers; omitted = catalog-wide. */
  readonly appliesTo: {
    readonly kinds?: readonly ArtifactKind[];
    readonly providers?: readonly string[];
  };
  /** Why the standard requires this — shown in the report so a finding is self-explanatory. */
  readonly rationale: string;
  readonly docs?: readonly DocRef[];
  detect(ctx: ConformanceContext): ConformanceFinding[];
  /** `mechanical` rules only. Returns undefined when this specific finding has no safe fix. */
  fix?(finding: ConformanceFinding, ctx: ConformanceContext): ArtifactEdit | undefined;
  /** `editorial` rules only. Builds the task the model-backed pass executes for this finding. */
  editorialTask?(finding: ConformanceFinding, ctx: ConformanceContext): EditorialTask | undefined;
}
