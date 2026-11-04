/**
 * Install-time variable substitution in front of the targets. A catalog `mcp` artifact may declare
 * `vars:` and write `{sigil:var:NAME}` tokens; no target or `McpDialect` knows about them. This
 * wrapper looks the artifact up in the resolved catalog, substitutes the values into a copy of its
 * `server`, and delegates to the target's own `scaffoldConfig`, so every target writes the same
 * literal and the catalog's bytes stay untouched. A token that survives into a returned op is an
 * error, never a written file.
 *
 * @module
 */
import { SigilError } from './errors';
import { declaredVarNames, missingVars, substituteVars } from './mcp-vars';
import type { VarValues } from './mcp-vars';
import type {
  ConfigMergeOp,
  ResolvedArtifact,
  ResolvedCatalog,
  ScaffoldOptions,
  Target,
} from './types';

/** A target's scaffold options plus the install values for the artifact's declared `vars:`. */
export interface ConfigOpsOptions extends ScaffoldOptions {
  readonly vars: VarValues;
}

/** The token prefix that must never reach a written config. */
const VAR_TOKEN = '{sigil:var:';

/** Throws naming every declared variable `artifact` has no value for. */
function requireVars(id: string, artifact: ResolvedArtifact, vars: VarValues): void {
  const missing = missingVars(artifact, vars);
  if (missing.length === 0) return;
  throw new SigilError(
    `'${id}' is missing install values for ${missing.join(', ')}; pass ` +
      `${missing.map(name => `--var ${name}=<value>`).join(' ')}.`,
  );
}

/** A copy of `resolved` whose artifact `id` has its `server` tokens replaced by literal values. */
function catalogWithLiteralServer(
  resolved: ResolvedCatalog,
  id: string,
  artifact: ResolvedArtifact,
  vars: VarValues,
): ResolvedCatalog {
  const withLiteralServer = {
    ...artifact,
    frontmatter: {
      ...artifact.frontmatter,
      server: substituteVars(artifact.frontmatter['server'], name => vars[name] as string),
    },
  };
  return { ...resolved, byId: new Map(resolved.byId).set(id, withLiteralServer) };
}

/** Throws when a target returned an op that still holds an unsubstituted token. */
function requireNoVarTokens(target: Target, id: string, ops: readonly ConfigMergeOp[]): void {
  if (!ops.some(op => JSON.stringify(op).includes(VAR_TOKEN))) return;
  throw new SigilError(
    `'${id}' still holds an install variable after substitution in '${target.name}' output.`,
  );
}

/**
 * The ops `target.scaffoldConfig` builds for config artifact `id`, with every declared install
 * variable substituted into a copy of its `server`. An artifact absent from the catalog (the target
 * reports that) or declaring no `vars:` delegates unchanged. Throws {@link SigilError} when a
 * declared variable has no value, or when a returned op still holds a token.
 */
export async function scaffoldConfigOps(
  target: Target,
  id: string,
  resolved: ResolvedCatalog,
  { vars, ...options }: ConfigOpsOptions,
): Promise<ConfigMergeOp[]> {
  const artifact = resolved.byId.get(id);
  let catalog = resolved;
  if (artifact !== undefined && declaredVarNames(artifact).length > 0) {
    requireVars(id, artifact, vars);
    catalog = catalogWithLiteralServer(resolved, id, artifact, vars);
  }

  const ops = await target.scaffoldConfig!(id, catalog, options);
  requireNoVarTokens(target, id, ops);
  return ops;
}
