// Lane C — context budget: for each language, sum the lines Claude actually loads on realistic
// triggers (editing a matching file = every rule whose appliesTo glob matches; opening the skill
// listing = every skill+prompt's description/whenToUse, which is what's resident before any body
// is loaded). Quantifies the aggregate cost the per-artifact description-budget rule never sums.
'use strict';
const fs = require('fs');
const path = require('path');
const { loadCatalog } = require('./load-catalog.js');

const artifacts = loadCatalog();
const languages = ['typescript', 'csharp', 'angular', 'python', 'react'];

const report = {};
for (const lang of languages) {
  const langArtifacts = artifacts.filter(a => a.frontmatter.language === lang);
  const rules = langArtifacts.filter(a => a.kind === 'rule');
  const skills = langArtifacts.filter(a => a.kind === 'skill');
  const agents = langArtifacts.filter(a => a.kind === 'agent');

  // "Edit any source file" trigger: rules whose appliesTo includes the language's primary glob
  // (heuristic: any rule with appliesTo, plus shared/clean-code + shared/git which every rule
  // extends and whose body gets inlined per CLAUDE.md's "Applied Rules" plugin-build behavior).
  const sharedClean = artifacts.find(a => a.id === 'shared/clean-code');
  const sharedGit = artifacts.find(a => a.id === 'shared/git');
  let editTriggerLines = 0;
  const editTriggerBreakdown = [];
  for (const r of rules) {
    let lines = r.lines;
    const ext = r.frontmatter.extends;
    const extList = Array.isArray(ext) ? ext : ext ? [ext] : [];
    if (extList.includes('shared/clean-code')) lines += sharedClean.lines;
    if (extList.includes('shared/git')) lines += sharedGit.lines;
    editTriggerLines += lines;
    editTriggerBreakdown.push({ id: r.id, effectiveLines: lines });
  }

  // "Skill listing" trigger: description + whenToUse char budget across all skills/prompts for
  // this language (dispatch surface resident before any body loads).
  const listingChars = skills.reduce((sum, s) => {
    const fm = s.frontmatter;
    return sum + (fm.description || '').length + (fm.whenToUse || fm.when_to_use || '').length;
  }, 0);

  report[lang] = {
    ruleCount: rules.length,
    agentCount: agents.length,
    skillCount: skills.length,
    editAnySourceFileTotalLines: editTriggerLines,
    editTriggerBreakdown,
    skillListingTotalChars: listingChars,
  };
}

fs.writeFileSync(
  path.resolve(__dirname, '..', 'analysis', 'lane-c-budget.json'),
  JSON.stringify(report, null, 2),
);

console.log('=== Lane C: context budget per language ===');
for (const lang of languages) {
  const r = report[lang];
  console.log(
    `${lang}: ${r.ruleCount} rules -> ${r.editAnySourceFileTotalLines} lines on ANY matching-file edit ` +
      `| ${r.skillCount} skills -> ${r.skillListingTotalChars} chars in skill listing`,
  );
}
