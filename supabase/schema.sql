-- =====================================================================
-- Trading Dashboard — Supabase schema
-- =====================================================================
-- Tables:
--   account_types  : rule presets (FT_INSTANT, ELEVATE_INSTANT_FUND, ...)
--   accounts       : every funded account the trader manages
--   cycles         : payout cycles (one active at a time per account)
--   trades         : every trade, attached to an account + cycle
--
-- Enable required extensions ------------------------------------------
create extension if not exists "uuid-ossp";

-- =====================================================================
-- ENUMS
-- =====================================================================
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

-- =====================================================================
-- account_types
-- =====================================================================
create table if not exists public.account_types (
  code                  text primary key,
  label                 text not null,
  payout_interval_days  int  not null,
  consistency_type      consistency_kind not null,
  consistency_value     numeric not null,        -- percent, e.g. 15 means 15%
  min_days              int not null,
  min_daily_percent     numeric not null,        -- percent, e.g. 0.5 means 0.5%
  created_at            timestamptz not null default now()
);

insert into public.account_types
  (code, label, payout_interval_days, consistency_type, consistency_value, min_days, min_daily_percent)
values
  ('FT_INSTANT',           'For Traders Instant',     15, 'daily', 15, 7,  0.50),
  ('ELEVATE_INSTANT_FUND', 'Elevate Instant Fund',    21, 'trade', 35, 10, 0.30),
  ('ELEVATE_INSTANT_PRO',  'Elevate Instant Pro',     21, 'trade', 50, 5,  0.30)
on conflict (code) do update set
  payout_interval_days = excluded.payout_interval_days,
  consistency_type     = excluded.consistency_type,
  consistency_value    = excluded.consistency_value,
  min_days             = excluded.min_days,
  min_daily_percent    = excluded.min_daily_percent;

-- =====================================================================
-- accounts
-- =====================================================================
create table if not exists public.accounts (
  id              uuid primary key default uuid_generate_v4(),
  name            text not null,                -- '3K', '6K', '25K', ...
  account_number  text not null unique,         -- the slug used in the URL
  owner           text not null,
  account_type    text not null references public.account_types(code) on update cascade,
  initial_balance numeric not null,
  created_at      timestamptz not null default now()
);

create index if not exists idx_accounts_account_type on public.accounts(account_type);

-- =====================================================================
-- cycles
-- =====================================================================
create table if not exists public.cycles (
  id          uuid primary key default uuid_generate_v4(),
  account_id  uuid not null references public.accounts(id) on delete cascade,
  start_date  date not null,
  end_date    date,
  status      cycle_status not null default 'active',
  closed_pnl_usd     numeric,                   -- snapshot when closed
  closed_pnl_percent numeric,                   -- snapshot when closed
  created_at  timestamptz not null default now()
);

-- Only one active cycle per account
create unique index if not exists uniq_cycle_active_per_account
  on public.cycles(account_id)
  where status = 'active';

create index if not exists idx_cycles_account on public.cycles(account_id);

-- =====================================================================
-- trades
-- =====================================================================
create table if not exists public.trades (
  id           uuid primary key default uuid_generate_v4(),
  account_id   uuid not null references public.accounts(id) on delete cascade,
  cycle_id     uuid not null references public.cycles(id)    on delete cascade,
  date         date not null,
  pair         text not null,
  direction    trade_direction not null,
  result       trade_result not null,
  pnl_usd      numeric not null,
  pnl_percent  numeric not null,
  created_at   timestamptz not null default now()
);

create index if not exists idx_trades_account on public.trades(account_id);
create index if not exists idx_trades_cycle   on public.trades(cycle_id);
create index if not exists idx_trades_date    on public.trades(date);

-- =====================================================================
-- HELPER: ensure_active_cycle(account_id)
--   returns id of the active cycle, creating one if needed.
-- =====================================================================
create or replace function public.ensure_active_cycle(p_account uuid)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  select id into v_id
  from public.cycles
  where account_id = p_account and status = 'active'
  limit 1;

  if v_id is null then
    insert into public.cycles(account_id, start_date, status)
    values (p_account, current_date, 'active')
    returning id into v_id;
  end if;

  return v_id;
end$$;

-- =====================================================================
-- HELPER: request_payout(account_id)
--   closes the active cycle and opens a fresh one. Returns new cycle id.
-- =====================================================================
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
  where account_id = p_account and status = 'active'
  limit 1;

  select coalesce(sum(pnl_usd), 0) into v_pnl_usd
  from public.trades where cycle_id = v_old;

  select initial_balance into v_initial from public.accounts where id = p_account;
  v_pnl_percent := case when v_initial = 0 then 0 else (v_pnl_usd / v_initial) * 100 end;

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

-- =====================================================================
-- VIEW: daily_aggregates — used by the dashboard for the equity curve
--
-- IMPORTANT: This is the canonical shape. If you change the column list
-- you MUST drop the view first — CREATE OR REPLACE VIEW cannot rename or
-- reshape columns, it will fail with 42P16.
-- =====================================================================
drop view if exists public.daily_aggregates cascade;

create view public.daily_aggregates as
select
  account_id,
  date(date)   as day,
  sum(pnl_usd) as total_pnl
from public.trades
group by account_id, date(date);

grant select on public.daily_aggregates to anon, authenticated;

-- =====================================================================
-- ROW LEVEL SECURITY (open by default — wire to auth.uid() when ready)
-- =====================================================================
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

-- For now allow inserts/updates from the anon key. Tighten when auth is wired.
drop policy if exists "write_all" on public.accounts;
drop policy if exists "write_all" on public.cycles;
drop policy if exists "write_all" on public.trades;

create policy "write_all" on public.accounts for all using (true) with check (true);
create policy "write_all" on public.cycles   for all using (true) with check (true);
create policy "write_all" on public.trades   for all using (true) with check (true);
