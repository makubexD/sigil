---
id: python/py-security
kind: rule
title: Security (Python)
description: Python security invariants — secrets handling, pickle/YAML/eval bans, request timeouts
language: python
severity: required
appliesTo:
  - "**/*.py"
tags:
  - python
  - security
appliesToRationale: Scoped to Python source because these are code-level security invariants, not project-config concerns.
---

## Security

- No secrets in source, committed config, logs, exceptions or `__repr__`. Read them from the environment
  (`pydantic-settings` or `os.environ["NAME"]`) and fail fast; no `os.environ.get("TOKEN", "dev-token")` fallback.
  Commit `.env.example` with placeholders, never `.env`.
- No `pickle` from outside your control, `yaml.safe_load` (or `Loader=yaml.SafeLoader`), never plain `yaml.load`, no `eval`/`exec` on external data
  (`ast.literal_eval` for literals).
- Every outbound HTTP call sets a timeout; never `verify=False` outside local tests.
