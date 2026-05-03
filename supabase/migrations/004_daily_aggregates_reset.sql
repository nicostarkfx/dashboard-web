-- ============================================================================
-- 004_daily_aggregates_reset.sql
--
-- Safe, idempotent reset of public.daily_aggregates plus the trades.date type
-- promotion that the previous migration left half-applied.
--
-- Why a full DROP + CREATE (not CREATE OR REPLACE):
--   CREATE OR REPLACE VIEW only lets you change column expressions, NOT add,
--   remove or rename columns. The error you hit
--     "42P16: cannot change name of view column 'day' to 'cycle_id'"
--   is exactly that constraint firing because the new shape has different
--   columns from the old one. The only safe path is DROP CASCADE + CREATE.
--
-- The script handles every partial state we've seen so far:
--   * the view exists with the OLD shape  (cycle_id, trades_count, ...)
--   * the view exists with the NEW shape  (account_id, day, total_pnl)
--   * the view doesn't exist at all
--   * trades.date is still `date`
--   * trades.date has already been promoted to `timestamptz`
--   * direction column wasn't renamed to side yet
--   * direction column has already been renamed
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1) Drop the view and anything that depends on it.
--    CASCADE is required: we cannot ALTER VIEW our way out of a column-list
--    change, and we don't want a leftover dependent view blocking the drop.
-- ----------------------------------------------------------------------------
drop view if exists public.daily_aggregates cascade;

-- ----------------------------------------------------------------------------
-- 2) Reconcile the trades.direction -> trades.side rename, if it's still
--    pending. Done before the type change so any future view recreates can
--    reference `side` cleanly.
-- ----------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name   = 'trades'
       and column_name  = 'direction'
  )
  and not exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name   = 'trades'
       and column_name  = 'side'
  )
  then
    alter table public.trades rename column direction to side;
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 3) Promote trades.date from `date` to `timestamptz`. Only runs when the
--    column is still the legacy `date` type.
-- ----------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1
      from information_schema.columns
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

-- ----------------------------------------------------------------------------
-- 4) Recreate daily_aggregates with the canonical shape.
--    DATE(date) works whether the column is `date` or `timestamptz`.
-- ----------------------------------------------------------------------------
create view public.daily_aggregates as
select
    account_id,
    date(date)    as day,
    sum(pnl_usd)  as total_pnl
from public.trades
group by account_id, date(date);

-- ----------------------------------------------------------------------------
-- 5) Restore the read grants the original schema gave to the API roles.
--    Safe to re-grant; idempotent.
-- ----------------------------------------------------------------------------
grant select on public.daily_aggregates to anon, authenticated;

commit;

-- ----------------------------------------------------------------------------
-- 6) Sanity readback — surfaces the final state when run from the SQL editor.
-- ----------------------------------------------------------------------------
select column_name, data_type
  from information_schema.columns
 where table_schema = 'public'
   and table_name   = 'trades'
   and column_name in ('date','side','direction')
 order by column_name;

select column_name, data_type
  from information_schema.columns
 where table_schema = 'public'
   and table_name   = 'daily_aggregates'
 order by ordinal_position;
