# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-06-22

### Added

- Initial catalog: 3 skills (xUnit, pytest, React component testing), 4 agents, 4 rules, 2 prompts
- `sigil add` — interactive wizard + selector-based scaffold for Claude Code and GitHub Copilot
- `sigil new` — scaffold authoring templates for catalog contributors
- `sigil build` — compile catalog to `dist/claude/` (plugin layout) and `dist/copilot/`
- `sigil validate` — schema + reference-graph integrity checks (CI gate)
- `sigil list` — query artifacts by kind, language, pack, or ID
- `sigil check` — per-file source convention validation
- `sigil retarget` — update the `platforms:` field of any artifact
- `sigil edit` — update title, description, and tags via guided wizard or flags
- `sigil delete` — remove an artifact with reverse-dependency warnings
- Step-back navigation (`← Back`) in both interactive wizards
- Shell completion scripts for bash, zsh, and fish
- DRY `extends:` inheritance for rules and `uses:` closure for skills
- Claude Code native plugin layout with `marketplace.json` + per-pack `plugin.json`
- GitHub Copilot layout with `.github/` instructions, prompts, skills, and AGENTS.md
