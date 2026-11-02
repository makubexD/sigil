---
id: shared/protect-config
kind: hook
title: "Protect Config Files"
description: >-
  Blocks file edits that target secret-bearing files (.env and .env.*, .envrc,
  private keys, certificates, credential and secrets data files). Templates such as
  .env.example stay editable.
event: before-tool
matcher: edit
script: |-
  const fs = require('fs');
  const path = require('path');
  if (!input) return;
  const hit = input.files.flatMap(candidates).find(isProtected);
  if (hit) {
    process.stderr.write('sigil-hook: blocked write to protected file ' + hit + '\n');
    process.exitCode = 2;
  }
  function candidates(file) {
    const full = path.resolve(file);
    const names = [file, full];
    try { names.push(fs.realpathSync.native(full)); } catch {
      try { names.push(path.join(fs.realpathSync.native(path.dirname(full)), path.basename(full))); } catch {}
    }
    return names.flatMap(baseNames);
  }
  function baseNames(p) {
    const b = p.split(/[\\/]/).pop().toLowerCase().replace(/[. ]+$/, '');
    return [b, b.split(':')[0]];
  }
  function isProtected(b) {
    if (/\.(example|sample|template)$/.test(b)) return false;
    if (/^\.env([.-]|rc$|$)/.test(b) || b.endsWith('.env')) return true;
    if (/^id_(rsa|dsa|ecdsa|ed25519)/.test(b)) return !b.endsWith('.pub');
    if (/\.(pem|key|p12|pfx|ppk|jks|keystore)$/.test(b)) return true;
    const exact = ['credentials', '.git-credentials', 'secrets', '.secrets', '.netrc', '.pgpass'];
    if (exact.includes(b)) return true;
    return /^(secrets|credentials)\.(json|ya?ml|toml|ini|env|txt|xml)$/.test(b);
  }
tags: [security, safety, shared]
# version:       # per-artifact semver (optional; package version is the default)
# platforms:     # omit to propagate to ALL supporting AIs (DRY default)
---

<!-- Describe what this hook does and when it fires. The script: above is executed. -->

Fires before every file edit. The hook reads the files the call names (sigil's hook input),
resolves the real path (so a symlink, a Windows short name like `ENV~1`, or an `::$DATA` stream
suffix can't disguise the target), and checks each file name. On a match it exits with code 2,
which blocks the call, and says why on stderr.

Where the agent allows it, sigil installs it in exec form (`node -e` with arguments), so no shell sits between the agent and the
exit code. That matters on Windows without Git Bash, where shell-form hooks run through
PowerShell and a blocking exit code 2 comes back as 1, which does not block.

**Blocked:**
- `.env`, `.env.*`, `.env-*`, `*.env`, and `.envrc`, except templates ending in `.example`,
  `.sample`, or `.template` (`.env.production.example` stays editable)
- SSH private keys (`id_rsa`, `id_ed25519`, …; `.pub` files are allowed)
- `*.pem`, `*.key`, `*.p12`, `*.pfx`, `*.ppk`, `*.jks`, `*.keystore`
- `credentials`, `.git-credentials`, `secrets`, `.secrets`, `.netrc`, `.pgpass`, and
  `secrets.*` / `credentials.*`
  data files (`.json`, `.yaml`, `.toml`, `.ini`, `.env`, `.txt`, `.xml`), so source files such
  as `secrets.service.ts` stay editable

**Not covered — use other controls for these:**
- Writes made through the Bash tool (`echo X=1 > .env`) or through MCP tools. Add
  `permissions.deny` rules or enable the sandbox for those.
- Hardlinks, which can't be recognized by name.
- The settings file this hook is installed in. An edit there can remove the hook, so review any
  request to change it before approving it.
- A missing `node` on the PATH the agent runs with, or a broken `NODE_OPTIONS`. Most agents
  then let the call through; GitHub Copilot fails closed and denies every Edit or Write until
  `node` starts again. Input the hook can't parse is let through.
- The GitHub Copilot cloud agent, which skips exec-form hooks. It protects Copilot CLI and
  VS Code only.
- OpenAI Codex until you review the hook in `/hooks`. Codex skips a new or changed hook, and every
  project hook in an untrusted project, with no error. On Codex this script is one base64-encoded
  command, not exec form, so it runs in any shell; it hasn't been tested live on Windows.
- GitHub Copilot CLI in an untrusted folder. It loads repository hooks only from a trusted folder,
  so `copilot -p` there skips this hook silently. `--trust-folder` fixes that for one session.

Install it at `project` scope to protect everyone who clones the repository; `local` scope
protects only you.
