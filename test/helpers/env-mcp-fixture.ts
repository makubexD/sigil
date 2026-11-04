/**
 * An inline `shared/ado` fixture carrying the `{sigil:env:}` tokens the catalog file used before
 * the install-variable move. The target tests that exercise env references, and Codex's and
 * Antigravity's skip, use this instead of reading the catalog's own `ado.mcp.md`, so moving that
 * artifact does not change what they test.
 */
import yaml from 'js-yaml';
import type { ResolvedArtifact, ResolvedCatalog } from '../../dist-cli/types';

/** The fixture's artifact id; its basename is the server name the targets write. */
export const ENV_MCP_ID = 'shared/ado';

const TITLE = 'Azure DevOps MCP Server';
const DESCRIPTION = 'Connects your AI tool to the Azure DevOps MCP server.';
const TAGS = ['mcp', 'azure-devops', 'ado', 'work-items', 'shared'];
const PLATFORMS = ['claude', 'copilot', 'cursor'];

/** The server's `args` and `env` exactly as `catalog/shared/mcps/ado.mcp.md` carried them. */
export const ENV_MCP_SERVER = {
  command: 'npx',
  args: [
    '-y',
    '@azure-devops/mcp@2.10.0',
    '{sigil:env:ADO_ORG}',
    '--authentication',
    'pat',
    '-d',
    'core',
    'work',
    'work-items',
  ],
  env: {
    ADO_MCP_PERSONAL_TOKEN: '{sigil:env:ADO_MCP_PERSONAL_TOKEN}',
  },
} as const;

/** The same server as a catalog source file, for the CLI round-trip tests that write one. */
export const ENV_MCP_MARKDOWN = [
  '---',
  `id: ${ENV_MCP_ID}`,
  'kind: mcp',
  `title: "${TITLE}"`,
  `description: ${DESCRIPTION}`,
  'server:',
  ...yaml
    .dump(ENV_MCP_SERVER)
    .trimEnd()
    .split('\n')
    .map(line => `  ${line}`),
  `tags: [${TAGS.join(', ')}]`,
  `platforms: [${PLATFORMS.join(', ')}]`,
  '---',
  'Inline env-token fixture.',
  '',
].join('\n');

/** The fixture as a resolved artifact. */
export function envMcpArtifact(): ResolvedArtifact {
  return {
    id: ENV_MCP_ID,
    kind: 'mcp',
    filePath: '/fixture/shared/mcps/ado.mcp.md',
    frontmatter: {
      id: ENV_MCP_ID,
      kind: 'mcp',
      title: TITLE,
      description: DESCRIPTION,
      server: structuredClone(ENV_MCP_SERVER),
      tags: [...TAGS],
      platforms: [...PLATFORMS],
    },
    body: 'Inline env-token fixture.',
  };
}

/** `catalog` with its `shared/ado` entry replaced by {@link envMcpArtifact}, never mutated. */
export function withEnvMcpFixture(catalog: ResolvedCatalog): ResolvedCatalog {
  const artifact = envMcpArtifact();
  const artifacts = catalog.byId.has(ENV_MCP_ID)
    ? catalog.artifacts.map(other => (other.id === ENV_MCP_ID ? artifact : other))
    : [...catalog.artifacts, artifact];
  return {
    ...catalog,
    artifacts,
    byId: new Map(catalog.byId).set(ENV_MCP_ID, artifact),
  };
}
