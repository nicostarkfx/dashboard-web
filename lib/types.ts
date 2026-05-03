// Shared types mirroring the Supabase schema.
export type ConsistencyKind = "daily" | "trade";
export type CycleStatus     = "active" | "closed";
export type TradeDirection  = "long" | "short";
export type TradeResult     = "win" | "loss" | "breakeven";

export interface AccountTypeRule {
  code: string;
  label: string;
  payout_interval_days: number;
  consistency_type: ConsistencyKind;
  consistency_value: number;   // percent (e.g. 15 means 15%)
  min_days: number;
  min_daily_percent: number;   // percent (e.g. 0.5 means 0.5%)
}

export interface Account {
  id: string;
  name: string;                 // legacy display label (kept for back-compat)
  account_number: string;
  owner: string;                // legacy combined field (kept for back-compat)
  account_type: string;
  initial_balance: number;
  created_at: string;

  // Structured fields used by current and future trading logic.
  // Optional/nullable so older rows that haven't been backfilled still load.
  account_size: string | null;  // e.g. "3K", "25K"
  owner_name:   string | null;
  company:      string | null;
}

export interface Cycle {
  id: string;
  account_id: string;
  start_date: string;
  end_date: string | null;
  status: CycleStatus;
  closed_pnl_usd: number | null;
  closed_pnl_percent: number | null;
  created_at: string;
}

export interface Trade {
  id: string;
  account_id: string;
  cycle_id: string;
  date: string;
  pair: string;
  side: TradeDirection;
  result: TradeResult;
  pnl_usd: number;
  pnl_percent: number;
  created_at: string;
}

export interface DailyAggregate {
  date: string;
  trades_count: number;
  daily_pnl_usd: number;
  daily_pnl_percent: number;
  is_valid: boolean;        // hit min_daily_percent
  cum_pnl_usd: number;      // running equity
}

export interface CycleStats {
  total_pnl_usd: number;
  total_pnl_percent: number;
  total_trades: number;
  trading_days: number;
  valid_trading_days: number;
  best_day_pnl_usd: number;
  best_day_share_percent: number;     // best day / total profit
  best_trade_pnl_usd: number;
  best_trade_share_percent: number;   // best trade / total profit
  max_drawdown_usd: number;
  max_drawdown_percent: number;
  consistency_ok: boolean;
  min_days_ok: boolean;
  payout_eligible: boolean;
  reasons_blocked: string[];
  days_until_payout: number;          // days remaining in payout interval
}
