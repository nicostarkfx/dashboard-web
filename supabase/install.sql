-- =====================================================================
-- Trading Dashboard — full schema install for Supabase SQL editor
-- =====================================================================
-- Single-file canonical state assembled from:
--   * supabase/schema.sql                (base schema)
--   * supabase/migrations/001_account_fields.sql
--                                        (account_size / owner_name / company)
--   * supabase/migrations/003_trades_upgrade.sql
--                                        (direction → side, date → timestamptz)
--   * supabase/migrations/005_force_reset_daily_aggregates.sql
--                                        (daily_aggregates view final shape)
--   * components/AddAccountModal.tsx + AccountsList.tsx + page reads
--                                        (multi-user: accounts.user_id)
--
-- Paste this whole file into the Supabase SQL editor on a fresh project.
-- Idempotent: safe to re-run on partial state — every CREATE uses
-- IF NOT EXISTS / OR REPLACE where supported.
--
-- This file ONLY produces schema + reference data (account_types presets).
-- Trader/account/trade rows belong in seed scripts and stay out of here.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) EXTENSIONS
-- ---------------------------------------------------------------------
create extension if not exists "uuid-ossp";

-- ---------------------------------------------------------------------
-- 2) ENUMS
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'consistency_kind') then
    create type consistency_kind as enum ('daily', 'trade');
  end if;
  if not exists (select 1 from pg_type where typname = 'cycle_status') then
    create type cycle_status as enum ('active', 'closed');
  end if;
  if not exists (select 1 from pg_type where typname = 'trade_direction') then
    create type trade_direction as enum ('long', 'short');
  end if;
  if not exists (select 1 from pg_type where typname = 'trade_result') then
    create type trade_result as enum ('win', 'loss', 'breakeven');
  end if;
end$$;

-- ---------------------------------------------------------------------
-- 3) TABLES
-- ---------------------------------------------------------------------

-- account_types — rule presets referenced by every account row.
create table if not exists public.account_types (
  code                  text primary key,
  label                 text not null,
  payout_interval_days  int  not null,
  consistency_type      consistency_kind not null,
  consistency_value     numeric not null,         -- percent (e.g. 15 = 15%)
  min_days              int not null,
  min_daily_percent     numeric not null,         -- percent (e.g. 0.5 = 0.5%)
  created_at            timestamptz not null default now()
);

-- accounts — every funded account a trader manages.
-- Columns reflect the post-migration final shape:
--   * structured trading fields (account_size, owner_name, company)
--   * legacy mirror columns kept (name, owner, initial_balance) so older
--     reads keep working
--   * user_id ties the row to the authenticated Supabase user
create table if not exists public.accounts (
  id              uuid primary key default uuid_generate_v4(),
  name            text not null,                -- legacy mirror of account_size
  account_number  text not null unique,         -- slug used in the URL
  owner           text not null,                -- legacy mirror of owner_name
  account_type    text not null
                    references public.account_types(code) on update cascade,
  initial_balance numeric not null,
  created_at      timestamptz not null default now(),

  -- structured columns (added by migration 001)
  account_size    text,
  owner_name      text,
  company         text,

  -- multi-user owner (added when auth was wired into the dashboard)
  user_id         uuid not null
                    references auth.users(id) on delete cascade
);

-- cycles — payout cycles (one active at a time per account).
create table if not exists public.cycles (
  id                  uuid primary key default uuid_generate_v4(),
  account_id          uuid not null
                        references public.accounts(id) on delete cascade,
  start_date          date not null,
  end_date            date,
  status              cycle_status not null default 'active',
  closed_pnl_usd      numeric,                  -- snapshot when closed
  closed_pnl_percent  numeric,                  -- snapshot when closed
  created_at          timestamptz not null default now()
);

-- trades — every trade, attached to an account + cycle.
-- Final post-migration shape:
--   * `side` (renamed from `direction` in migration 003)
--   * `date` is timestamptz (promoted from date in migration 003)
create table if not exists public.trades (
  id           uuid primary key default uuid_generate_v4(),
  account_id   uuid not null
                  references public.accounts(id) on delete cascade,
  cycle_id     uuid not null
                  references public.cycles(id)   on delete cascade,
  date         timestamptz not null,
  pair         text not null,
  side         trade_direction not null,
  result       trade_result not null,
  pnl_usd      numeric not null,
  pnl_percent  numeric not null,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 4) INDEXES + UNIQUE CONSTRAINTS
-- ---------------------------------------------------------------------
create index if not exists idx_accounts_account_type on public.accounts(account_type);
create index if not exists idx_accounts_company      on public.accounts(company);
create index if not exists idx_accounts_user         on public.accounts(user_id);

-- One active cycle per account (enforced by partial unique index).
create unique index if not exists uniq_cycle_active_per_account
  on public.cycles(account_id)
  where status = 'active';

create index if not exists idx_cycles_account on public.cycles(account_id);

create index if not exists idx_trades_account on public.trades(account_id);
create index if not exists idx_trades_cycle   on public.trades(cycle_id);
create index if not exists idx_trades_date    on public.trades(date);

-- ---------------------------------------------------------------------
-- 5) FUNCTIONS / RPCs
-- ---------------------------------------------------------------------

