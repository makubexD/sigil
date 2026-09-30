// Lane X — provider portability. For every installed-set artifact, resolves whether its dispatch
// mechanism (the thing that makes a provider load or invoke it) exists on a second provider.
//
// `supportedKinds` per target is read mechanically from the compiled target registry
// (dist-cli/targets/index.js) — never hand-listed. The *dispatch mechanism* per (provider, kind)
// is not encoded anywhere as data today (there is no `dispatchMechanism` field on KindEmitSpec);
// this table is the documented semantics from CLAUDE.md's "Two Claude delivery modes" section and
// each provider's own per-kind spec (e.g. COPILOT_AGENT_SPEC emits `.github/agents/*.agent.md`,
// a real per-artifact custom-agent surface — verified by reading src/targets/copilot/spec/agent.ts
// directly rather than assumed). If a `dispatchMechanism` field is ever added to spec-types.ts,
// this table should be replaced by deriving from it — flagged here rather than silently presented
// as fully mechanical.
'use strict';
const path = require('path');
const { getAllTargets } = require(
  path.resolve(__dirname, '..', '..', '..', '..', 'dist-cli', 'targets', 'index.js'),
);
const { loadCatalog } = require('../../../audits/tools/load-catalog');

// kind -> { provider -> mechanism | null (no equivalent exists) }
const DISPATCH = {
  skill: {
    claude: 'description + whenToUse (model-invoked)',
    copilot: 'description + whenToUse (agent skill)',
  },
  agent: {
    claude: 'description only (subagent dispatch)',
    copilot: 'description only (.github/agents/*.agent.md custom agent)',
  },
  rule: {
    claude: 'paths: (native .claude/rules/ load) or inlined into skill body (plugin build)',
    copilot: 'applyTo: glob (.instructions.md)',
  },
  prompt: {
    claude: 'disable-model-invocation skill (user-invoked)',
    copilot: 'user-invoked .prompt.md (VS Code notes this format as superseded by skills)',
  },
  workflow: { claude: 'user-invoked', copilot: 'user-invoked (superseded by skills)' },
  hook: { claude: 'event-triggered (PreToolUse/…)', copilot: null },
  settings: { claude: 'static permission merge', copilot: null },
  mcp: { claude: 'server registration', copilot: 'server registration' },
};

function main() {
  const targets = getAllTargets().map(t => ({
    name: t.name,
    supportedKinds: new Set(t.supportedKinds),
  }));
  const catalog = loadCatalog();

  const manifestPath = path.resolve(__dirname, '..', '..', '..', '..', '.sigil', 'manifest.json');
  const manifest = require(manifestPath);
  const installedIds = new Set(manifest.entries.map(e => e.id));

  const rows = [];
  for (const a of catalog) {
    if (!installedIds.has(a.id)) continue;
    const mech = DISPATCH[a.kind] || {};
    const providersWithKindSupport = targets
      .filter(t => t.supportedKinds.has(a.kind))
      .map(t => t.name);
    const providersWithRealDispatch = providersWithKindSupport.filter(name => mech[name]);
    rows.push({
      id: a.id,
      kind: a.kind,
      supportedBy: providersWithKindSupport,
      dispatchOn: Object.fromEntries(
        providersWithKindSupport.map(name => [
          name,
          mech[name] || 'kind supported but NO dispatch mechanism',
        ]),
      ),
      portable: providersWithRealDispatch.length >= 2,
    });
  }

  rows.sort(
    (a, b) => (a.portable === b.portable ? 0 : a.portable ? 1 : -1) || a.id.localeCompare(b.id),
  );
  const singleProvider = rows.filter(r => !r.portable);
  console.log(
    `${rows.length} installed artifacts checked; ${singleProvider.length} have a dispatch mechanism on only one provider.\n`,
  );
  for (const r of singleProvider) {
    console.log(`[single-provider] ${r.kind} ${r.id} — dispatch: ${JSON.stringify(r.dispatchOn)}`);
  }
  return rows;
}

if (require.main === module) main();
module.exports = { main, DISPATCH };
