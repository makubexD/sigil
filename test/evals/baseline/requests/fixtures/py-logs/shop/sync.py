"""Pushes stock levels to the storefront."""

from collections.abc import Callable
from dataclasses import dataclass


@dataclass
class Item:
    sku: str
    stock: int


Push = Callable[[Item], None]
"""Sends one item's stock level to the storefront."""


def describe(items: list[Item]) -> None:
    print(f"{len(items)} items")
    for item in items:
        print(f"  {item.sku}: {item.stock}")
    print("done")
