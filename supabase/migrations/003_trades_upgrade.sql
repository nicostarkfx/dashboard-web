-- ============================================================
-- Trades table upgrade for the journal-style UI.
--   1. Rename direction -> side  (idempotent)
--   2. Promote date -> timestamptz for precise trade timing
-- Safe to re-run.
-- ============================================================

-- 1) Rename direction to side. Skip if it has already been renamed.
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name   = 'trades'
       and column_name  = 'direction'
  )
  and not exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name   = 'trades'
       and column_name  = 'side'
  )
  then
    alter table public.trades rename column direction to side;
  end if;
end $$;

-- 2) Promote date to timestamptz so trades can carry their full timestamp.
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name   = 'trades'
       and column_name  = 'date'
       and data_type    = 'date'
  )
  then
    alter table public.trades
      alter column date type timestamptz using date::timestamptz;
  end if;
end $$;

-- The daily_aggregates view groups by t.date — DROP first because we are
-- changing the column list (you cannot reshape a view with CREATE OR REPLACE,
-- it errors with 42P16). Migration 005 also handles this; this DROP keeps
-- 003 idempotent on its own.
drop view if exists public.daily_aggregates cascade;

create view public.daily_aggregates as
select
  account_id,
  date(date)   as day,
  sum(pnl_usd) as total_pnl
from public.trades
group by account_id, date(date);

grant select on public.daily_aggregates to anon, authenticated;
