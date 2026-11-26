// A stand-in for `claude` (run.mjs --claude), so selftest.mjs can prove the runner end to end with no
// model. It acts on one fact: is a catalog skill installed in the project? With one it writes a
// thorough test file, without one a thin file; asked only to explain, it writes nothing.
/* global process */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const prompt = args[args.indexOf('-p') + 1];
const model = args[args.indexOf('--model') + 1];
const emit = event => process.stdout.write(`${JSON.stringify(event)}\n`);
const skills = join(process.cwd(), '.claude', 'skills');

emit({ type: 'system', subtype: 'init', model });
let result = 'cart_total quantizes to two decimals because prices are in cents.';
if (!/just explain/i.test(prompt)) {
  const thorough = `import pytest
from decimal import Decimal
from cart.pricing import cart_total, line_total


@pytest.mark.parametrize("price, qty, expected", [(Decimal("1.00"), 2, Decimal("2.00"))])
def test_line_total(price, qty, expected):
    assert line_total(price, qty) == expected


def test_cart_total_applies_discount():
    assert cart_total([(Decimal("10.00"), 1)], discount_percent=10) == Decimal("9.00")


def test_negative_quantity_raises():
    with pytest.raises(ValueError):
        line_total(Decimal("1.00"), -1)
`;
  const thin = 'from cart.pricing import line_total\n\n\ndef test_runs():\n    line_total(1, 1)\n';
  mkdirSync(join(process.cwd(), 'tests'), { recursive: true });
  writeFileSync(
    join(process.cwd(), 'tests', 'test_pricing.py'),
    existsSync(skills) ? thorough : thin,
  );
  result = 'Added tests/test_pricing.py.';
}
emit({ type: 'result', is_error: false, num_turns: 2, total_cost_usd: 0.01, result });
