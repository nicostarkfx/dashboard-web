import { NextResponse } from "next/server";
import { serverClient } from "@/lib/supabase";
import { getServerUser } from "@/lib/supabaseServer";
import { getRule } from "@/lib/accountTypes";
import { computeCycleStats } from "@/lib/calculations";
import type { Account, Cycle, Trade } from "@/lib/types";

/**
 * POST /api/payout/[account_number]
 *
 * Re-runs the consistency / min-days / window checks server-side, then calls
 * the `request_payout` RPC which closes the active cycle and opens a new one
 * inside a single transaction.
 */
export async function POST(
  _req: Request,
  { params }: { params: { account_number: string } }
) {
  // ── auth: stop execution if the caller has no session ──
  let user;
  try {
    user = await getServerUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = serverClient();

  // load account + active cycle (scoped to the authenticated user)
  const { data: acct, error: aErr } = await supabase
    .from("accounts").select("*")
    .eq("account_number", params.account_number)
    // ── multi-user filter: only this user's account ──
    .eq("user_id", user.id)
    .maybeSingle();
  if (aErr || !acct) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }
  const account = acct as Account;
  const rule = getRule(account.account_type);

  const { data: cycleRow } = await supabase
    .from("cycles").select("*")
    .eq("account_id", account.id)
    .eq("status", "active")
    .maybeSingle();
  if (!cycleRow) {
    return NextResponse.json({ error: "No active cycle" }, { status: 400 });
  }
  const cycle = cycleRow as Cycle;

  const { data: tradesRows } = await supabase
    .from("trades").select("*").eq("cycle_id", cycle.id);
  const trades = (tradesRows ?? []) as Trade[];

  // server-side gate: the UI also enforces this but trust nothing from the client
  const stats = computeCycleStats(
    trades,
    Number(account.initial_balance),
    rule,
    cycle.start_date
  );
  if (!stats.payout_eligible) {
    return NextResponse.json(
      { error: "Payout not allowed", reasons: stats.reasons_blocked },
      { status: 409 }
    );
  }

  // close + open via the SQL RPC
  const { data: newCycleId, error: rpcErr } = await supabase.rpc(
    "request_payout",
    { p_account: account.id }
  );
  if (rpcErr) {
    return NextResponse.json({ error: rpcErr.message }, { status: 500 });
  }

  return NextResponse.json({
    closed_cycle_id: cycle.id,
    new_cycle_id: newCycleId,
    closed_pnl_usd: stats.total_pnl_usd,
    closed_pnl_percent: stats.total_pnl_percent
  });
}
