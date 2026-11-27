"""Card payments."""

from dataclasses import dataclass
from typing import Protocol


@dataclass
class Order:
    id: str
    total: int


@dataclass
class Receipt:
    order_id: str
    reference: str


class Gateway(Protocol):
    def charge(self, order_id: str, total: int) -> Receipt:
        """Charges the card on file. Raises RuntimeError when the charge fails."""
        ...
