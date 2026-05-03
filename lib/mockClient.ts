/**
 * Minimal Supabase-shaped mock client for MOCK MODE.
 *
 * Goal: every call site in the app (`from(t).select().eq().order()...`,
 * `from(t).insert().select().single()`, `from(t).delete().eq()`, and
 * `rpc(name, args)`) gets back a thenable that resolves to
 * `{ data, error }` — same contract as @supabase/supabase-js.
 *
 * NOT a full Supabase impl. Only covers what the current UI actually uses.
 */
import { mockState } from "./mockSeed";
import type { Cycle } from "./types";

type Filter = { col: string; val: unknown };
type OrderBy = { col: string; ascending: boolean };
type Op = "select" | "insert" | "update" | "delete";

type Result<T = unknown> = { data: T; error: null } | { data: null; error: { message: string } };

function newId(): string {
  if (typeof crypto !== "undefined" && (crypto as Crypto & { randomUUID?: () => string }).randomUUID) {
    return (crypto as Crypto & { randomUUID: () => string }).randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function getTable(name: string): Record<string, unknown>[] {
  const t = (mockState.tables as Record<string, unknown[]>)[name];
  if (!t) {
    // Create the bucket lazily so calls to unknown tables don't crash.
    (mockState.tables as Record<string, unknown[]>)[name] = [];
    return (mockState.tables as Record<string, unknown[]>)[name] as Record<string, unknown>[];
  }
  return t as Record<string, unknown>[];
}

class QueryBuilder<T = unknown> {
  private table: string;
  private op: Op = "select";
  private filters: Filter[] = [];
  private orders: OrderBy[] = [];
  private singleFlag = false;
  private insertPayload: Record<string, unknown> | Record<string, unknown>[] | null = null;
  private updatePayload: Record<string, unknown> | null = null;

  constructor(table: string) {
    this.table = table;
  }

  // After insert/update, calling .select() should still return rows.
  // We don't change op here — execute() uses the current op + payload.
  select(_cols?: string): this {
    return this;
  }

  insert(payload: Record<string, unknown> | Record<string, unknown>[]): this {
    this.op = "insert";
    this.insertPayload = payload;
    return this;
  }

  update(payload: Record<string, unknown>): this {
    this.op = "update";
    this.updatePayload = payload;
    return this;
  }

  delete(): this {
    this.op = "delete";
    return this;
  }

  eq(col: string, val: unknown): this {
    this.filters.push({ col, val });
    return this;
  }

  order(col: string, opts: { ascending?: boolean } = {}): this {
    this.orders.push({ col, ascending: opts.ascending ?? true });
    return this;
  }

  limit(_n: number): this {
    return this;
  }

  single(): this {
    this.singleFlag = true;
    return this;
  }

  // Make the builder awaitable.
  then<R1 = Result<T>, R2 = never>(
    onFulfilled?: ((value: Result<T>) => R1 | PromiseLike<R1>) | null,
    onRejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): Promise<R1 | R2> {
    try {
      const out = this.execute();
      return Promise.resolve(out as Result<T>).then(onFulfilled, onRejected);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return Promise.resolve({ data: null, error: { message: msg } } as Result<T>).then(
        onFulfilled,
        onRejected,
      );
    }
  }

  // ---- internal -----------------------------------------------------
  private applyFilters(rows: Record<string, unknown>[]): Record<string, unknown>[] {
    if (!this.filters.length) return rows;
    return rows.filter((r) => this.filters.every((f) => r[f.col] === f.val));
  }

  private applyOrders(rows: Record<string, unknown>[]): Record<string, unknown>[] {
    if (!this.orders.length) return rows;
    return [...rows].sort((a, b) => {
      for (const o of this.orders) {
        const av = a[o.col] as string | number | null | undefined;
        const bv = b[o.col] as string | number | null | undefined;
        if (av === bv) continue;
        if (av == null) return o.ascending ? -1 : 1;
        if (bv == null) return o.ascending ? 1 : -1;
        return (av < bv ? -1 : 1) * (o.ascending ? 1 : -1);
      }
      return 0;
    });
  }

  private execute(): Result<unknown> {
    const rows = getTable(this.table);

    if (this.op === "select") {
      let out = this.applyFilters(rows);
      out = this.applyOrders(out);
      if (this.singleFlag) {
        return { data: (out[0] ?? null) as unknown, error: null };
      }
      return { data: out as unknown, error: null };
    }

    if (this.op === "insert") {
      const payloads = Array.isArray(this.insertPayload)
        ? this.insertPayload
        : this.insertPayload
        ? [this.insertPayload]
        : [];
      const inserted = payloads.map((p) => {
        const row: Record<string, unknown> = {
          id: p.id ?? newId(),
          created_at: p.created_at ?? new Date().toISOString(),
          ...p,
        };
        rows.push(row);
        return row;
      });
      if (this.singleFlag) return { data: (inserted[0] ?? null) as unknown, error: null };
      return { data: inserted as unknown, error: null };
    }

    if (this.op === "update") {
      const matches = this.applyFilters(rows);
      matches.forEach((m) => Object.assign(m, this.updatePayload ?? {}));
      if (this.singleFlag) return { data: (matches[0] ?? null) as unknown, error: null };
      return { data: matches as unknown, error: null };
    }

    if (this.op === "delete") {
      const matches = new Set(this.applyFilters(rows));
      const survivors = rows.filter((r) => !matches.has(r));
      // Replace bucket contents in place to keep reference stable.
      rows.length = 0;
      rows.push(...survivors);
      return { data: null, error: null };
    }

    return { data: null, error: { message: `mock: unsupported op ${this.op}` } };
  }
}

class MockClient {
  from(table: string): QueryBuilder {
    return new QueryBuilder(table);
  }

  async rpc(
    name: string,
    args: Record<string, unknown> = {},
  ): Promise<Result<unknown>> {
    if (name === "ensure_active_cycle") {
      const accountId = args.p_account as string;
      const cycles = mockState.tables.cycles;
      const existing = cycles.find((c) => c.account_id === accountId && c.status === "active");
      if (existing) return { data: existing.id as unknown, error: null };
      const newCycle: Cycle = {
        id: newId(),
        account_id: accountId,
        start_date: new Date().toISOString().slice(0, 10),
        end_date: null,
        status: "active",
        closed_pnl_usd: null,
        closed_pnl_percent: null,
        created_at: new Date().toISOString(),
      };
      cycles.push(newCycle);
      return { data: newCycle.id as unknown, error: null };
    }

    if (name === "request_payout") {
      const accountId = args.p_account as string;
      const cycles = mockState.tables.cycles;
      const trades = mockState.tables.trades;
      const accounts = mockState.tables.accounts;
      const old = cycles.find((c) => c.account_id === accountId && c.status === "active");
      if (old) {
        const cycleTrades = trades.filter((t) => t.cycle_id === old.id);
        const pnlUsd = cycleTrades.reduce((s, t) => s + Number(t.pnl_usd || 0), 0);
        const account = accounts.find((a) => a.id === accountId);
        const initial = Number(account?.initial_balance ?? 0);
        const pnlPercent = initial === 0 ? 0 : (pnlUsd / initial) * 100;
        old.status = "closed";
        old.end_date = new Date().toISOString().slice(0, 10);
        old.closed_pnl_usd = pnlUsd;
        old.closed_pnl_percent = pnlPercent;
      }
      const newCycle: Cycle = {
        id: newId(),
        account_id: accountId,
        start_date: new Date().toISOString().slice(0, 10),
        end_date: null,
        status: "active",
        closed_pnl_usd: null,
        closed_pnl_percent: null,
        created_at: new Date().toISOString(),
      };
      cycles.push(newCycle);
      return { data: newCycle.id as unknown, error: null };
    }

    return { data: null, error: { message: `mock: unsupported rpc ${name}` } };
  }
}

let _client: MockClient | null = null;

export function getMockClient(): MockClient {
  if (!_client) _client = new MockClient();
  return _client;
}
