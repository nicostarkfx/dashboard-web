import type {
  AccountTypeRule,
  CycleStats,
  DailyAggregate,
  Trade
} from "./types";

/**
 * Aggregate a list of trades into per-day rows. Days are sorted ascending and
 * each row carries `is_valid` (did the day clear min_daily_percent of initial
 * balance?) and `cum_pnl_usd` (running equity from cycle start).
 */
export function aggregateByDay(
  trades: Trade[],
  initialBalance: number,
  minDailyPercent: number
): DailyAggregate[] {
  if (trades.length === 0) return [];

  const map = new Map<string, { pnlUsd: number; count: number }>();
  for (const t of trades) {
    // t.date may be a plain date (YYYY-MM-DD) or a full ISO timestamp.
    // Slice the first 10 chars so all trades on the same calendar day group.
    const key = (t.date ?? "").slice(0, 10);
    const cur = map.get(key) ?? { pnlUsd: 0, count: 0 };
    cur.pnlUsd += Number(t.pnl_usd);
    cur.count  += 1;
    map.set(key, cur);
  }

  const rows = Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => {
      const daily_pnl_percent = initialBalance === 0
        ? 0
        : (v.pnlUsd / initialBalance) * 100;
      return {
        date,
        trades_count:      v.count,
        daily_pnl_usd:     v.pnlUsd,
        daily_pnl_percent,
        is_valid:          daily_pnl_percent >= minDailyPercent,
        cum_pnl_usd:       0     // filled below
      } as DailyAggregate;
    });

  let running = 0;
  for (const r of rows) {
    running += r.daily_pnl_usd;
    r.cum_pnl_usd = running;
  }
  return rows;
}

/**
 * Max drawdown of a running-equity series, in USD and as a percent of the
 * initial balance. Pure peak-to-trough on the cumulative curve.
 */
export function maxDrawdown(
  daily: DailyAggregate[],
  initialBalance: number
): { usd: number; percent: number } {
  if (daily.length === 0) return { usd: 0, percent: 0 };

  let peak = 0;
  let maxDd = 0;
  for (const d of daily) {
    if (d.cum_pnl_usd > peak) peak = d.cum_pnl_usd;
    const dd = peak - d.cum_pnl_usd;
    if (dd > maxDd) maxDd = dd;
  }

  return {
    usd: maxDd,
    percent: initialBalance === 0 ? 0 : (maxDd / initialBalance) * 100
  };
}

/**
 * Days remaining in the current payout interval, counted from the FIRST
 * trade in the cycle (NOT from the cycle's `start_date` — that field is
 * effectively a bookkeeping column and may be set when the cycle row is
 * created rather than when trading actually began, which produced false
 * "wait N more days" blockers for traders who started long ago).
 *
 * Behaviour:
 *   - `firstTradeDate` is null/empty → the cycle hasn't started yet, so
 *     return the full interval (the caller already has a separate
 *     "no PnL" blocker that covers this case).
 *   - Otherwise return `max(0, payoutIntervalDays - daysSinceFirstTrade)`.
 *     Both dates are normalised to UTC midnight before subtracting so a
 *     timezone shift can't move the boundary by a day.
 */
export function daysUntilPayout(
  firstTradeDate: string | null | undefined,
  payoutIntervalDays: number,
  today: Date = new Date()
): number {
  if (!firstTradeDate) return payoutIntervalDays;

  // Trade dates are stored as ISO strings; first 10 chars give the date.
  const startKey = firstTradeDate.slice(0, 10);
  const start = new Date(startKey + "T00:00:00Z");
  if (isNaN(start.getTime())) return payoutIntervalDays;

  const todayUtc = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate()
  );
  const elapsed = Math.floor(
    (todayUtc - start.getTime()) / (1000 * 60 * 60 * 24)
  );
  return Math.max(0, payoutIntervalDays - elapsed);
}

/**
 * Earliest trade date (YYYY-MM-DD) across a list of trades, or null when
 * there are none. Used to drive the payout-window countdown.
 */
export function earliestTradeDate(trades: Trade[]): string | null {
  if (trades.length === 0) return null;
  let earliest = (trades[0].date ?? "").slice(0, 10);
  for (let i = 1; i < trades.length; i++) {
    const k = (trades[i].date ?? "").slice(0, 10);
    if (k && (!earliest || k < earliest)) earliest = k;
  }
  return earliest || null;
}

/**
 * Master computation. Given trades + the rule preset for the account, return
 * every KPI the dashboard cares about plus a `payout_eligible` flag and the
 * list of human-readable reasons why payout is blocked (if any).
 */
