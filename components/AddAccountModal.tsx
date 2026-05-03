"use client";

import { useState } from "react";
import { browserClient } from "@/lib/supabase";
import { getCurrentUser } from "@/lib/supabaseClient";
import { ACCOUNT_TYPES } from "@/lib/accountTypes";
import type { Account } from "@/lib/types";

interface Props {
  onClose: () => void;
  onCreated: (a: Account) => void;
}

/**
 * "3K"  -> 3000
 * "25K" -> 25000
 * "100000" -> 100000
 */
function parseAccountSize(s: string): number {
  const m = s.trim().match(/^(\d+(?:\.\d+)?)\s*([Kk]?)$/);
  if (!m) return Number(s.replace(/[^\d.]/g, "")) || 0;
  return parseFloat(m[1]) * (m[2] ? 1000 : 1);
}

const inputClass =
  "w-full rounded border border-hud-border bg-hud-bg px-3 py-2 " +
  "font-mono text-sm text-hud-text placeholder:text-hud-muted/60 " +
  "focus:border-hud-neon focus:outline-none focus:shadow-neon-soft";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="hud-label mb-1 block">{label}</span>
      {children}
    </label>
  );
}

export function AddAccountModal({ onClose, onCreated }: Props) {
  const [accountNumber, setAccountNumber] = useState("");
  const [accountSize, setAccountSize]     = useState("");
  const [accountType, setAccountType]     = useState<string>("FT_INSTANT");
  const [company, setCompany]             = useState("");
  const [ownerName, setOwnerName]         = useState("");
  const [busy, setBusy]                   = useState(false);
  const [error, setError]                 = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!accountNumber.trim() || !accountSize.trim() || !ownerName.trim()) {
      setError("Account number, size and owner are required.");
      return;
    }
    const initial = parseAccountSize(accountSize);
    if (initial <= 0) {
      setError("Account size must be positive (e.g. 3K, 25K, 100000).");
      return;
    }

    setBusy(true);

    // ── auth: stop execution if no user is signed in ──
    let user;
    try {
      user = await getCurrentUser();
    } catch (e) {
      setBusy(false);
      setError(e instanceof Error ? e.message : "Not authenticated");
      return;
    }

    const supabase = browserClient();

    // Each field is stored in its OWN column. No concatenation. The legacy
    // `name`, `owner`, `initial_balance` columns are still populated for
    // back-compat with code that hasn't been migrated yet — but the source
    // of truth for trading logic is account_size / owner_name / company.
    const accountSizeStr = accountSize.trim();
    const ownerNameStr   = ownerName.trim();
    const companyStr     = company.trim() || null;

    const { data, error: insertError } = await supabase
      .from("accounts")
      .insert({
        account_number:  accountNumber.trim(),
        account_type:    accountType,

        // structured columns (added by 001_account_fields.sql)
        account_size:    accountSizeStr,
        owner_name:      ownerNameStr,
        company:         companyStr,

        // legacy mirrors — kept so existing reads keep working
        name:            accountSizeStr,
        owner:           ownerNameStr,
        initial_balance: initial,

        // ── multi-user: tie row to the creator ──
        user_id:         user.id,
      })
      .select()
      .single();

    setBusy(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }
    onCreated(data as Account);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-hud-bg/80 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="hud-panel scanlines relative w-full max-w-md p-6"
      >
        <span className="hud-corner top-1 left-1  border-l-2 border-t-2" />
        <span className="hud-corner top-1 right-1 border-r-2 border-t-2" />
        <span className="hud-corner bottom-1 left-1  border-l-2 border-b-2" />
        <span className="hud-corner bottom-1 right-1 border-r-2 border-b-2" />

        <header>
          <p className="hud-label">PROVISION</p>
          <h2 className="font-display text-xl tracking-[0.25em] text-hud-neon">
            NEW ACCOUNT
          </h2>
        </header>

        <div className="mt-5 space-y-3">
          <Field label="Account number">
            <input
              required
              autoFocus
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
              placeholder="e.g. 300042"
              className={inputClass}
            />
          </Field>
          <Field label="Account size">
            <input
              required
              value={accountSize}
              onChange={(e) => setAccountSize(e.target.value)}
              placeholder="e.g. 3K, 25K, 100K"
              className={inputClass}
            />
          </Field>
          <Field label="Account type">
            <select
              value={accountType}
              onChange={(e) => setAccountType(e.target.value)}
              className={inputClass}
            >
              {Object.values(ACCOUNT_TYPES).map((r) => (
                <option key={r.code} value={r.code}>{r.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Company">
            <input
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="e.g. For Traders"
              className={inputClass}
            />
          </Field>
          <Field label="Owner name">
            <input
              required
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
              placeholder="e.g. Nico"
              className={inputClass}
            />
          </Field>
        </div>

        {error && <p className="mt-4 text-xs text-hud-loss">{error}</p>}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            className="hud-button"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="hud-button animate-glow"
            disabled={busy}
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}
