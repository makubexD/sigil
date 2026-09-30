// Lane A — reference graph: orphans, dangling refs, description-only agents, stale packs.
'use strict';
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { loadCatalog, CATALOG_ROOT } = require('./load-catalog.js');

const artifacts = loadCatalog();
const byId = new Map(artifacts.map(a => [a.id, a]));

const packsRaw = fs.readFileSync(path.resolve(CATALOG_ROOT, '..', 'packs.yaml'), 'utf8');
const packs = yaml.load(packsRaw).packs || yaml.load(packsRaw);
const packList = Array.isArray(packs) ? packs : packs.packs;

// Collect every reference: extends, uses.rules, uses.agents, template, pack artifacts.
const referencedIds = new Set();
const danglingRefs = [];

function ref(fromId, toId, kind) {
  if (!toId) return;
  if (!byId.has(toId)) {
    danglingRefs.push({ from: fromId, to: toId, kind });
    return;
  }
  referencedIds.add(toId);
}

for (const a of artifacts) {
  const fm = a.frontmatter;
  const extendsField = fm.extends;
  if (extendsField) {
    const list = Array.isArray(extendsField) ? extendsField : [extendsField];
    for (const e of list) ref(a.id, e, 'extends');
  }
  if (fm.uses) {
    for (const r of fm.uses.rules || []) ref(a.id, r, 'uses.rules');
    for (const ag of fm.uses.agents || []) ref(a.id, ag, 'uses.agents');
  }
  if (fm.template) ref(a.id, fm.template, 'template');
  if (Array.isArray(fm.relatedArtifacts)) {
    for (const ra of fm.relatedArtifacts) ref(a.id, ra.id, 'relatedArtifacts');
  }
}

const packArtifactIds = new Set();
for (const pack of packList) {
  for (const artId of pack.artifacts || []) {
    packArtifactIds.add(artId);
    ref(pack.name, artId, 'pack');
  }
  if (Array.isArray(pack.languages)) {
    for (const lang of pack.languages) {
      for (const a of artifacts) {
        if (a.frontmatter.language === lang) packArtifactIds.add(a.id);
      }
    }
  }
}

// Orphans: not referenced by extends/uses/template, not in any pack, not itself a shared base kind
// exempt from orphan-hood by design (rule bases meant only to be extended; templates meant only to
// be composed against).
const EXEMPT_ORPHAN_KINDS = new Set(['template']);
const orphans = artifacts.filter(a => {
  if (EXEMPT_ORPHAN_KINDS.has(a.kind)) return false;
  const inPack = packArtifactIds.has(a.id);
  const isReferenced = referencedIds.has(a.id);
  return !inPack && !isReferenced;
});

// Agents reachable only by description-dispatch (never named in any uses.agents / relatedArtifacts).
const agentIds = artifacts.filter(a => a.kind === 'agent').map(a => a.id);
const dispatchOnlyAgents = agentIds.filter(id => !referencedIds.has(id));

const report = {
  totalArtifacts: artifacts.length,
  danglingRefs,
  orphans: orphans.map(a => ({ id: a.id, kind: a.kind, path: a.path })),
  dispatchOnlyAgents,
  packCount: packList.length,
};

fs.writeFileSync(
  path.resolve(__dirname, '..', 'analysis', 'lane-a-refs.json'),
  JSON.stringify(report, null, 2),
);

console.log('=== Lane A: reference graph ===');
console.log('Dangling refs:', danglingRefs.length);
for (const d of danglingRefs) console.log(`  ${d.from} --${d.kind}--> ${d.to} (MISSING)`);
console.log('Orphans (not in any pack, not extended/used/templated):', orphans.length);
for (const o of orphans) console.log(`  ${o.id} [${o.kind}]`);
console.log(
  'Agents reachable only by description dispatch (no uses.agents/relatedArtifacts ref):',
  dispatchOnlyAgents.length,
);
for (const id of dispatchOnlyAgents) console.log(`  ${id}`);
