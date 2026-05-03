import { notFound } from "next/navigation";
import Link from "next/link";
import { serverClient } from "@/lib/supabase";
import { getRule } from "@/lib/accountTypes";
import {
  aggregateByDay,
  computeCycleStats,
  fmtPct,
  fmtUsd
} from "@/lib/calculations";
import type { Account, Cycle, Trade } from "@/lib/types";
import { HudPanel } from "@/components/HudPanel";
import { KPICard } from "@/components/KPICard";
import { EquityCurve } from "@/components/EquityCurve";
import { TradeLedger } from "@/components/TradeLedger";
import { PayoutButton } from "@/components/PayoutButton";
import { ExportButton } from "@/components/ExportButton";
import { RuleBadge } from "@/components/RuleBadge";

export const dynamic = "force-dynamic";

interface Params {
  params: { account_number: string };
}

/**
 * Single-account dashboard page.
 *
 * Loads:
 *   1. account by account_number
 *   2. its active cycle (auto-creates one via the RPC if missing)
 *   3. all trades on that cycle
 *
 * Then computes stats locally so we can show consistency/eligibility hints
 * without round-tripping logic to the DB.
 */
export default async function AccountPage({ params }: Params) {
  const supabase = serverClient();

  // 1) account
  const { data: acct, error: aErr } = await supabase
    .from("accounts")
    .select("*")
    .eq("account_number", params.account_number)
    .maybeSingle();

  if (aErr) throw new Error(aErr.message);
  if (!acct) notFound();
  const account = acct as Account;
  const rule = getRule(account.account_type);

  // 2) ensure there's an active cycle (RPC is idempotent)
  await supabase.rpc("ensure_active_cycle", { p_account: account.id });

  const { data: cycleRow, error: cErr } = await supabase
    .from("cycles")
    .select("*")
    .eq("account_id", account.id)
    .eq("status", "active")
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (cErr) throw new Error(cErr.message);
  if (!cycleRow) throw new Error("No active cycle found.");
  const cycle = cycleRow as Cycle;

  // 3) trades for this cycle
  const { data: tradesRows, error: tErr } = await supabase
    .from("trades")
    .select("*")
    .eq("cycle_id", cycle.id)
    .order("date", { ascending: true });
  if (tErr) throw new Error(tErr.message);
  const trades = (tradesRows ?? []) as Trade[];

  // -------- compute everything --------
  const stats = computeCycleStats(
    trades,
    Number(account.initial_balance),
    rule,
    cycle.start_date
  );
  const daily = aggregateByDay(
    trades,
    Number(account.initial_balance),
    rule.min_daily_percent
  );

  return (
    <main className="space-y-8">
      {/* ---------------- HEADER ---------------- */}
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <Link href="/" className="text-[11px] uppercase tracking-[0.25em] text-hud-muted hover:text-hud-neon">
            ← All accounts
          </Link>
          <p className="mt-3 hud-label">Account #{account.account_number}</p>
          <h1 className="font-display text-4xl tracking-[0.2em] text-hud-neon">
            {account.name}
            <span className="ml-3 text-base text-hud-muted">· {account.owner}</span>
          </h1>
          <div className="mt-3"><RuleBadge rule={rule} /></div>
        </div>

        <div className="flex flex-col items-end gap-3">
          <div className="flex gap-2">
            <ExportButton accountNumber={account.account_number} />
            <PayoutButton
              accountNumber={account.account_number}
              eligible={stats.payout_eligible}
              blockedReasons={stats.reasons_blocked}
            />
          </div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-hud-muted">
            Cycle started {cycle.start_date} ·
            {" "}
            <span className="text-hud-neon">
              {stats.days_until_payout === 0
                ? "Window OPEN"
                : `${stats.days_until_payout}d to window`}
            </span>
          </p>
        </div>
      </header>

      <div className="hud-divider" />

      {/* ---------------- KPIs ---------------- */}
      <section className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        <KPICard
          label="Total PnL"
          value={fmtUsd(stats.total_pnl_usd)}
          hint={fmtPct(stats.total_pnl_percent)}
          tone={stats.total_pnl_usd >= 0 ? "win" : "loss"}
        />
        <KPICard
          label="Trading days"
          value={stats.trading_days}
          hint={`${stats.valid_trading_days} valid (≥ ${rule.min_daily_percent}%)`}
          tone={stats.min_days_ok ? "win" : "warn"}
        />
        <KPICard
          label={rule.consistency_type === "daily" ? "Best day share" : "Best trade share"}
          value={fmtPct(
            rule.consistency_type === "daily"
              ? stats.best_day_share_percent
              : stats.best_trade_share_percent,
            1
          )}
          hint={`Limit ${rule.consistency_value}%`}
          tone={stats.consistency_ok ? "win" : "loss"}
        />
        <KPICard
          label="Max drawdown"
          value={fmtUsd(stats.max_drawdown_usd)}
          hint={fmtPct(stats.max_drawdown_percent)}
          tone={stats.max_drawdown_usd === 0 ? "default" : "loss"}
        />
        <KPICard
          label="Trades"
          value={stats.total_trades}
          hint={`Initial $${Number(account.initial_balance).toLocaleString()}`}
        />
        <KPICard
          label="Payout"
          value={stats.payout_eligible ? "READY" : "LOCKED"}
          hint={stats.payout_eligible ? "All checks passed" : `${stats.reasons_blocked.length} blocker(s)`}
          tone={stats.payout_eligible ? "win" : "warn"}
          active={stats.payout_eligible}
        />
      </section>

      {/* ---------------- EQUITY CURVE ---------------- */}
      <HudPanel
        title="Equity curve"
        subtitle="Cumulative PnL across the active cycle"
      >
        <EquityCurve daily={daily} />
      </HudPanel>

      {/* ---------------- DAILY + TRADES + BLOCKERS ----------------
          Wrapping flex column with a viewport-bounded height on lg
          so the top row never grows past the screen and scrolling
          lives INSIDE each panel.

          - WRAPPER:    `flex flex-col` + `lg:h-[70vh] lg:min-h-[520px]`
                        gives a known bounded height the children can
                        flex against. `min-h-0` lets descendants
                        actually shrink (without it, flex-1 children
                        would still grow to fit content).
          - TOP ROW:    `grid grid-cols-3 flex-1 min-h-0` — flex-1
                        eats the wrapper height; min-h-0 + grid
                        align-items: stretch makes both panels
                        identical in height regardless of content.
          - PANELS:     `min-h-0` on each grid item so HudPanel's
                        internal `flex-1 min-h-0` body can actually
                        scroll instead of pushing the parent.
          - BLOCKERS:   below the grid, full-width, NO flex-1, NO
                        shrink, natural height. Sits inside the same
                        flex column so it stacks visually but does
                        not participate in the top-row alignment. */}
      <div className="flex min-h-0 flex-col gap-8 lg:h-[70vh] lg:min-h-[520px]">
        {/* TOP ROW — Daily + Ledger, same height, internal scroll */}
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-8 lg:grid-cols-3">
          <HudPanel
            title="Daily breakdown"
            className="min-h-0 lg:col-span-1"
            bodyClassName="overflow-y-auto pr-1"
          >
            {daily.length === 0 ? (
              <div className="flex flex-1 items-center justify-center text-hud-muted">
                No days yet.
              </div>
            ) : (
              <ul className="space-y-1 font-mono text-xs">
                {daily.map(d => (
                  <li
                    key={d.date}
                    className="flex items-center justify-between rounded px-2 py-1 hover:bg-hud-neon/5"
                  >
                    <span className="flex items-center gap-2 text-hud-text">
                      <span className={
                        "inline-block h-2 w-2 rounded-full " +
                        (d.is_valid ? "bg-hud-win shadow-neon-soft" : "bg-hud-muted/50")
                      }/>
                      {d.date}
                    </span>
                    <span className={
                      d.daily_pnl_usd > 0 ? "text-hud-win"
                      : d.daily_pnl_usd < 0 ? "text-hud-loss"
                      : "text-hud-muted"
                    }>
                      {fmtUsd(d.daily_pnl_usd)} · {fmtPct(d.daily_pnl_percent, 2)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </HudPanel>

          <HudPanel
            title="Trade ledger"
            className="min-h-0 lg:col-span-2"
            bodyClassName="overflow-hidden"
          >
            <TradeLedger account={account} cycle={cycle} initialTrades={trades} />
          </HudPanel>
        </div>

        {/* BOTTOM ROW — Payout blockers, full width, natural height.
            No flex-1, no shrink, no height constraint — just sits
            here at whatever size its content demands. */}
        {!stats.payout_eligible && stats.reasons_blocked.length > 0 && (
          <HudPanel
            title="Payout blockers"
            subtitle="Resolve these before requesting payout"
          >
            <ul className="list-disc space-y-1 pl-6 text-xs text-hud-muted">
              {stats.reasons_blocked.map(r => <li key={r}>{r}</li>)}
            </ul>
          </HudPanel>
        )}
      </div>
    </main>
  );
}
