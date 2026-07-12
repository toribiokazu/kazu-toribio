import pandas as pd
import pytest

from bot.config import BotConfig, StrategyConfig, load_config
from bot.data import synthetic_ohlcv
from bot.indicators import add_indicators
from bot.strategy import PriceActionStrategy


def _signals(cfg: StrategyConfig, df: pd.DataFrame):
    strat = PriceActionStrategy(cfg)
    data = add_indicators(df, cfg)
    start = cfg.ema_slow + cfg.swing_right + 5
    return data, {i: strat.evaluate(data, i) for i in range(start, len(data))}


def test_gate_matches_sma_rule_bar_by_bar():
    raw = synthetic_ohlcv(n=1200, seed=9)
    base_cfg = StrategyConfig(allow_shorts=True)
    gated_cfg = StrategyConfig(allow_shorts=True, regime_sma_bars=120)

    _, base_sigs = _signals(base_cfg, raw)
    data, gated_sigs = _signals(gated_cfg, raw)

    n_base = sum(s is not None for s in base_sigs.values())
    assert n_base > 0, "synthetic data produced no setups to gate"
    for i, sig in base_sigs.items():
        if sig is None:
            assert gated_sigs[i] is None
            continue
        sma = data["regime_sma"].iat[i]
        close = data["close"].iat[i]
        allowed = (
            not pd.isna(sma)
            and (close > sma if sig.direction > 0 else close < sma)
        )
        assert (gated_sigs[i] is not None) == allowed
    n_gated = sum(s is not None for s in gated_sigs.values())
    assert n_gated < n_base  # the gate must actually veto something


def test_gate_blocks_everything_without_enough_history():
    raw = synthetic_ohlcv(n=400, seed=9)
    cfg = StrategyConfig(allow_shorts=True, regime_sma_bars=500)  # > data length
    _, sigs = _signals(cfg, raw)
    assert all(s is None for s in sigs.values())


def test_regime_sma_bars_validated():
    cfg = BotConfig()
    cfg.strategy.regime_sma_bars = 1
    with pytest.raises(ValueError, match="regime_sma_bars"):
        cfg.validate()


def test_futures_profile_enables_gate():
    cfg = load_config("config.mexc-futures-paper.yaml")
    assert cfg.strategy.regime_sma_bars == 180
