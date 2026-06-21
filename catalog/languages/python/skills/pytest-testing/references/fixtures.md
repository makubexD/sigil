# pytest Fixture Cheat-Sheet

## Fixture Scopes

| Scope | Created | Destroyed | Use for |
|---|---|---|---|
| `function` (default) | Before each test | After each test | Mutable state, in-memory data |
| `class` | Before first test in class | After last test in class | Shared class-level setup |
| `module` | Before first test in file | After last test in file | Expensive per-file setup |
| `session` | Once per test run | After all tests | DB connections, server processes |

```python
@pytest.fixture(scope="session")
def db_engine():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    yield engine
    engine.dispose()
```

## Teardown with `yield`

```python
@pytest.fixture
def temp_file(tmp_path):
    file = tmp_path / "test.txt"
    file.write_text("hello")
    yield file            # test receives the value
    file.unlink()         # teardown runs after test
```

## Fixture Factories

When you need multiple instances in one test:

```python
@pytest.fixture
def make_user():
    def _make(name: str = "Alice", role: str = "user") -> User:
        return User(id=uuid4(), name=name, role=role)
    return _make

def test_admin_can_delete(make_user):
    admin = make_user(role="admin")
    regular = make_user()
    ...
```

## Autouse Fixtures

Run automatically for every test in scope without explicit request:

```python
@pytest.fixture(autouse=True)
def reset_database(db_session):
    yield
    db_session.rollback()
```

## Monkeypatching

```python
def test_uses_env_variable(monkeypatch):
    monkeypatch.setenv("API_KEY", "test-key")
    monkeypatch.setattr("myapp.config.TIMEOUT", 5)
    ...
```

## tmp_path and tmp_path_factory

pytest provides `tmp_path` (function-scoped) and `tmp_path_factory` (session-scoped) built-in:

```python
def test_writes_file(tmp_path):
    output = tmp_path / "out.json"
    write_results(output)
    assert output.read_text() == '{"ok": true}'
```

## Useful Plugins

| Plugin | Purpose |
|---|---|
| `pytest-asyncio` | `async def` test functions |
| `pytest-mock` | `mocker` fixture wrapping `unittest.mock` |
| `pytest-cov` | Coverage reporting (`--cov`) |
| `pytest-xdist` | Parallel test execution (`-n auto`) |
| `freezegun` | Freeze `datetime.now()` in tests |
