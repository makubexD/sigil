"""Opens the connection to the accounts database."""

from dataclasses import dataclass


class DatabaseError(Exception):
    """Raised when the database cannot be reached or the DSN cannot be read."""


@dataclass
class Connection:
    host: str
    port: int
    user: str
    name: str


def open_connection(host: str, port: int, user: str, password: str, name: str) -> Connection:
    """The driver call. Raises ConnectionRefusedError when the host refuses the connection."""
    if host.endswith(".down"):
        raise ConnectionRefusedError(f"connection to {host}:{port} refused")
    return Connection(host=host, port=port, user=user, name=name)
