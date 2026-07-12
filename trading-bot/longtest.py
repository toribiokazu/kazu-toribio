"""3-year walk-forward test of the futures profile on MEXC perp data."""
import copy
from pathlib import Path

import pandas as pd

from bot.backtest import run_backtest
from bot.config import load_config
from bot.data import load_csv

base = load_config("config.mexc-futures-paper.yaml")
data = {s: load_csv(Path("data_cache_swap_long")/(s.split(":")[0].replace("/","_")+".csv"))
        for s in base.exchange.symbol_list}
print(f"{len(data)} pairs, {len(data['BTC/USDT:USDT'])} bars "
      f"({data['BTC/USDT:USDT'].index[0].date()} .. {data['BTC/USDT:USDT'].index[-1].date()})\n")


def run(name, **mods):
    cfg = copy.deepcopy(base)
    for k, v in mods.items():
        obj = cfg.strategy if hasattr(cfg.strategy, k) else cfg.risk
        setattr(obj, k, v)
    res = run_backtest(data, cfg)
    m = res.metrics
    t = pd.DataFrame([vars(x) for x in res.trades])
    t.to_csv(f"lt_trades_{name.replace(' ', '_')}.csv", index=False)
    eq = res.equity_curve
    # half-year buckets of equity change (compounding-aware)
    buckets = eq.groupby(eq.index.to_period("6M") if hasattr(eq.index, "to_period") else None)
    hy = {}
    for per, seg in eq.groupby(pd.PeriodIndex(eq.index, freq="6M")):
        hy[str(per)] = (seg.iloc[-1] / seg.iloc[0] - 1) * 100
    print(f"== {name}: ret {m['total_return_pct']:+.2f}%  trades {m['n_trades']}  "
          f"win {m['win_rate_pct']:.0f}%  pf {m['profit_factor']:.2f}  "
          f"maxdd {m['max_drawdown_pct']:.1f}%  killed {m['halted_by_kill_switch']}")
    print("   half-years:", {k: round(v, 1) for k, v in hy.items()})
    return m


run("long-only", allow_shorts=False, regime_sma_bars=None)
run("long+short no gate", regime_sma_bars=None)
run("current (gate 180)")
