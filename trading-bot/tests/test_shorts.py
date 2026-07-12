import pytest

from bot.broker import CcxtBroker, PaperBroker, Position
from bot.config import load_config


def test_paper_short_profits_when_price_falls():
    b = PaperBroker(starting_cash=1000.0, fee_pct=0.0, slippage_pct=0.0)
    pos = b.open_position("BTC/USDT:USDT", -1, qty=1.0, price=100.0, stop=105.0, risk_amount=5.0)
    assert b.cash == pytest.approx(900.0)  # notional reserved as collateral
    assert b.equity(100.0) == pytest.approx(1000.0)
    assert b.equity(90.0) == pytest.approx(1010.0)  # +10 unrealized on the short
    assert b.equity(110.0) == pytest.approx(990.0)

    b.close_position(pos.id, price=90.0)
    assert b.cash == pytest.approx(1010.0)


def test_paper_short_partial_cover_banks_profit():
    b = PaperBroker(starting_cash=1000.0, fee_pct=0.0, slippage_pct=0.0)
    pos = b.open_position("ETH/USDT:USDT", -1, qty=2.0, price=100.0, stop=105.0, risk_amount=10.0)
    fill = b.close_partial(pos.id, qty=1.0, price=95.0)  # cover half at +1R
    assert fill.qty == pytest.approx(1.0)
    assert pos.qty == pytest.approx(1.0)
    assert pos.realized_pnl == pytest.approx(5.0)
    b.close_position(pos.id, price=90.0)
    assert b.cash == pytest.approx(1000.0 + 5.0 + 10.0)


def test_ccxt_broker_equity_marks_shorts():
    b = object.__new__(CcxtBroker)  # skip __init__: no network, no keys
    b._last_quote_balance = 500.0
    b.positions = {
        "L": Position(id="L", symbol="BTC/USDT:USDT", direction=+1, qty=2.0,
                      entry=100.0, initial_stop=95.0, stop=95.0,
                      best_price=100.0, risk_amount=10.0),
        "S": Position(id="S", symbol="ETH/USDT:USDT", direction=-1, qty=3.0,
                      entry=50.0, initial_stop=55.0, stop=55.0,
                      best_price=50.0, risk_amount=15.0),
    }
    marks = {"BTC/USDT:USDT": 110.0, "ETH/USDT:USDT": 40.0}
    # long: 2*110 = 220; short: 3*(2*50 - 40) = 180 (collateral 150 + pnl 30)
    assert b.equity(marks) == pytest.approx(500.0 + 220.0 + 180.0)


def test_futures_paper_profile_loads():
    cfg = load_config("config.mexc-futures-paper.yaml")
    # long-only by design: every shorts configuration lost the 3-year
    # walk-forward; allow_shorts is a manual bear-regime switch
    assert cfg.strategy.allow_shorts is False
    assert cfg.risk.fee_pct == pytest.approx(0.02)
    assert all(s.endswith(":USDT") for s in cfg.exchange.symbol_list)
    assert "FIL/USDT:USDT" not in cfg.exchange.symbol_list  # no perp on MEXC
