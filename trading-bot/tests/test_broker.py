import pytest

from bot.broker import PaperBroker


def test_partial_close_banks_profit_and_reduces_qty():
    b = PaperBroker(starting_cash=1000.0, fee_pct=0.0, slippage_pct=0.0)
    pos = b.open_position("BTC/USDT", +1, qty=1.0, price=100.0, stop=95.0, risk_amount=5.0)
    assert b.cash == pytest.approx(900.0)

    fill = b.close_partial(pos.id, qty=0.7, price=105.0)  # +1R on 70%
    assert fill.qty == pytest.approx(0.7)
    assert pos.qty == pytest.approx(0.3)
    assert pos.realized_pnl == pytest.approx(0.7 * 5.0)
    assert b.cash == pytest.approx(900.0 + 0.7 * 105.0)

    b.close_position(pos.id, price=110.0)  # runner exits at +2R
    assert b.cash == pytest.approx(900.0 + 0.7 * 105.0 + 0.3 * 110.0)
    # total pnl: 0.7*5 + 0.3*10 = 6.5 on a 5-risk trade = +1.3R blended
    assert b.cash - 1000.0 == pytest.approx(6.5)


def test_partial_close_cannot_exceed_position():
    b = PaperBroker(starting_cash=1000.0, fee_pct=0.0, slippage_pct=0.0)
    pos = b.open_position("BTC/USDT", +1, qty=1.0, price=100.0, stop=95.0, risk_amount=5.0)
    fill = b.close_partial(pos.id, qty=5.0, price=105.0)
    assert fill.qty == pytest.approx(1.0)
    assert pos.qty == pytest.approx(0.0)


def test_fees_and_slippage_charged_on_partial():
    b = PaperBroker(starting_cash=1000.0, fee_pct=0.1, slippage_pct=0.1)
    pos = b.open_position("BTC/USDT", +1, qty=1.0, price=100.0, stop=95.0, risk_amount=5.0)
    fill = b.close_partial(pos.id, qty=0.5, price=105.0)
    assert fill.price < 105.0  # slippage against us
    assert fill.fee > 0.0
