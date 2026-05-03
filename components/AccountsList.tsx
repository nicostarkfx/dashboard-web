"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { browserClient } from "@/lib/supabase";
import { getCurrentUser } from "@/lib/supabaseClient";
import { ACCOUNT_TYPES } from "@/lib/accountTypes";
import type { Account } from "@/lib/types";
import { AddAccountModal } from "./AddAccountModal";

interface Props {
  initial: Account[];
  error: string | null;
}

/**
 * Client component that owns the accounts grid plus its mutation UI:
 *   - "+" button (top-right) opens the AddAccountModal
 *   - each card has a small "✕" delete affordance with inline confirmation
 *
 * After insert/delete we update local state for instant feedback AND call
 * router.refresh() so the next render comes from the server (RLS-correct).
 */
export function AccountsList({ initial, error }: Props) {
  const router = useRouter();
  const [accounts, setAccounts]           = useState<Account[]>(initial);
  const [showModal, setShowModal]         = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [busyDelete, setBusyDelete]       = useState(false);
  const [errMsg, setErrMsg]               = useState<string | null>(null);

  function handleCreated(row: Account) {
    setAccounts((prev) => [...prev, row]);
    setShowModal(false);
    router.refresh();
  }

  async function handleDelete(id: string) {
    setBusyDelete(true);
    setErrMsg(null);

    // ── auth: stop execution if no user is signed in ──
    let user;
    try {
      user = await getCurrentUser();
    } catch (e) {
      setBusyDelete(false);
      setErrMsg(e instanceof Error ? e.message : "Not authenticated");
      return;
    }

    const supabase = browserClient();
    const { error: delErr } = await supabase
      .from("accounts")
      .delete()
      .eq("id", id)
      // ── multi-user filter: only delete rows owned by this user ──
      .eq("user_id", user.id);
    setBusyDelete(false);
    if (delErr) {
      setErrMsg(delErr.message);
      return;
    }
    setAccounts((prev) => prev.filter((a) => a.id !== id));
    setPendingDelete(null);
    router.refresh();
  }

  return (
    <>
      {/* HEADER: + button --------------------------------------------- */}
      <div className="mb-6 flex items-center justify-end">
        <button
          className="hud-button"
          onClick={() => setShowModal(true)}
          aria-label="Add account"
        >
          <span className="text-base leading-none">+</span> New Account
        </button>
      </div>

      {error  && <p className="mb-4 text-sm text-hud-loss">Could not load accounts: {error}</p>}
      {errMsg && <p className="mb-4 text-sm text-hud-loss">{errMsg}</p>}

      {/* GRID --------------------------------------------------------- */}
      {accounts.length === 0 ? (
        <p className="py-8 text-sm text-hud-muted">No accounts yet. Click + to add one.</p>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {accounts.map((a) => {
            const rule = ACCOUNT_TYPES[a.account_type];
            const confirming = pendingDelete === a.id;
            return (
              <div
                key={a.id}
                className="hud-panel hud-card-hover scanlines relative flex h-full flex-col p-6 transition-all duration-200 animate-fade-up"
              >
                <span className="hud-corner top-1 left-1  border-l-2 border-t-2" />
                <span className="hud-corner top-1 right-1 border-r-2 border-t-2" />
                <span className="hud-corner bottom-1 left-1  border-l-2 border-b-2" />
                <span className="hud-corner bottom-1 right-1 border-r-2 border-b-2" />

                {/* Delete control (top right) */}
                {!confirming ? (
                  <button
                    aria-label="Delete account"
                    title="Delete account"
                    className="absolute right-3 top-3 z-10 rounded p-1 text-hud-muted transition-colors duration-200 hover:bg-hud-loss/10 hover:text-hud-loss"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setPendingDelete(a.id);
                    }}
                  >
                    ✕
                  </button>
                ) : (
                  <div
                    className="absolute right-3 top-3 z-10 flex items-center gap-2 rounded border border-hud-loss/40 bg-hud-bg/90 px-2 py-1 text-[10px] uppercase tracking-[0.18em]"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span className="text-hud-loss">Sure?</span>
                    <button
                      className="text-hud-loss transition-colors duration-200 hover:underline disabled:opacity-50"
                      disabled={busyDelete}
                      onClick={() => handleDelete(a.id)}
                    >
                      {busyDelete ? "…" : "Yes"}
                    </button>
                    <button
                      className="text-hud-muted transition-colors duration-200 hover:underline"
                      disabled={busyDelete}
                      onClick={() => setPendingDelete(null)}
                    >
                      No
                    </button>
                  </div>
                )}

                {/* Card body — links into the dashboard for that account.
                    Each structured field is rendered on its own line so it
                    stays parseable for future trading logic.            */}
                <Link href={`/account/${a.account_number}`} className="flex h-full flex-col">
                  <p className="hud-label">#{a.account_number}</p>
                  <p className="mt-2 font-mono text-3xl font-semibold leading-none tracking-tight text-hud-accent">
                    {a.account_size ?? a.name}
                  </p>
                  <p className="mt-3 text-[10px] uppercase tracking-[0.2em] text-hud-neon/80">
                    {rule?.label ?? a.account_type}
                  </p>
                  <dl className="mt-auto space-y-2 pt-5 font-mono text-xs">
                    <div className="flex justify-between gap-3">
                      <dt className="text-hud-muted">Company</dt>
                      <dd className="text-hud-text">
                        {a.company ?? <span className="text-hud-muted/60">—</span>}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-hud-muted">Owner</dt>
                      <dd className="text-hud-text">
                        {a.owner_name ?? a.owner}
                      </dd>
                    </div>
                  </dl>
                </Link>
              </div>
            );
          })}
        </div>
      )}

      {showModal && (
        <AddAccountModal
          onClose={() => setShowModal(false)}
          onCreated={handleCreated}
        />
      )}
    </>
  );
}
