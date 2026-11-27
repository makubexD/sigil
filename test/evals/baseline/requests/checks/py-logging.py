"""Hidden behaviour tests for requests/py-logging.json (README, Grading).

    python py-logging.py <case>     (cwd: the project a run left behind)

Each case imports the module the request asked for, runs it, and reads what reached the `logging`
module and what was printed.
"""

import contextlib
import io
import logging
import os
import sys
import threading

PASSWORD = "correct-horse-battery"
TOKEN = "tok_live_9f8e7d6c5b4a"
STANDARD = set(logging.LogRecord("n", 0, "p", 0, "m", (), None).__dict__) | {"message", "asctime", "taskName"}


class Capture(logging.Handler):
    def __init__(self):
        super().__init__(logging.DEBUG)
        self.records = []

    def emit(self, record):
        self.records.append(record)


def capture(call):
    """Runs `call`; returns the records it logged, what it printed, and its result or error."""
    handler = Capture()
    root = logging.getLogger()
    root.addHandler(handler)
    root.setLevel(logging.DEBUG)
    printed = io.StringIO()
    result = error = None
    with contextlib.redirect_stdout(printed), contextlib.redirect_stderr(printed):
        try:
            result = call()
        except Exception as caught:
            error = caught
    root.removeHandler(handler)
    return handler.records, printed.getvalue(), result, error


def extras(record):
    return {key: value for key, value in record.__dict__.items() if key not in STANDARD}


def dump(record):
    return " | ".join([record.getMessage(), repr(record.args), repr(extras(record)), repr(record.exc_info)])


def serious(records):
    return [record for record in records if record.levelno >= logging.INFO]


def rows(n):
    from shop.orders import OrderRow

    return [OrderRow(id=f"o{i}", total=i) for i in range(n)]


def orders_works():
    from shop.orders import import_orders

    saved = []

    def save(row):
        if row.id == "o1":
            raise ValueError("refused")
        saved.append(row.id)

    _, _, _, error = capture(lambda: import_orders(rows(4), save))
    assert error is None, repr(error)
    assert saved == ["o0", "o2", "o3"], saved


def orders_uses_logging():
    from shop.orders import import_orders

    records, printed, _, _ = capture(lambda: import_orders(rows(4), lambda row: None))
    assert records, "nothing was logged"
    assert not printed.strip(), f"printed: {printed[:80]!r}"


def orders_quiet_loop():
    from shop.orders import import_orders

    records, _, _, _ = capture(lambda: import_orders(rows(300), lambda row: None))
    loud = len(serious(records))
    assert loud <= 10, f"{loud} records at INFO or above for 300 orders"


class Gateway:
    def __init__(self, fail):
        self.fail = fail

    def charge(self, order_id, total):
        from shop.billing import Receipt

        if self.fail:
            raise RuntimeError("card declined by issuer")
        return Receipt(order_id=order_id, reference="ref-1")


def charge_works():
    from shop.billing import Order, charge_card

    _, _, receipt, error = capture(lambda: charge_card(Order(id="o1", total=500), Gateway(False)))
    assert error is None, repr(error)
    assert receipt.reference == "ref-1"
    _, _, _, error = capture(lambda: charge_card(Order(id="o1", total=500), Gateway(True)))
    assert error is not None, "the caller cannot see the failure"


def charge_logs_traceback():
    from shop.billing import Order, charge_card

    records, _, _, _ = capture(lambda: charge_card(Order(id="o1", total=500), Gateway(True)))
    failures = [record for record in records if record.levelno >= logging.WARNING]
    assert failures, "the failure was not logged at WARNING or above"
    assert any(record.exc_info and record.exc_info[0] for record in failures), (
        "the failure was logged without its traceback"
    )


def login_request():
    from shop.login import LoginRequest

    return LoginRequest(
        username="ada",
        password=PASSWORD,
        ip="203.0.113.9",
        headers={"User-Agent": "curl/8", "Authorization": f"Bearer {TOKEN}"},
    )


