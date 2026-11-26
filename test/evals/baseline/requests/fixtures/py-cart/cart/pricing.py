"""Cart pricing."""

from decimal import Decimal


def line_total(unit_price: Decimal, quantity: int) -> Decimal:
    """Price of one cart line."""
    if quantity < 0:
        raise ValueError("quantity must not be negative")
    return unit_price * quantity


def cart_total(lines: list[tuple[Decimal, int]], discount_percent: int = 0) -> Decimal:
    """Total of every line, less a whole-percent discount."""
    if not 0 <= discount_percent <= 100:
        raise ValueError("discount_percent must be between 0 and 100")
    subtotal = sum((line_total(price, qty) for price, qty in lines), Decimal("0"))
    return (subtotal * (100 - discount_percent) / 100).quantize(Decimal("0.01"))
