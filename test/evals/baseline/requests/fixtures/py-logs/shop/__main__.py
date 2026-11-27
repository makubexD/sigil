"""Entry point: `python -m shop`."""

import logging


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")


if __name__ == "__main__":
    main()
