"""The users table."""

import sqlite3


def connect() -> sqlite3.Connection:
    """An in-memory database with the users table and a few rows."""
    conn = sqlite3.connect(":memory:")
    conn.execute("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL)")
    conn.executemany(
        "INSERT INTO users (id, name) VALUES (?, ?)",
        [(1, "ada"), (2, "grace"), (3, "ada"), (4, "o'brien")],
    )
    return conn
