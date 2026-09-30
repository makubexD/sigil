/**
 * Declarative emission types — the provider SSoT for "what does Claude Code / Copilot's format
 * require for this kind." One `KindEmitSpec` per (provider, kind[, variant]) pair lives in
 * `src/targets/<provider>/spec/<kind>.ts`; this file defines only the shared shape, no data.
 *
 * Why this exists: today the imperative builders in plugin-build.ts / scaffold.ts /
 * build-helpers.ts are the sole authority on emitted format, and contracts.ts is a hand-written
 * parallel restatement of the same required/forbidden keys used only for post-hoc verification —
 * two places that can (and have) drifted apart. A KindEmitSpec is read by BOTH renderArtifact()
 * (src/targets/emit.ts, the emitter) and deriveContracts() (src/targets/output-contract.ts, the
 * verifier), so there is exactly one place per (provider, kind) that states the format.
 */
import type { ArtifactKind, ResolvedArtifact, ResolvedCatalog } from '../types';

/** A dated citation to the official provider documentation a spec's shape is following. */
export interface DocRef {
  readonly url: string;
  readonly title: string;
  /** Date (YYYY-MM-DD) this URL was last confirmed to still describe the cited format. */
  readonly verifiedOn: string;
  /** What this specific document establishes (kept short — shown in `sigil sync` output). */
  readonly covers: string;
}

/**
 * Runtime context passed to a spec's outputPath/render functions — everything they might need.
 * All fields optional: most kinds' sections need none of this (they read only from `artifact`),
 * so call sites that don't have a catalog/installSet handy (e.g. a bare skill render) can pass
 * `{}` rather than threading unused parameters through. Sections that DO need one (Boundary)
 * simply render `[]` when it's absent — the existing "no installSet → no section" behavior.
 */
export interface EmitContext {
  readonly catalog?: ResolvedCatalog | undefined;
  /** The artifacts co-present in this install/build set — drives conditional Boundary sections. */
  readonly installSet?: Set<string> | undefined;
  /** Pack name, for plugin-build output paths (`plugins/<pack>/…`). Absent in scaffold context. */
  readonly packName?: string | undefined;
}

/** Maps one catalog frontmatter field to one provider frontmatter key. */
export interface FieldMapping {
  /** Catalog frontmatter key, dot-path for nested fields (e.g. 'claude.model'). */
  readonly from: string;
  /** Provider-side YAML key this field is emitted as (e.g. 'allowed-tools'). */
  readonly to: string;
  /** Whether deriveContracts() should list `to` as a required key for this spec's output path. */
  readonly required: boolean;
  /** Renders `to: <value>` (or a multi-line block) from the raw frontmatter value. */
  readonly serialize: (value: unknown) => string;
  /** Only emit this mapping when true; omitted = no extra gate (subject to the value being present). */
  readonly when?: (frontmatter: Record<string, unknown>) => boolean;
  /**
   * When true, `serialize` is called even if the source value is absent (undefined/null) — for
   * fields that must always be emitted with a fallback default. Default false: a mapping whose
   * source value is absent is skipped without calling `serialize`.
   */
  readonly alwaysEmit?: boolean;
}

/** A body section rendered before or after the artifact's own (resolved) body. */
export interface BodySectionSpec {
  readonly id: string;
  readonly position: 'before' | 'after';
  /** Returns the section's lines, or `[]` to omit it entirely for this artifact/context. */
  readonly render: (artifact: ResolvedArtifact, ctx: EmitContext) => string[];
}

/** The full declarative emission contract for one (provider, kind[, variant]) pair. */
export interface KindEmitSpec {
  readonly kind: ArtifactKind;
  /** Distinguishes multiple layouts for the same kind on one provider (Claude's plugin/scaffold). */
  readonly variant?: string;
  readonly outputPath: (artifact: ResolvedArtifact, ctx: EmitContext) => string;
  /**
   * Static regex matching this spec's output paths, independent of any one artifact — used by
   * deriveContracts() (output-contract.ts) to route an emitted file to its spec. `outputPath` is
   * a function of a specific artifact's frontmatter (name/id) and can't be reverse-derived into
   * a pattern, so this is declared separately; keep the two in sync when either changes.
   */
  readonly pathPattern: RegExp;
  /**
   * Applied to the artifact's own body (`resolvedBody ?? body`) before it is placed between the
   * `before`/`after` sections — e.g. translating `{{name}}` catalog placeholders into a
   * provider's native substitution syntax (`$name` for Claude, `${input:name}` for Copilot).
   * Omitted = body passes through unchanged.
   */
  readonly bodyTransform?: (body: string) => string;
  readonly frontmatter: readonly FieldMapping[];
  /** When false and no `frontmatter` mapping produced output, omit the `---…---` block entirely. */
  readonly emitEmptyFrontmatter: boolean;
  readonly body: readonly BodySectionSpec[];
  /** Frontmatter keys that must never appear in this spec's output (cross-contamination guard). */
  readonly forbiddenKeys: readonly string[];
  /** Body patterns that must never appear (e.g. unresolved `{{…}}` or a foreign placeholder). */
  readonly bodyForbids: readonly { pattern: RegExp; reason: string }[];
  /** Official documentation this spec's shape follows — required, tracked by `sigil sync --stale`. */
  readonly docs: readonly DocRef[];
  /**
   * Set when the provider has signaled this spec's OUTPUT FORMAT is being superseded — distinct
   * from an individual catalog artifact's `deprecated:` (schema/shared.ts), which retires one
   * artifact. This retires an entire (provider, kind) rendering shape. `sigil sync --check`
   * surfaces every spec carrying this so it isn't discovered only by an audit like the one that
   * added it (Claude's commands-merged-into-skills migration; VS Code steering `.prompt.md`
   * toward agent skills). Not itself a trigger to change emission — that's still a deliberate,
   * reviewed migration (see spec/prompt.ts's header for how the Claude one was carried out).
   */
  readonly supersededBy?: { readonly by: string; readonly note: string; readonly doc: DocRef };
}
