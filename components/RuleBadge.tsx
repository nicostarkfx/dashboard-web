import type { AccountTypeRule } from "@/lib/types";

/**
 * Tiny badge that reads off the active rule preset (consistency mode + value,
 * payout interval, min days, min daily %).
 */
export function RuleBadge({ rule }: { rule: AccountTypeRule }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-hud-muted">
      <span className="rounded border border-hud-border px-2 py-1">
        {rule.label}
      </span>
      <span className="rounded border border-hud-neon/40 px-2 py-1 text-hud-neon">
        Payout · {rule.payout_interval_days}d
      </span>
      <span className="rounded border border-hud-neon/40 px-2 py-1 text-hud-neon">
        {rule.consistency_type === "daily" ? "Day" : "Trade"} ≤ {rule.consistency_value}%
      </span>
      <span className="rounded border border-hud-border px-2 py-1">
        Min days · {rule.min_days}
      </span>
      <span className="rounded border border-hud-border px-2 py-1">
        Min daily · {rule.min_daily_percent}%
      </span>
    </div>
  );
}
