/**
 * Listing bytes a session carries before the first prompt, per language: the name, `description` and
 * `whenToUse` of every skill the model can invoke, and the name and `description` of every agent,
 * with every skill and agent of the language installed. `shared` is the same count for the
 * language-neutral artifacts. Skills with `disableModelInvocation` are left out: a tool that honors
 * the flag keeps them out of the model's listing.
 *
 * CI keeps each group within its recorded baseline (`listing-load-baseline.json`,
 * test/listing-load.test.ts): growth needs a reason, and a drop larger than SLACK_BYTES must lower
 * the baseline.
 *
 * Run: npm run listing-load [-- --json | --baseline "<why>"]   (needs a current dist-cli/: npm run build)
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BASELINE_PATH = path.join(__dirname, 'listing-load-baseline.json');
/** How far below its baseline a group may fall before the baseline must be lowered. */
const SLACK_BYTES = 256;
const SHARED = 'shared';

const text = value => (typeof value === 'string' ? value : '');

function listingBytes(artifact) {
  const fm = artifact.frontmatter;
  const name = text(fm.name) || artifact.id.split('/').pop();
  const when = artifact.kind === 'skill' ? text(fm.whenToUse) : '';
  return (
    Buffer.byteLength(name) + Buffer.byteLength(text(fm.description)) + Buffer.byteLength(when)
  );
}

function isListed(artifact) {
  if (artifact.frontmatter.deprecated) return false;
  if (artifact.kind === 'agent') return true;
  return artifact.kind === 'skill' && artifact.frontmatter.disableModelInvocation !== true;
}

async function listingLoad(catalogDir = path.join(ROOT, 'catalog')) {
  const { loadCatalog } = require(path.join(ROOT, 'dist-cli/load.js'));
  const catalog = await loadCatalog(catalogDir);
  const groups = {};
  for (const artifact of catalog.artifacts.filter(isListed)) {
    const group = text(artifact.frontmatter.language) || SHARED;
    groups[group] ??= { items: [], bytes: 0 };
    const bytes = listingBytes(artifact);
    groups[group].items.push({ id: artifact.id, kind: artifact.kind, bytes });
    groups[group].bytes += bytes;
  }
  return { groups };
}

/** Record today's bytes; a group whose bytes changed takes `reason`, the rest keep theirs. */
function writeBaseline(report, reason) {
  const old = fs.existsSync(BASELINE_PATH)
    ? JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'))
    : {};
  const next = {};
  for (const group of Object.keys(report.groups).sort()) {
    const { bytes } = report.groups[group];
    const same = old[group] && old[group].bytes === bytes;
    next[group] = { bytes, reason: same ? old[group].reason : reason };
  }
  fs.writeFileSync(BASELINE_PATH, `${JSON.stringify(next, null, 2)}\n`);
}

async function main() {
  const report = await listingLoad();
  const at = process.argv.indexOf('--baseline');
  if (at > 0) {
    const reason = process.argv[at + 1];
    if (!reason)
      throw new Error('--baseline needs a reason: npm run listing-load -- --baseline "<why>"');
    writeBaseline(report, reason);
    return;
  }
  if (process.argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return;
  }
  for (const group of Object.keys(report.groups).sort()) {
    const load = report.groups[group];
    const count = kind => load.items.filter(item => item.kind === kind).length;
    process.stdout.write(
      `${group}: ${(load.bytes / 1024).toFixed(1)} KB, ${count('skill')} skills, ${count('agent')} agents\n`,
    );
    for (const item of load.items) process.stdout.write(`  ${item.id.padEnd(40)} ${item.bytes}\n`);
  }
}

if (require.main === module) {
  main().catch(err => {
    process.stderr.write(`${err.stack ?? err}\n`);
    process.exit(1);
  });
}

module.exports = { listingLoad, BASELINE_PATH, SLACK_BYTES };
