"""Imports orders into the warehouse system."""

from collections.abc import Callable
from dataclasses import dataclass


@dataclass
class OrderRow:
    id: str
    total: int


SaveOrder = Callable[[OrderRow], None]
"""Writes one order to the warehouse system. Raises ValueError when the warehouse refuses it."""
