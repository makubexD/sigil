---
name: py-sync-tests
description: "Sync the pytest suite with source code — add missing tests, update stale ones, and remove orphaned tests (with confirmation before deletion) (Python)"
when_to_use: "Use after multiple source files have changed and the test suite has drifted — missing tests for new exports, stale tests for renamed symbols, orphaned tests for deleted modules. Also fires for \"sync the tests\", \"clean up orphaned tests\", or \"make sure tests match the current source\". Not for a single untested file with no drift to reconcile (see py-generate-tests for that)."
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
argument-hint: "[--scope=changed|all] (default: changed)"
---

# Sync Tests

**Scope:** $ARGUMENTS (default: changed files since the last commit on the base branch)

## Step 1 — Determine scope

`--scope=changed` (default): `git diff --name-only <base>...HEAD -- '*.py'`, excluding test files
themselves. `--scope=all`: every module under `src/`.

## Step 2 — Discover the runner and layout

Never assume a layout — read `[tool.pytest.ini_options]` in `pyproject.toml` (or `pytest.ini` /
`setup.cfg`) for `testpaths`, `python_files` and plugins such as `pytest-asyncio`, plus any
`conftest.py`. Read 2–3 existing test files to confirm the mirroring pattern (`tests/` tree vs.
co-located `test_*.py`), fixture style and import style; apply them consistently to every module
in scope.

## Step 3 — Add and update tests

### Find drift

