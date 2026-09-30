// Lane U — usage mining. Streams this project's Claude Code session transcripts
// (~/.claude/projects/<project-slug>/*.jsonl) line-by-line — never loads the whole file into
// memory/context — and counts, per installed artifact:
//   - Skill tool invocations (skill: <id> in the tool_use input)
//   - Agent/subagent dispatches, by subagent_type
//   - skill_listing / invoked_skills attachment presentations (surface was shown to the model)
// Output is an aggregate table only; no transcript content is echoed.
//
// Usage: node lane-u-usage.js [--dir <transcripts-dir>] [--since <ISO-date>]
'use strict';
const fs = require('fs');
const path = require('path');
const readline = require('readline');

function parseArgs(argv) {
  const args = { dir: null, since: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dir') args.dir = argv[++i];
    if (argv[i] === '--since') args.since = argv[++i];
  }
  return args;
}

function defaultTranscriptDir() {
  // Mirrors Claude Code's own project-slug derivation: replace path separators and drive-colon
  // with `-`, matching the on-disk convention observed under ~/.claude/projects/.
  const home = process.env.USERPROFILE || process.env.HOME;
  const cwd = process.cwd();
  const slug = cwd.replace(/^([A-Za-z]):/, '$1-').replace(/[\\/]/g, '-');
  return path.join(home, '.claude', 'projects', slug);
}

async function streamFile(file, stats) {
  const rl = readline.createInterface({
    input: fs.createReadStream(file, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    if (!line.trim()) continue;
    let evt;
    try {
      evt = JSON.parse(line);
    } catch {
      continue;
    }

    if (evt.type === 'attachment' && evt.attachment) {
      const t = evt.attachment.type;
      if (t === 'skill_listing' || t === 'invoked_skills') {
        stats.attachmentCounts.set(t, (stats.attachmentCounts.get(t) || 0) + 1);
      }
    }

    const content = evt.message && evt.message.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (block.type !== 'tool_use') continue;
      if (block.name === 'Skill') {
        const skill = block.input && (block.input.skill || block.input.name);
        stats.skillInvocations.set(skill, (stats.skillInvocations.get(skill) || 0) + 1);
      }
      if (block.name === 'Agent') {
        const sub = (block.input && block.input.subagent_type) || '(unspecified)';
        stats.agentDispatches.set(sub, (stats.agentDispatches.get(sub) || 0) + 1);
      }
    }
  }
}

async function main() {
  const { dir, since } = parseArgs(process.argv.slice(2));
  const transcriptDir = dir || defaultTranscriptDir();
  if (!fs.existsSync(transcriptDir)) {
    console.error(`No transcript dir at ${transcriptDir}`);
    process.exit(1);
  }
  let files = fs.readdirSync(transcriptDir).filter(f => f.endsWith('.jsonl'));
  if (since) {
    const cutoff = new Date(since).getTime();
    files = files.filter(f => fs.statSync(path.join(transcriptDir, f)).mtimeMs >= cutoff);
  }

  const stats = {
    skillInvocations: new Map(),
    agentDispatches: new Map(),
    attachmentCounts: new Map(),
  };
  for (const f of files) {
    await streamFile(path.join(transcriptDir, f), stats);
  }

  console.log(
    `Transcripts scanned: ${files.length} (dir: ${transcriptDir}${since ? `, since ${since}` : ''})\n`,
  );
  console.log('Skill invocations:');
  if (stats.skillInvocations.size === 0) console.log('  (none)');
  for (const [k, v] of [...stats.skillInvocations].sort((a, b) => b[1] - a[1]))
    console.log(`  ${v}  ${k}`);
  console.log('\nAgent dispatches by subagent_type:');
  for (const [k, v] of [...stats.agentDispatches].sort((a, b) => b[1] - a[1]))
    console.log(`  ${v}  ${k}`);
  console.log('\nSurface-presentation attachments:');
  for (const [k, v] of [...stats.attachmentCounts]) console.log(`  ${v}  ${k}`);

  return stats;
}

if (require.main === module) main();
module.exports = { main, defaultTranscriptDir };
