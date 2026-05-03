"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { browserClient } from "@/lib/supabase";
import { parseAccountSize } from "@/lib/calculations";
import type { Account, Cycle, Trade, TradeDirection, TradeResult } from "@/lib/types";

interface Props {
  account: Account;
  cycle:   Cycle;
  onClose: () => void;
  onCreated: (t: Trade) => void;
}

const inputClass =
  "w-full rounded border border-hud-border bg-hud-bg px-3 py-2 " +
  "font-mono text-sm text-hud-text placeholder:text-hud-muted/60 " +
  "focus:border-hud-neon focus:outline-none focus:shadow-neon-soft";

function todayLocalIso(): string {
  // YYYY-MM-DD in the user's local timezone, suitable for <input type="date">.
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm   = String(d.getMonth() + 1).padStart(2, "0");
  const dd   = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Turn a YYYY-MM-DD string from <input type="date"> into a local-midnight
 * timestamp ISO string for the DB.
 *
 * Why this isn't just `new Date(s); d.setHours(0,0,0,0)`:
 *   `new Date("2026-04-27")` parses as UTC midnight, so users west of UTC
 *   (e.g. Americas) end up on the previous day in local time before
 *   setHours runs — an off-by-one day. Building from numeric parts via
 *   `new Date(y, m, d)` constructs in LOCAL time directly, which is what
 *   we want: midnight of the day the user actually picked, in their TZ.
 */
function dateOnlyToIso(yyyyMmDd: string): string {
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  if (!y || !m || !d) return new Date(yyyyMmDd).toISOString();
  return new Date(y, m - 1, d, 0, 0, 0, 0).toISOString();
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="hud-label mb-1 block">{label}</span>
      {children}
    </label>
  );
}

/**
 * Add Trade form.
 *
 * Rendering strategy:
 *   - Rendered through a React portal directly into <body>. This escapes ANY
 *     parent stacking context (transform, filter, opacity, will-change,
 *     overflow:hidden, position:relative + z-index, etc.) on the trigger's
 *     ancestors. This is the only way to guarantee the overlay sits above
 *     everything in the page; bumping z-index alone does not help when a
 *     parent has its own stacking context.
 *   - z-[9999] on the overlay puts it above any toast/header/etc.
 *   - Body scroll is locked while open.
 *   - ESC key closes the modal.
 *   - Click on backdrop closes; click inside the form does not.
 *   - Mount-time fade-in via opacity transition.
 *
 * Form behavior:
 *   - date defaults to the current local datetime
 *   - pair / side / result / pnl_usd are user input
 *   - pnl_percent is COMPUTED from the account's account_size, never asked
 *     (size "25K" -> 25000, then pnl_percent = pnl / 25000 * 100)
 */
export function AddTradeModal({ account, cycle, onClose, onCreated }: Props) {
  const [date,    setDate]    = useState<string>(todayLocalIso());
  const [pair,    setPair]    = useState("");
  const [side,    setSide]    = useState<TradeDirection>("long");
  const [result,  setResult]  = useState<TradeResult>("win");
  const [pnlUsd,  setPnlUsd]  = useState<string>("");
  const [busy,    setBusy]    = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  // Portal mounting + fade-in. We need to wait for the client mount before
  // touching document.body (Next.js renders this on the server first).
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Next paint: flip visible -> true so the opacity transition runs.
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  // Lock body scroll while the modal is open. Restore on unmount.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  // ESC closes the modal.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!pair.trim()) { setError("Pair is required."); return; }
    const pnl = Number(pnlUsd);
    if (!Number.isFinite(pnl)) { setError("PnL must be a number."); return; }
    if (sizeUsd <= 0) {
      setError(
        `Cannot derive % — account size "${account.account_size ?? account.name}" is unparseable.`
      );
      return;
    }

    const pnlPercent = (pnl / sizeUsd) * 100;

    setBusy(true);
    const supabase = browserClient();
    const { data, error: insertError } = await supabase
      .from("trades")
      .insert({
        account_id:  account.id,
        cycle_id:    cycle.id,
        date:        dateOnlyToIso(date), // YYYY-MM-DD -> local-midnight ISO
        pair:        pair.trim().toUpperCase(),
        side,
        result,
        pnl_usd:     pnl,
        pnl_percent: pnlPercent
      })
      .select()
      .single();
    setBusy(false);

    if (insertError) { setError(insertError.message); return; }
    onCreated(data as Trade);
  }

  const sizeUsd = parseAccountSize(account.account_size ?? account.name);

  if (!mounted) return null;

  const overlay = (
    <div
      className={
        "fixed inset-0 z-[9999] flex items-center justify-center " +
        "bg-hud-bg/80 p-4 backdrop-blur-sm " +
        "overflow-y-auto " +
        "transition-opacity duration-150 ease-out " +
        (visible ? "opacity-100" : "opacity-0")
      }
      onClick={onClose}
      onMouseDown={onClose /* catches drag-out clicks */}
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-trade-title"
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        className={
          "hud-panel scanlines relative w-full max-w-md p-6 " +
          "max-h-[90vh] overflow-y-auto " +
          "transition-transform duration-150 ease-out " +
          (visible ? "translate-y-0" : "translate-y-2")
        }
      >
        <span className="hud-corner top-1 left-1  border-l-2 border-t-2" />
        <span className="hud-corner top-1 right-1 border-r-2 border-t-2" />
        <span className="hud-corner bottom-1 left-1  border-l-2 border-b-2" />
        <span className="hud-corner bottom-1 right-1 border-r-2 border-b-2" />

        <header>
          <p className="hud-label">LOG TRADE</p>
          <h2 id="add-trade-title" className="font-display text-xl tracking-[0.25em] text-hud-neon">
            NEW TRADE
          </h2>
          <p className="mt-1 text-[10px] uppercase tracking-[0.2em] text-hud-muted">
            {account.account_size ?? account.name} · ${sizeUsd.toLocaleString()}
          </p>
        </header>

        <div className="mt-5 space-y-3">
          <Field label="Date">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={inputClass}
              required
            />
          </Field>

          <Field label="Pair">
            <input
              value={pair}
              onChange={(e) => setPair(e.target.value)}
              placeholder="e.g. EURUSD, XAUUSD, NAS100"
              className={inputClass}
              required
              autoFocus
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Side">
              <select
                value={side}
                onChange={(e) => setSide(e.target.value as TradeDirection)}
                className={inputClass}
              >
                <option value="long">Long</option>
                <option value="short">Short</option>
              </select>
            </Field>
            <Field label="Result">
              <select
                value={result}
                onChange={(e) => setResult(e.target.value as TradeResult)}
                className={inputClass}
              >
                <option value="win">Win</option>
                <option value="loss">Loss</option>
                <option value="breakeven">Breakeven</option>
              </select>
            </Field>
          </div>

          <Field label="PnL ($)">
            <input
              type="number"
              step="0.01"
              value={pnlUsd}
              onChange={(e) => setPnlUsd(e.target.value)}
              placeholder="e.g. 45.50 or -22.00"
              className={inputClass}
              required
            />
          </Field>

          <p className="text-[10px] text-hud-muted">
            PnL % auto-calculated as (pnl_usd / {sizeUsd > 0 ? `$${sizeUsd.toLocaleString()}` : "?"}) × 100
          </p>
        </div>

        {error && <p className="mt-4 text-xs text-hud-loss">{error}</p>}

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" className="hud-button" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="hud-button animate-glow" disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </div>
  );

  // Portal directly into <body>. This is what guarantees the modal is not
  // trapped inside any ancestor's stacking context or overflow:hidden.
  return createPortal(overlay, document.body);
}
