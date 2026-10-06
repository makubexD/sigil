---
id: python/py-testing
kind: rule
title: Testing (Python)
description: Python pytest testing conventions — AAA structure, fixtures over setUp, parametrize, mocking boundaries, coverage floor
language: python
appliesTo:
  - "**/test_*.py"
  - "**/*_test.py"
  - "**/tests/**/*.py"
  - "**/conftest.py"
tags:
  - python
  - testing
appliesToRationale: Scoped to test files and conftest.py because these pytest conventions apply only to test code, not production source.
---

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
