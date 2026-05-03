/**
 * Seed data for MOCK MODE (NEXT_PUBLIC_MOCK=true).
 *
 * Hardcoded snapshot — no Supabase, no I/O. Mirrors the shape of the
 * `accounts`, `cycles`, and `trades` tables as consumed by the UI
 * (lib/types.ts), so server components and browser components see the
 * same fields they would from a real Supabase response.
 *
 * NOTE: this state is in-memory and process-local. Server-side mutations
 * (route handlers, server actions) and browser-side mutations (client
 * components) modify DIFFERENT copies. This is acceptable in option (A)
 * mock mode — a `router.refresh()` will reset to seed.
 */
import type { Account, Cycle, Trade } from "./types";

// ---- helpers -----------------------------------------------------------
const today = new Date();
const isoDay = (offsetDays = 0): string => {
  const d = new Date(today);
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
};
const isoTs = (offsetDays = 0): string => {
  const d = new Date(today);
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString();
};

// Stable UUIDs so links/slugs are deterministic across reloads.
const ACC = {
  three:    "11111111-1111-4111-8111-111111111111",
  six:      "22222222-2222-4222-8222-222222222222",
  twentyfive: "33333333-3333-4333-8333-333333333333",
};
const CYC = {
  three:      "aaaa1111-1111-4111-8111-111111111111",
  six:        "aaaa2222-2222-4222-8222-222222222222",
  twentyfive: "aaaa3333-3333-4333-8333-333333333333",
};

// ---- seed --------------------------------------------------------------
const seedAccounts = (): Account[] => [
  {
    id:              ACC.three,
    name:            "3K",
    account_number:  "300001",
    owner:           "Nico",
    account_type:    "FT_INSTANT",
    initial_balance: 3000,
    created_at:      isoTs(-30),
    account_size:    "3K",
    owner_name:      "Nico",
    company:         "For Traders",
  },
  {
    id:              ACC.six,
    name:            "6K",
    account_number:  "600006",
    owner:           "Nico",
    account_type:    "ELEVATE_INSTANT_FUND",
    initial_balance: 6000,
    created_at:      isoTs(-20),
    account_size:    "6K",
    owner_name:      "Nico",
    company:         "Elevate",
  },
  {
    id:              ACC.twentyfive,
    name:            "25K",
    account_number:  "250025",
    owner:           "Nico",
    account_type:    "ELEVATE_INSTANT_PRO",
    initial_balance: 25000,
    created_at:      isoTs(-10),
    account_size:    "25K",
    owner_name:      "Nico",
    company:         "Elevate",
  },
];

const seedCycles = (): Cycle[] => [
  {
    id: CYC.three, account_id: ACC.three,
    start_date: isoDay(-7), end_date: null, status: "active",
    closed_pnl_usd: null, closed_pnl_percent: null, created_at: isoTs(-7),
  },
  {
    id: CYC.six, account_id: ACC.six,
    start_date: isoDay(-5), end_date: null, status: "active",
    closed_pnl_usd: null, closed_pnl_percent: null, created_at: isoTs(-5),
  },
  {
    id: CYC.twentyfive, account_id: ACC.twentyfive,
    start_date: isoDay(-3), end_date: null, status: "active",
    closed_pnl_usd: null, closed_pnl_percent: null, created_at: isoTs(-3),
  },
];

const seedTrades = (): Trade[] => {
  const t = (
    n: number, accId: string, cycId: string, initial: number,
    offset: number, pair: string, side: "long" | "short",
    result: "win" | "loss" | "breakeven", pnl: number,
  ): Trade => ({
    id:          `bbbb${n.toString().padStart(4, "0")}-1111-4111-8111-111111111111`,
    account_id:  accId,
    cycle_id:    cycId,
    date:        isoDay(offset),
    pair,
    side,
    result,
    pnl_usd:     pnl,
    pnl_percent: Number(((pnl / initial) * 100).toFixed(4)),
    created_at:  isoTs(offset),
  });

  return [
    // 3K cycle
    t(1, ACC.three, CYC.three, 3000, -6, "EURUSD", "long",  "win",        45),
    t(2, ACC.three, CYC.three, 3000, -6, "GBPUSD", "short", "loss",      -22),
    t(3, ACC.three, CYC.three, 3000, -5, "XAUUSD", "long",  "win",        60),
    t(4, ACC.three, CYC.three, 3000, -3, "NAS100", "long",  "breakeven",   0),
    t(5, ACC.three, CYC.three, 3000, -1, "EURUSD", "long",  "win",        28),
    // 6K cycle
    t(6, ACC.six,   CYC.six,   6000, -4, "XAUUSD", "short", "loss",      -55),
    t(7, ACC.six,   CYC.six,   6000, -2, "NAS100", "long",  "win",       110),
    // 25K cycle
    t(8, ACC.twentyfive, CYC.twentyfive, 25000, -2, "EURUSD", "long",  "win",  240),
    t(9, ACC.twentyfive, CYC.twentyfive, 25000, -1, "GBPUSD", "short", "win",  180),
  ];
};

// ---- in-memory store (process-local) ----------------------------------
export type MockTables = {
  accounts: Account[];
  cycles:   Cycle[];
  trades:   Trade[];
};

export const mockState: { tables: MockTables } = {
  tables: {
    accounts: seedAccounts(),
    cycles:   seedCycles(),
    trades:   seedTrades(),
  },
};