export function computeCycleStats(
  trades: Trade[],
  initialBalance: number,
  rule: AccountTypeRule,
  // Kept for backwards compatibility with existing callers; the actual
  // payout-window countdown is now driven by the first TRADE date, not
  // by the cycle row's `start_date`. Pass anything (or omit).
  _cycleStart?: string
): CycleStats {
  const daily = aggregateByDay(trades, initialBalance, rule.min_daily_percent);

  const total_pnl_usd     = trades.reduce((s, t) => s + Number(t.pnl_usd), 0);
  const total_pnl_percent = initialBalance === 0
    ? 0
    : (total_pnl_usd / initialBalance) * 100;

  const trading_days       = daily.length;
  const valid_trading_days = daily.filter(d => d.is_valid).length;

  const best_day = daily.reduce<DailyAggregate | null>(
    (best, d) => (best === null || d.daily_pnl_usd > best.daily_pnl_usd) ? d : best,
    null
  );
  const best_day_pnl_usd        = best_day?.daily_pnl_usd ?? 0;
  const best_day_share_percent  = total_pnl_usd > 0
    ? (best_day_pnl_usd / total_pnl_usd) * 100
    : 0;

  const best_trade = trades.reduce<Trade | null>(
    (best, t) => (best === null || Number(t.pnl_usd) > Number(best.pnl_usd)) ? t : best,
    null
  );
  const best_trade_pnl_usd       = best_trade ? Number(best_trade.pnl_usd) : 0;
  const best_trade_share_percent = total_pnl_usd > 0
    ? (best_trade_pnl_usd / total_pnl_usd) * 100
    : 0;

  const dd = maxDrawdown(daily, initialBalance);

  // -------------------- consistency rule --------------------
  // We only enforce consistency when the trader is actually in profit; a
  // negative-PnL cycle obviously cannot satisfy "best day <= X% of total".
  let consistency_ok = true;
  if (total_pnl_usd > 0) {
    if (rule.consistency_type === "daily") {
      consistency_ok = best_day_share_percent <= rule.consistency_value;
    } else {
      consistency_ok = best_trade_share_percent <= rule.consistency_value;
    }
  } else {
    consistency_ok = false; // no profit = nothing to pay out
  }

  const min_days_ok = valid_trading_days >= rule.min_days;

  // Payout-window countdown is anchored to the FIRST trade in the cycle.
  // - With trades: days_until_payout = max(0, interval - daysSinceFirstTrade).
  //   Once the interval has elapsed, the value is 0 and we DO NOT push a
  //   time-based blocker.
  // - Without trades: days_until_payout returns the full interval, but we
  //   skip pushing the time blocker because the "Cycle PnL is not positive"
  //   blocker already explains why payout is locked.
  const first_trade_date = earliestTradeDate(trades);
  const days_until_payout = daysUntilPayout(first_trade_date, rule.payout_interval_days);

  // -------------------- block reasons --------------------
  const reasons_blocked: string[] = [];
  if (total_pnl_usd <= 0) {
    reasons_blocked.push("Cycle PnL is not positive.");
  }
  if (!min_days_ok) {
    reasons_blocked.push(
      `Need ${rule.min_days} valid trading days (currently ${valid_trading_days}).`
    );
  }
  if (total_pnl_usd > 0 && !consistency_ok) {
    if (rule.consistency_type === "daily") {
      reasons_blocked.push(
        `Best day is ${best_day_share_percent.toFixed(1)}% of profit; max is ${rule.consistency_value}%.`
      );
    } else {
      reasons_blocked.push(
        `Best trade is ${best_trade_share_percent.toFixed(1)}% of profit; max is ${rule.consistency_value}%.`
      );
    }
  }
  // Only show the time blocker when there's an actual countdown in
  // progress — i.e. trades exist AND the window hasn't elapsed yet.
  if (first_trade_date && days_until_payout > 0) {
    reasons_blocked.push(
      `Payout window opens in ${days_until_payout} day${days_until_payout === 1 ? "" : "s"}.`
    );
  }

  const payout_eligible =
    total_pnl_usd > 0 &&
    consistency_ok &&
    min_days_ok &&
    days_until_payout === 0;

  return {
    total_pnl_usd,
    total_pnl_percent,
    total_trades: trades.length,
    trading_days,
    valid_trading_days,
    best_day_pnl_usd,
    best_day_share_percent,
    best_trade_pnl_usd,
    best_trade_share_percent,
    max_drawdown_usd: dd.usd,
    max_drawdown_percent: dd.percent,
    consistency_ok,
    min_days_ok,
    payout_eligible,
    reasons_blocked,
    days_until_payout
  };
}

/**
 * Format a number as a USD string. Negative values are wrapped with a sign so
 * the HUD can colour them red without re-parsing.
 */
export function fmtUsd(n: number): string {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  return `${sign}$${abs.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

export function fmtPct(n: number, digits = 2): string {
  return `${n >= 0 ? "" : "-"}${Math.abs(n).toFixed(digits)}%`;
}

/**
 * Convert a human account-size label like "3K", "25K PRO", "100K FUND"
 * (or a raw number like "5000") into USD. Returns 0 for unparseable input.
 */
export function parseAccountSize(s: string | null | undefined): number {
  if (!s) return 0;
  const trimmed = s.trim();
  const k = trimmed.match(/^(\d+(?:\.\d+)?)\s*[Kk]/);
  if (k) return parseFloat(k[1]) * 1000;
  const n = parseFloat(trimmed.replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Build a CSV string from trades + headline stats. Headers first, then trade
 * rows, then a stats block separated by a blank line.
 */
export function tradesToCsv(
  trades: Trade[],
  stats: CycleStats,
  accountLabel: string
): string {
  const escape = (v: unknown) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const header = ["date","pair","side","result","pnl_usd","pnl_percent"];
  const rows = trades.map(t => [
    t.date, t.pair, t.side, t.result, t.pnl_usd, t.pnl_percent
  ].map(escape).join(","));

  const statBlock = [
    "",
    `# Account,${escape(accountLabel)}`,
    `# Total PnL USD,${stats.total_pnl_usd}`,
    `# Total PnL %,${stats.total_pnl_percent}`,
    `# Trading days,${stats.trading_days}`,
    `# Valid trading days,${stats.valid_trading_days}`,
    `# Best day USD,${stats.best_day_pnl_usd}`,
    `# Best day share %,${stats.best_day_share_percent}`,
    `# Best trade USD,${stats.best_trade_pnl_usd}`,
    `# Best trade share %,${stats.best_trade_share_percent}`,
    `# Max drawdown USD,${stats.max_drawdown_usd}`,
    `# Max drawdown %,${stats.max_drawdown_percent}`,
    `# Payout eligible,${stats.payout_eligible}`
  ].join("\n");

  return [header.join(","), ...rows, statBlock].join("\n");
}
