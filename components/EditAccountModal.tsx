"use client";

import { useState } from "react";
import { browserClient } from "@/lib/supabase";
import { getCurrentUser } from "@/lib/supabaseClient";
import { ACCOUNT_TYPES } from "@/lib/accountTypes";
import type { Account } from "@/lib/types";

interface Props {
  account: Account;
  onClose: () => void;
  onSaved: (a: Account) => void;
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

/**
 * Edit an existing account in place. Same field set as AddAccountModal,
 * pre-filled with the row's current values. The submit issues an
 * `update()` scoped by `id` AND `user_id` (defense-in-depth — the row
 * can only be modified by its owner).
 *
 * `account_number` is editable: the original use case is "I typed the
 * wrong account number and don't want to lose all the trades I logged".
 */
export function EditAccountModal({ account, onClose, onSaved }: Props) {
  const [accountNumber, setAccountNumber] = useState(account.account_number);
  const [accountSize, setAccountSize]     = useState(account.account_size ?? account.name ?? "");
  const [accountType, setAccountType]     = useState<string>(account.account_type);
  const [company, setCompany]             = useState(account.company ?? "");
  const [ownerName, setOwnerName]         = useState(account.owner_name ?? account.owner ?? "");
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

    const accountSizeStr = accountSize.trim();
    const ownerNameStr   = ownerName.trim();
    const companyStr     = company.trim() || null;

    const { data, error: updateError } = await supabase
      .from("accounts")
      .update({
        account_number:  accountNumber.trim(),
        account_type:    accountType,

        // structured columns
        account_size:    accountSizeStr,
        owner_name:      ownerNameStr,
        company:         companyStr,

        // legacy mirrors — kept in sync so older reads keep working
        name:            accountSizeStr,
        owner:           ownerNameStr,
        initial_balance: initial,
      })
      .eq("id", account.id)
      // ── multi-user filter: only update rows owned by this user ──
      .eq("user_id", user.id)
      .select()
      .single();

    setBusy(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }
    onSaved(data as Account);
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
          <p className="hud-label">MODIFY</p>
          <h2 className="font-display text-xl tracking-[0.25em] text-hud-neon">
            EDIT ACCOUNT
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
