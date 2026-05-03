import type { AccountTypeRule } from "./types";

/**
 * Rule presets for every supported account type.
 * Mirrors what's seeded into public.account_types in supabase/schema.sql.
 * Kept here too so the UI never has to wait on a DB roundtrip just to label things.
 */
export const ACCOUNT_TYPES: Record<string, AccountTypeRule> = {
  FT_INSTANT: {
    code: "FT_INSTANT",
    label: "For Traders Instant",
    payout_interval_days: 15,
    consistency_type: "daily",
    consistency_value: 15,
    min_days: 7,
    min_daily_percent: 0.5
  },
  ELEVATE_INSTANT_FUND: {
    code: "ELEVATE_INSTANT_FUND",
    label: "Elevate Instant Fund",
    payout_interval_days: 21,
    consistency_type: "trade",
    consistency_value: 35,
    min_days: 10,
    min_daily_percent: 0.3
  },
  ELEVATE_INSTANT_PRO: {
    code: "ELEVATE_INSTANT_PRO",
    label: "Elevate Instant Pro",
    payout_interval_days: 21,
    consistency_type: "trade",
    consistency_value: 50,
    min_days: 5,
    min_daily_percent: 0.3
  }
};

export function getRule(code: string): AccountTypeRule {
  const rule = ACCOUNT_TYPES[code];
  if (!rule) throw new Error(`Unknown account type: ${code}`);
  return rule;
}
