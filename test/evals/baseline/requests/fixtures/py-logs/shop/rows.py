"""Cleans rows from a supplier's price list."""

from dataclasses import dataclass


@dataclass
class Row:
    sku: str
    price: int | None
