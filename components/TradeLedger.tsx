"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Account, Cycle, Trade } from "@/lib/types";
import { fmtPct, fmtUsd } from "@/lib/calculations";
import { browserClient } from "@/lib/supabase";
import { AddTradeModal } from "./AddTradeModal";

interface Props {
  account: Account;
  cycle: Cycle;
  initialTrades: Trade[];
}

/**
 * Trade ledger panel:
 *   - "+ New Trade" button (top-right)
 *   - color-coded ledger table
 *   - per-row delete with inline "Delete? Yes / No" confirmation
 *   - on insert/delete: optimistically update local state, then router.refresh()
 *     so the server component re-runs and every KPI / equity curve /
 *     consistency check picks up the change automatically.
 */
export function TradeLedger({ account, cycle, initialTrades }: Props) {
  const router = useRouter();
  const [trades, setTrades] = useState<Trade[]>(initialTrades);
  const [showModal, setShowModal] = useState(false);

  // Per-row delete state. Using id-keyed records so multiple rows can never
  // step on each other if the user is fast.
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [deletingId,   setDeletingId]   = useState<string | null>(null);
  const [errorById,    setErrorById]    = useState<Record<string, string>>({});

  // Snapshot the ids that were already in the ledger at mount. Anything
  // inserted during this session is "new" and will play the fade-up
  // animation. Initial rows render statically so page load doesn't shimmer.
  const initialIdsRef = useRef<Set<string>>(
    new Set(initialTrades.map((t) => t.id))
  );

  function handleCreated(t: Trade) {
    setTrades(prev => [...prev, t]);
    setShowModal(false);
    router.refresh();
  }

  async function confirmDelete(tradeId: string) {
    setDeletingId(tradeId);
    setErrorById(prev => {
      const next = { ...prev };
      delete next[tradeId];
      return next;
    });

    const supabase = browserClient();
    const { error } = await supabase
      .from("trades")
      .delete()
      .eq("id", tradeId);

    setDeletingId(null);

    if (error) {
      setErrorById(prev => ({ ...prev, [tradeId]: error.message }));
      return;
    }

    // Optimistic prune + force the server component to re-fetch so KPIs,
    // equity curve, daily breakdown, payout eligibility all re-derive.
    setTrades(prev => prev.filter(t => t.id !== tradeId));
    setConfirmingId(null);
    router.refresh();
  }

  const sorted = [...trades].sort(
    (a, b) =>
      b.date.localeCompare(a.date) ||
      b.created_at.localeCompare(a.created_at)
  );

  return (
    <>
      {/* Inner flex column so the action bar stays pinned and the table
          claims all leftover height. The outer HudPanel body is already
          `flex flex-1 min-h-0 flex-col`, so this child just needs to do
          the same to chain the constraint down to the scroll container. */}
      <div className="flex flex-1 min-h-0 flex-col">
        <div className="mb-3 flex shrink-0 items-center justify-end">
          <button
            className="hud-button"
            onClick={() => setShowModal(true)}
            aria-label="Add trade"
          >
            <span className="text-base leading-none">+</span> New Trade
          </button>
        </div>

        {sorted.length === 0 ? (
          <div className="flex flex-1 items-center justify-center text-hud-muted">
            No trades recorded for this cycle.
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto">
            <table className="w-full text-left font-mono text-xs">
            <thead className="sticky top-0 bg-hud-panel/95 text-hud-muted">
              <tr className="border-b border-hud-border">
                <th className="px-3 py-2 font-normal uppercase tracking-[0.18em]">Date</th>
                <th className="px-3 py-2 font-normal uppercase tracking-[0.18em]">Pair</th>
                <th className="px-3 py-2 font-normal uppercase tracking-[0.18em]">Side</th>
                <th className="px-3 py-2 font-normal uppercase tracking-[0.18em]">Result</th>
                <th className="px-3 py-2 text-right font-normal uppercase tracking-[0.18em]">PnL $</th>
                <th className="px-3 py-2 text-right font-normal uppercase tracking-[0.18em]">PnL %</th>
                <th className="px-3 py-2 text-right font-normal uppercase tracking-[0.18em] w-[1%]" aria-label="Actions"></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((t) => {
                const pnl = Number(t.pnl_usd);
                const positive = pnl > 0;
                const negative = pnl < 0;
                const pnlClass = positive
                  ? "text-hud-win"
                  : negative
                    ? "text-hud-loss"
                    : "text-hud-muted";
                const isConfirming = confirmingId === t.id;
                const isDeleting   = deletingId   === t.id;
                const rowError     = errorById[t.id];
                const isFresh      = !initialIdsRef.current.has(t.id);

                return (
                  <tr
                    key={t.id}
                    className={
                      "border-b border-hud-border/40 transition-colors duration-200 hover:bg-hud-neon/5 " +
                      (isDeleting ? "opacity-50 " : "") +
                      (isFresh ? "animate-fade-up " : "")
                    }
                  >
                    <td className="px-3 py-2 text-hud-text">{formatTradeDate(t.date)}</td>
                    <td className="px-3 py-2 text-hud-accent">{t.pair}</td>
                    <td className="px-3 py-2 uppercase text-hud-muted">{t.side}</td>
                    <td className={
                      "px-3 py-2 uppercase " +
                      (t.result === "win"
                        ? "text-hud-win"
                        : t.result === "loss"
                          ? "text-hud-loss"
                          : "text-hud-muted")
                    }>
                      {t.result}
                    </td>
                    <td className={`px-3 py-2 text-right ${pnlClass}`}>
                      {fmtUsd(pnl)}
                    </td>
                    <td className={`px-3 py-2 text-right ${pnlClass}`}>
                      {fmtPct(Number(t.pnl_percent), 3)}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {isConfirming ? (
                        <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.18em]">
                          <span className="text-hud-muted">Delete?</span>
                          <button
                            type="button"
                            onClick={() => confirmDelete(t.id)}
                            disabled={isDeleting}
                            className="rounded border border-hud-loss/60 px-2 py-0.5 text-hud-loss hover:bg-hud-loss/10 disabled:opacity-50"
                            aria-label="Confirm delete"
                          >
                            {isDeleting ? "…" : "Yes"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmingId(null)}
                            disabled={isDeleting}
                            className="rounded border border-hud-border px-2 py-0.5 text-hud-muted hover:bg-hud-neon/5 disabled:opacity-50"
                            aria-label="Cancel delete"
                          >
                            No
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmingId(t.id)}
                          className="rounded border border-transparent px-1.5 py-0.5 text-hud-muted hover:border-hud-loss/40 hover:text-hud-loss focus:border-hud-loss/60 focus:outline-none"
                          aria-label={`Delete trade ${t.pair} on ${formatTradeDate(t.date)}`}
                          title="Delete trade"
                        >
                          ✕
                        </button>
                      )}
                      {rowError && (
                        <div className="mt-1 text-[10px] normal-case tracking-normal text-hud-loss">
                          {rowError}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <AddTradeModal
          account={account}
          cycle={cycle}
          onClose={() => setShowModal(false)}
          onCreated={handleCreated}
        />
      )}
    </>
  );
}

/**
 * Render a trade row's date as YYYY-MM-DD in the user's local timezone.
 * Time-of-day is intentionally hidden: the form only collects a date, and
 * the equity-curve view (`daily_aggregates`) groups by date(date) anyway.
 * Falls back to the first 10 chars of the raw string if Date parsing fails.
 */
function formatTradeDate(d: string): string {
  if (!d) return "";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d.slice(0, 10);
  const yyyy = dt.getFullYear();
  const mm   = String(dt.getMonth() + 1).padStart(2, "0");
  const dd   = String(dt.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