For each source module in scope:
- **Missing tests** — a public function/class with no corresponding test in the mirrored
  `tests/` path (see `py-project-layout`'s test-layout convention).
- **Stale tests** — a test referencing a renamed/removed symbol (import error), or asserting
  against a signature that no longer matches.

```bash
pytest --collect-only 2>&1 | grep -i error   # import errors from renamed/removed symbols; via uv run / poetry run if the project uses one
```

### Add missing tests

For each untested public symbol, write tests following `py-testing`'s AAA structure and
`parametrize` conventions — cover the happy path, one edge case, and one error case at minimum.

### Fix stale tests

Update tests referencing a changed signature to match the new one, preserving the original test's
intent (what behavior it was verifying) — do not just delete and regenerate blindly; a stale test's
assertions often still document real intended behavior even when the call site needs updating.

## Step 4 — Detect orphaned tests

- **Orphaned tests** — a test file whose corresponding source module no longer exists.

## Step 5 — Confirm before any deletion (guardrail)

List orphaned test files/functions and **ask for confirmation before deleting** — a test with no
corresponding source might indicate the source was wrongly deleted, not that the test is genuinely
obsolete.

## Step 6 — Run and report

```bash
pytest   # through the project's runner if it has one: uv run, poetry run
ruff check .
```

If a test fails after the sync, decide whether the test or the code is wrong: never weaken an assertion to make it pass; report a suspected bug instead.

```
## Sync Tests Report
Scope: <changed files / all>

### Added
- `tests/path/test_x.py::test_new_case` — covers `module.new_function`

### Fixed (stale)
- `tests/path/test_y.py::test_case` — updated for renamed `module.old_name` → `module.new_name`

### Orphaned (pending confirmation)
- `tests/path/test_z.py` — source `module/z.py` no longer exists. Delete? [confirm before removing]

### Verification
Tests: <pass count>, all green
Lint: clean
```

---

## Applied Rules

### Testing (Python)

## Layout

Mirror the source tree under `tests/` (`src/myapp/services/user_service.py` →
`tests/services/test_user_service.py`) and name each file `test_<module>.py`. Put fixtures shared
across files in `conftest.py` — pytest discovers it automatically, so never import from it.

## Arrange-Act-Assert

Structure every test in three clear sections — a blank line between each is enough, comments are
optional but welcome for non-trivial arrangement:

```python
def test_merge_timeline_truncates_at_daily_cap():
    # Arrange
    calendar_rows = [make_row(start="09:00", minutes=60)]
    dev_rows = [make_row(start="10:00", minutes=120)]

    # Act
    result = merge_timeline(calendar_rows, dev_rows, daily_cap_minutes=90)

    # Assert
    assert sum(r.minutes for r in result) == 90
```

One logical assertion concern per test — a test named `test_merge_timeline_truncates_at_daily_cap`
should not also assert unrelated behavior about sort order; give that its own test.

## Fixtures, Not `unittest.TestCase.setUp`

Use pytest fixtures for setup/teardown — they compose, support dependency injection between
fixtures, and scope cleanly (`function`, `class`, `module`, `session`):

```python
@pytest.fixture
def db_session():
    session = create_session()
    yield session
    session.rollback()
    session.close()

def test_user_repository_saves(db_session):
    repo = UserRepository(db_session)
    repo.save(User(name="Ada"))
    assert repo.count() == 1
```

Prefer `yield`-style fixtures over `return` when teardown is needed — the code after `yield` runs
even if the test fails. Request a fixture by naming it as a test (or fixture) argument; pytest
wires the graph.

Pick the narrowest scope that works: `function` (the default) for mutable state, `class` or
`module` for setup shared by one class or file, `session` only for expensive shared state (a DB
engine, a server process). A wider scope shares state across tests, so it must be read-only or
reset between them.

- **Factory fixtures** — when one test needs several instances, return a builder:

  ```python
  @pytest.fixture
  def make_user():
      def _make(name: str = "Ada", role: str = "user") -> User:
          return User(id=uuid4(), name=name, role=role)
      return _make
  ```

- **`autouse=True`** — runs for every test in its scope without being requested; keep it for
  cross-cutting reset (rolling back a session), never for arrangement a reader needs to see.
- **`tmp_path` / `tmp_path_factory`** — built-in function- and session-scoped temporary
  directories; use them instead of writing to the working tree or hand-rolling cleanup.

## `parametrize` Over Copy-Pasted Test Functions

When the same logic is exercised with different inputs, use `@pytest.mark.parametrize` instead of
near-duplicate test functions:

```python
@pytest.mark.parametrize(
    ("minutes", "expected_hours"),
    [(0, 0.0), (60, 1.0), (90, 1.5), (150, 2.5)],
)
def test_minutes_to_hours(minutes, expected_hours):
    assert minutes_to_hours(minutes) == expected_hours
```

## Mocking Boundaries

Mock at the boundary your code owns (an HTTP client, a repository interface) — never mock the
internals of a third-party library you don't control, and never mock the function under test
itself. Use `unittest.mock.AsyncMock` for mocking coroutines, and `pytest-mock`'s `mocker` fixture
for a cleaner patch-and-auto-restore API than raw `unittest.mock.patch`.

```python
def test_fetch_user_calls_client(mocker):
    mock_client = mocker.patch("myapp.services.http_client")
    mock_client.get.return_value = {"id": "u1"}
    result = fetch_user("u1")
    mock_client.get.assert_called_once_with("/users/u1")
```

For environment and module-level settings, use the built-in `monkeypatch` fixture
(`monkeypatch.setenv("API_KEY", "test-key")`, `monkeypatch.setattr("myapp.config.TIMEOUT", 5)`) —
it restores the original after the test. Freeze the clock (`freezegun`, or an injected clock)
rather than asserting against `datetime.now()`.

## Async Tests

Mark async test functions with `@pytest.mark.asyncio` (or configure `asyncio_mode = "auto"` in
`[tool.pytest.ini_options]` to avoid the per-test marker). Use `pytest-asyncio`'s async fixtures for
setup that itself needs `await`.

## Expected Exceptions

Assert a raise with `pytest.raises` as a context manager, and pin the message with `match=` (a
regex) so the test fails on the wrong error, not only the wrong type:

```python
def test_get_user_raises_not_found_when_missing(user_service):
    with pytest.raises(UserNotFoundError, match="42"):
        user_service.get_user(42)
```

## Test Naming and Isolation

Name tests `test_<unit>_<condition>_<expected_outcome>` — the name alone should describe the
scenario without opening the file. Each test must be independent and order-agnostic; a test that
only passes when run after another test has a hidden shared-state bug — usually a module-level
mutable default or an un-torn-down fixture. Order-agnostic tests also run in parallel under
`pytest-xdist` (`pytest -n auto`).

## What Not to Test

- Third-party library internals (SQLAlchemy query building, FastAPI routing).
- Private functions — exercise them through the public interface.
- Trivial properties and `__repr__` implementations.

## Coverage Floor

Discover the project's configured floor from `[tool.coverage.report] fail_under` in `pyproject.toml`
(or CI config) — do not assume a number. Run `pytest --cov=src --cov-report=term-missing` to see
exactly which lines are untested before writing new tests; target the actual gaps, not a blanket
re-test of already-covered code.

See `py-generate-tests` (creates a new test suite for untested code) and `py-sync-tests`
(reconciles drifted tests with changed source) for the automated skills.