-- ensure_active_cycle(account_id) — returns the id of the active cycle,
-- creating one if none exists. Idempotent. Called from server components
-- and from supabase.rpc("ensure_active_cycle", { p_account }).
create or replace function public.ensure_active_cycle(p_account uuid)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  select id into v_id
    from public.cycles
   where account_id = p_account
     and status = 'active'
   limit 1;

  if v_id is null then
    insert into public.cycles(account_id, start_date, status)
    values (p_account, current_date, 'active')
    returning id into v_id;
  end if;

  return v_id;
end$$;

-- request_payout(account_id) — closes the active cycle and opens a fresh
-- one in the same transaction. Returns the new cycle's id. Snapshots the
-- closed cycle's total PnL (usd + %) for historical reporting.
create or replace function public.request_payout(p_account uuid)
returns uuid
language plpgsql
as $$
declare
  v_old uuid;
  v_new uuid;
  v_pnl_usd     numeric;
  v_pnl_percent numeric;
  v_initial     numeric;
begin
  select id into v_old
    from public.cycles
   where account_id = p_account
     and status = 'active'
   limit 1;

  select coalesce(sum(pnl_usd), 0) into v_pnl_usd
    from public.trades
   where cycle_id = v_old;

  select initial_balance into v_initial
    from public.accounts
   where id = p_account;

  v_pnl_percent := case
    when v_initial = 0 then 0
    else (v_pnl_usd / v_initial) * 100
  end;

  if v_old is not null then
    update public.cycles
       set status = 'closed',
           end_date = current_date,
           closed_pnl_usd = v_pnl_usd,
           closed_pnl_percent = v_pnl_percent
     where id = v_old;
  end if;

  insert into public.cycles(account_id, start_date, status)
  values (p_account, current_date, 'active')
  returning id into v_new;

  return v_new;
end$$;

-- ---------------------------------------------------------------------
-- 6) VIEWS
-- ---------------------------------------------------------------------
-- daily_aggregates — feeds the equity curve and the daily breakdown.
-- IMPORTANT shape: (account_id, day, total_pnl). DROP-then-CREATE
-- because CREATE OR REPLACE VIEW cannot reshape columns (42P16).
drop view if exists public.daily_aggregates cascade;

create view public.daily_aggregates as
select
    account_id,
    date(date)    as day,
    sum(pnl_usd)  as total_pnl
  from public.trades
 group by account_id, date(date);

-- ---------------------------------------------------------------------
-- 7) GRANTS
-- ---------------------------------------------------------------------
grant select on public.daily_aggregates to anon, authenticated;

-- ---------------------------------------------------------------------
-- 8) ROW LEVEL SECURITY
--    Open by default (matches the original schema). The frontend filters
--    every accounts query by user_id explicitly. Tighten these policies
--    to `using (user_id = auth.uid())` when the data-layer client moves
--    from anon-key to user-JWT auth.
-- ---------------------------------------------------------------------
alter table public.accounts      enable row level security;
alter table public.cycles        enable row level security;
alter table public.trades        enable row level security;
alter table public.account_types enable row level security;

drop policy if exists "read_all" on public.accounts;
drop policy if exists "read_all" on public.cycles;
drop policy if exists "read_all" on public.trades;
drop policy if exists "read_all" on public.account_types;

create policy "read_all" on public.accounts      for select using (true);
create policy "read_all" on public.cycles        for select using (true);
create policy "read_all" on public.trades        for select using (true);
create policy "read_all" on public.account_types for select using (true);

drop policy if exists "write_all" on public.accounts;
drop policy if exists "write_all" on public.cycles;
drop policy if exists "write_all" on public.trades;

create policy "write_all" on public.accounts for all using (true) with check (true);
create policy "write_all" on public.cycles   for all using (true) with check (true);
create policy "write_all" on public.trades   for all using (true) with check (true);

-- ---------------------------------------------------------------------
-- 9) REFERENCE DATA — account_types presets
--    The UI mirrors these exact values in lib/accountTypes.ts. Keep both
--    in sync if you change a preset.
-- ---------------------------------------------------------------------
insert into public.account_types
  (code, label, payout_interval_days, consistency_type, consistency_value, min_days, min_daily_percent)
values
  ('FT_INSTANT',           'For Traders Instant',     15, 'daily', 15, 7,  0.50),
  ('ELEVATE_INSTANT_FUND', 'Elevate Instant Fund',    21, 'trade', 35, 10, 0.30),
  ('ELEVATE_INSTANT_PRO',  'Elevate Instant Pro',     21, 'trade', 50, 5,  0.30)
on conflict (code) do update set
  label                = excluded.label,
  payout_interval_days = excluded.payout_interval_days,
  consistency_type     = excluded.consistency_type,
  consistency_value    = excluded.consistency_value,
  min_days             = excluded.min_days,
  min_daily_percent    = excluded.min_daily_percent;

-- ---------------------------------------------------------------------
-- 10) SANITY READBACK — surfaces final state in the SQL editor.
--     Read-only, never modifies anything.
-- ---------------------------------------------------------------------
select 'accounts'        as object, count(*) as row_count from public.accounts
union all
select 'cycles',          count(*) from public.cycles
union all
select 'trades',          count(*) from public.trades
union all
select 'account_types',   count(*) from public.account_types;

select column_name, data_type
  from information_schema.columns
 where table_schema = 'public'
   and table_name   = 'accounts'
 order by ordinal_position;

select column_name, data_type
  from information_schema.columns
 where table_schema = 'public'
   and table_name   = 'trades'
 order by ordinal_position;

select column_name, data_type
  from information_schema.columns
 where table_schema = 'public'
   and table_name   = 'daily_aggregates'
 order by ordinal_position;
