"""Page visits, for the analytics report."""


class Store:
    """Where visits are kept. `save` talks to the analytics database."""

    def __init__(self) -> None:
        self.saved: list[str] = []

    async def save(self, page: str) -> None:
        self.saved.append(page)


store = Store()