def login_works():
    from shop.login import login

    _, _, accepted, error = capture(lambda: login(login_request(), lambda user, password: password == PASSWORD))
    assert error is None and accepted is True, (accepted, error)
    _, _, accepted, error = capture(lambda: login(login_request(), lambda user, password: False))
    assert error is None and accepted is False, (accepted, error)


def login_no_secrets():
    from shop.login import login

    for answer in [True, False]:
        records, printed, _, _ = capture(lambda: login(login_request(), lambda user, password: answer))
        assert records, "nothing was logged"
        shown = printed + " ".join(dump(record) for record in records)
        assert PASSWORD not in shown, "the password was logged"
        assert TOKEN not in shown, "the authorization header was logged"


def price_rows():
    from shop.rows import Row

    return [Row(sku="a", price=100), Row(sku="", price=5), Row(sku="b", price=None), Row(sku="c", price=7)] + [
        Row(sku=f"s{i}", price=i + 1) for i in range(35)
    ]


def rows_works():
    from shop.rows import normalize_rows

    _, _, kept, error = capture(lambda: normalize_rows(price_rows()))
    assert error is None, repr(error)
    assert len(kept) == 37 and all(row.sku and row.price is not None for row in kept), len(kept)


def rows_counts_not_in_string():
    from shop.rows import normalize_rows

    records, _, _, _ = capture(lambda: normalize_rows(price_rows()))
    assert records, "nothing was logged"

    def carries(record, number):
        values = list(extras(record).values())
        args = record.args
        values += list(args.values()) if isinstance(args, dict) else list(args or ())
        return number in values

    assert any(carries(record, 37) for record in records), (
        "the kept count is formatted into the message, not passed as an argument or a field"
    )


def sync_works():
    from shop.sync import Item, sync_inventory

    pushed = []
    items = [Item(sku="a", stock=1), Item(sku="b", stock=2)]
    _, _, _, error = capture(lambda: sync_inventory(items, lambda item: pushed.append(item.sku)))
    assert error is None, repr(error)
    assert pushed == ["a", "b"], pushed


def sync_uses_logging():
    from shop.sync import Item, sync_inventory

    records, printed, _, _ = capture(lambda: sync_inventory([Item(sku="a", stock=1)], lambda item: None))
    assert len(records) >= 2, f"{len(records)} records for a start and a finish"
    assert not printed.strip(), f"printed: {printed[:80]!r}"


def sync_does_not_configure():
    root = logging.getLogger()
    before = (list(root.handlers), root.level)
    from shop.sync import Item, sync_inventory

    with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
        sync_inventory([Item(sku="a", stock=1)], lambda item: None)
    assert (list(root.handlers), root.level) == before, "the module configured logging itself"


def cents_works():
    from shop.money import to_cents

    assert to_cents(12.5) == 1250
    assert to_cents(0.29) == 29


CASES = {
    "orders-works": orders_works,
    "orders-uses-logging": orders_uses_logging,
    "orders-quiet-loop": orders_quiet_loop,
    "charge-works": charge_works,
    "charge-logs-traceback": charge_logs_traceback,
    "login-works": login_works,
    "login-no-secrets": login_no_secrets,
    "rows-works": rows_works,
    "rows-counts-not-in-string": rows_counts_not_in_string,
    "sync-works": sync_works,
    "sync-uses-logging": sync_uses_logging,
    "sync-does-not-configure": sync_does_not_configure,
    "cents-works": cents_works,
}


def main():
    name = sys.argv[1]
    sys.path.insert(0, ".")
    sys.dont_write_bytecode = True
    # A case that hangs (a worker that cannot be cancelled, a call with no deadline) fails here.
    watchdog = threading.Timer(25, lambda: (print(f"{name}: timed out", flush=True), os._exit(1)))
    watchdog.daemon = True
    watchdog.start()
    try:
        CASES[name]()
    except BaseException as error:  # a failed case is any exception, an assert included
        print(f"{name}: {type(error).__name__}: {error}")
        sys.stdout.flush()
        os._exit(1)
    sys.stdout.flush()
    os._exit(0)


if __name__ == "__main__":
    main()
