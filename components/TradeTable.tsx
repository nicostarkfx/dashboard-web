import type { Trade } from "@/lib/types";
import { fmtPct, fmtUsd } from "@/lib/calculations";

interface Props {
  trades: Trade[];
}

/**
 * Compact, monospace trade ledger. Newest first.
 */
export function TradeTable({ trades }: Props) {
  if (trades.length === 0) {
    return (
      <div className="py-12 text-center text-hud-muted">
        No trades recorded for this cycle.
      </div>
    );
  }

  const sorted = [...trades].sort(
    (a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at)
  );

  return (
    <div className="max-h-[420px] overflow-auto">
      <table className="w-full text-left font-mono text-xs">
        <thead className="sticky top-0 bg-hud-panel/95 text-hud-muted">
          <tr className="border-b border-hud-border">
            <th className="px-3 py-2 font-normal uppercase tracking-[0.18em]">Date</th>
            <th className="px-3 py-2 font-normal uppercase tracking-[0.18em]">Pair</th>
            <th className="px-3 py-2 font-normal uppercase tracking-[0.18em]">Side</th>
            <th className="px-3 py-2 font-normal uppercase tracking-[0.18em]">Result</th>
            <th className="px-3 py-2 text-right font-normal uppercase tracking-[0.18em]">PnL $</th>
            <th className="px-3 py-2 text-right font-normal uppercase tracking-[0.18em]">PnL %</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((t) => {
            const positive = Number(t.pnl_usd) > 0;
            const negative = Number(t.pnl_usd) < 0;
            return (
              <tr
                key={t.id}
                className="border-b border-hud-border/40 hover:bg-hud-neon/5"
              >
                <td className="px-3 py-2 text-hud-text">{t.date}</td>
                <td className="px-3 py-2 text-hud-accent">{t.pair}</td>
                <td className="px-3 py-2 uppercase text-hud-muted">{t.side}</td>
                <td className={
                  "px-3 py-2 uppercase " +
                  (t.result === "win" ? "text-hud-win"
                    : t.result === "loss" ? "text-hud-loss"
                    : "text-hud-muted")
                }>
                  {t.result}
                </td>
                <td className={
                  "px-3 py-2 text-right " +
                  (positive ? "text-hud-win" : negative ? "text-hud-loss" : "text-hud-muted")
                }>
                  {fmtUsd(Number(t.pnl_usd))}
                </td>
                <td className={
                  "px-3 py-2 text-right " +
                  (positive ? "text-hud-win" : negative ? "text-hud-loss" : "text-hud-muted")
                }>
                  {fmtPct(Number(t.pnl_percent), 3)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
