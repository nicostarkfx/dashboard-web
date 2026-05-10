import { serverClient } from "@/lib/supabase";
import { getServerUser } from "@/lib/supabaseServer";
import { getRule } from "@/lib/accountTypes";
import { computeCycleStats, tradesToCsv } from "@/lib/calculations";
import type { Account, Cycle, Trade } from "@/lib/types";

/**
 * GET /api/export/[account_number]
 * Returns CSV of the active cycle's trades plus a footer block of stats.
 */
export async function GET(
  _req: Request,
  { params }: { params: { account_number: string } }
) {
  // ── auth: stop execution if the caller has no session ──
  let user;
  try {
    user = await getServerUser();
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabase = serverClient();

  const { data: acct } = await supabase
    .from("accounts").select("*")
    .eq("account_number", params.account_number)
    // ── multi-user filter: only this user's account ──
    .eq("user_id", user.id)
    .maybeSingle();
  if (!acct) {
    return new Response("Account not found", { status: 404 });
  }
  const account = acct as Account;
  const rule = getRule(account.account_type);

  const { data: cycleRow } = await supabase
    .from("cycles").select("*")
    .eq("account_id", account.id)
    .eq("status", "active")
    .maybeSingle();
  if (!cycleRow) {
    return new Response("No active cycle", { status: 400 });
  }
  const cycle = cycleRow as Cycle;

  const { data: tradesRows } = await supabase
    .from("trades").select("*")
    .eq("cycle_id", cycle.id)
    .order("date", { ascending: true });
  const trades = (tradesRows ?? []) as Trade[];

  const stats = computeCycleStats(
    trades,
    Number(account.initial_balance),
    rule,
    cycle.start_date
  );
  const csv = tradesToCsv(trades, stats, {
    accountLabel:     `${account.account_size ?? account.name} #${account.account_number}`,
    accountTypeLabel: rule.label,
    initialBalance:   Number(account.initial_balance),
    cycleStartDate:   cycle.start_date,
  });

  // Filename includes the report date so successive exports never overwrite
  // each other in the user's downloads folder. e.g. trades_822557_2026-05-05.csv
  const today = new Date().toISOString().slice(0, 10);
  const filename = `trades_${account.account_number}_${today}.csv`;

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
