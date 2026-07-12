"""Refinement matrix on the 3-year perp data: which use of the slow-trend
gate survives a full cycle? Yearly buckets expose regime dependence."""
import copy
from pathlib import Path

import pandas as pd

import bot.backtest as bt
from bot.config import load_config
from bot.data import load_csv
from bot.strategy import PriceActionStrategy

base = load_config("config.mexc-futures-paper.yaml")
base.strategy.regime_sma_bars = None  # variants opt in explicitly
data = {s: load_csv(Path("data_cache_swap_long")/(s.split(":")[0].replace("/","_")+".csv"))
        for s in base.exchange.symbol_list}


def gated(n=180, side="both", atr_buf=0.0):
    cache: dict[int, pd.Series] = {}

    class W(PriceActionStrategy):
        def evaluate(self, df, i):
            sig = super().evaluate(df, i)
            if sig is None:
                return None
            gate_this = side == "both" or (side == "shorts") == (sig.direction < 0)
            if not gate_this:
                return sig
            key = id(df)
            if key not in cache:
                cache[key] = df["close"].rolling(n, min_periods=n).mean()
            sma = cache[key].iat[i]
            if pd.isna(sma):
                return None
            px = df["close"].iat[i]
            buf = atr_buf * df["atr"].iat[i]
            ok = px > sma + buf if sig.direction > 0 else px < sma - buf
            return sig if ok else None
    return W


def run(name, W=None, shorts=True):
    cfg = copy.deepcopy(base)
    cfg.strategy.allow_shorts = shorts
    orig = bt.PriceActionStrategy
    if W:
        bt.PriceActionStrategy = W
    try:
        res = bt.run_backtest(data, cfg)
    finally:
        bt.PriceActionStrategy = orig
    m = res.metrics
    eq = res.equity_curve
    yearly = {}
    for y, seg in eq.groupby(eq.index.year):
        yearly[y] = round((seg.iloc[-1] / seg.iloc[0] - 1) * 100, 1)
    print(f"{name:34s} ret {m['total_return_pct']:+7.2f}%  pf {m['profit_factor']:.2f}  "
          f"dd {m['max_drawdown_pct']:4.1f}%  n {m['n_trades']:3d}  "
          f"killed {str(m['halted_by_kill_switch']):5s}  yearly {yearly}", flush=True)


run("long-only", shorts=False)
run("L+S no gate")
run("L+S shorts gated sma180", gated(180, "shorts"))
run("L+S shorts gated sma180 +1ATR", gated(180, "shorts", 1.0))
run("L+S shorts gated sma300", gated(300, "shorts"))
run("L+S shorts gated sma300 +1ATR", gated(300, "shorts", 1.0))
run("L+S both gated sma180 +1ATR", gated(180, "both", 1.0))
run("long-only gated sma180", gated(180, "both"), shorts=False)
