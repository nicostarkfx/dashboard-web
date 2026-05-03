"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabaseClient";

/**
 * Logout affordance — small text button matching the existing back-link
 * treatment used on the account page (no new design tokens introduced).
 *
 * Sign out, then navigate to "/" and refresh so server components and
 * middleware re-evaluate against the now-empty session.
 */
export function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleLogout() {
    if (busy) return;
    setBusy(true);
    const supabase = getSupabaseClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={busy}
      className="text-[11px] uppercase tracking-[0.25em] text-hud-muted transition-colors duration-200 hover:text-hud-loss disabled:opacity-40"
      aria-label="Log out"
    >
      {busy ? "…" : "LOGOUT"}
    </button>
  );
}
