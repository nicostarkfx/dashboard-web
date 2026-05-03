-- ============================================================================
-- 005_force_reset_daily_aggregates.sql
--
-- FORCE-RESET of public.daily_aggregates.
--
-- Why this exists:
--   The error "42P16: cannot change name of view column 'day' to 'cycle_id'"
--   means SOMETHING called public.daily_aggregates already exists with a
--   DIFFERENT column shape than the new definition. Postgres refuses to
--   silently rename columns inside a view via CREATE OR REPLACE VIEW.
--
--   A previous DROP VIEW may not have actually removed the object because:
--     * the object is a MATERIALIZED VIEW, not a regular view (DROP VIEW
--       won't touch it, you need DROP MATERIALIZED VIEW)
--     * the object is actually a TABLE that was accidentally created with
--       that name (DROP VIEW won't touch it either)
--     * dependent views block the drop unless CASCADE is used
--     * the migration was run inside a transaction that rolled back
--
-- Strategy: enumerate pg_class for ANY relation named 'daily_aggregates' in
-- the public schema and dispatch the correct DROP command based on relkind:
--   'v' -> view, 'm' -> materialized view, 'r' -> table, 'f' -> foreign table
-- All drops use CASCADE so dependent rules/views/policies go with it.
--
-- This script is fully idempotent and survives any partial prior state.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 0) DIAGNOSTIC: surface the current state of any 'daily_aggregates' relation
--    BEFORE we touch anything. The NOTICE messages show up in the SQL editor
--    so you can see exactly what was there.
-- ----------------------------------------------------------------------------
do $$
declare
  r record;
  found_count int := 0;
begin
  for r in
    select n.nspname as schema_name,
           c.relname as rel_name,
           c.relkind as rel_kind
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where c.relname = 'daily_aggregates'
       and n.nspname = 'public'
  loop
    found_count := found_count + 1;
    raise notice 'Found pre-existing public.daily_aggregates: relkind=% (%)',
      r.rel_kind,
      case r.rel_kind
        when 'r' then 'ordinary table'
        when 'v' then 'view'
        when 'm' then 'materialized view'
        when 'f' then 'foreign table'
        when 'p' then 'partitioned table'
        else 'unknown'
      end;
  end loop;
  if found_count = 0 then
    raise notice 'No pre-existing public.daily_aggregates found. Will create fresh.';
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 1) FORCE-DROP every relation named public.daily_aggregates regardless of
--    type. We loop over pg_class and dispatch on relkind so we always issue
--    the *correct* DROP command. CASCADE removes dependent objects.
--
--    We also drop pg_matviews and pg_views matches as a belt-and-suspenders
--    pass — the pg_class loop should already cover both, but doing all three
--    means we cannot possibly miss anything.
-- ----------------------------------------------------------------------------
do $$
declare
  r record;
begin
  -- 1a) Drop materialized views first (DROP VIEW does NOT remove these)
  for r in
    select schemaname, matviewname
      from pg_matviews
     where schemaname = 'public'
       and matviewname = 'daily_aggregates'
  loop
    raise notice 'Dropping materialized view %.%', r.schemaname, r.matviewname;
    execute format('drop materialized view if exists %I.%I cascade',
                   r.schemaname, r.matviewname);
  end loop;

  -- 1b) Drop regular views
  for r in
    select schemaname, viewname
      from pg_views
     where schemaname = 'public'
       and viewname = 'daily_aggregates'
  loop
    raise notice 'Dropping view %.%', r.schemaname, r.viewname;
    execute format('drop view if exists %I.%I cascade',
                   r.schemaname, r.viewname);
  end loop;

  -- 1c) Final pg_class sweep — catches tables, foreign tables, partitioned
  --     tables, or anything else still lingering with that name.
  for r in
    select n.nspname as schema_name,
           c.relname as rel_name,
           c.relkind as rel_kind
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where c.relname = 'daily_aggregates'
       and n.nspname = 'public'
  loop
    raise notice 'Force-dropping leftover %.% (relkind=%)',
      r.schema_name, r.rel_name, r.rel_kind;
    case r.rel_kind
      when 'v' then
        execute format('drop view if exists %I.%I cascade',
                       r.schema_name, r.rel_name);
      when 'm' then
        execute format('drop materialized view if exists %I.%I cascade',
                       r.schema_name, r.rel_name);
      when 'r', 'p' then
        execute format('drop table if exists %I.%I cascade',
                       r.schema_name, r.rel_name);
      when 'f' then
        execute format('drop foreign table if exists %I.%I cascade',
                       r.schema_name, r.rel_name);
      else
        raise warning 'Unhandled relkind % for %.%, skipping',
          r.rel_kind, r.schema_name, r.rel_name;
    end case;
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 2) VERIFY the drops actually worked. If anything remains, raise so the
--    transaction rolls back and we don't end up creating the view on top of
--    a stale object.
-- ----------------------------------------------------------------------------
do $$
declare
  remaining int;
begin
  select count(*) into remaining
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where c.relname = 'daily_aggregates'
     and n.nspname = 'public';
  if remaining > 0 then
    raise exception
      'public.daily_aggregates still exists after force-drop pass (count=%). Aborting.',
      remaining;
  end if;
  raise notice 'Verified: no public.daily_aggregates remains. Safe to recreate.';
end $$;

-- ----------------------------------------------------------------------------
-- 3) RECONCILE trades.direction -> trades.side rename, if still pending.
--    Done before view recreation so the view text below doesn't have to know
--    which name is current (and so any future view that references `side`
--    works cleanly).
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
    raise notice 'Renaming trades.direction -> trades.side';
    alter table public.trades rename column direction to side;
  else
    raise notice 'trades.side already in place (or trades.direction missing). Skipping rename.';
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 4) PROMOTE trades.date from `date` -> `timestamptz`, idempotently.
--    Uses the column's actual data_type from information_schema so it only
--    runs when needed.
-- ----------------------------------------------------------------------------
do $$
declare
  current_type text;
begin
  select data_type
    into current_type
    from information_schema.columns
   where table_schema = 'public'
     and table_name   = 'trades'
     and column_name  = 'date';

  if current_type is null then
    raise exception 'public.trades.date does not exist. Schema is broken.';
  elsif current_type = 'date' then
    raise notice 'Promoting trades.date from date -> timestamptz';
    alter table public.trades
      alter column date type timestamptz using date::timestamptz;
  elsif current_type = 'timestamp with time zone' then
    raise notice 'trades.date is already timestamptz. Skipping.';
  else
    raise warning 'trades.date is unexpected type "%" — leaving alone.', current_type;
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 5) CREATE the view from scratch with the canonical shape.
--    No CREATE OR REPLACE — we proved above that the relation is gone.
--    DATE(date) works for both `date` and `timestamptz`.
-- ----------------------------------------------------------------------------
create view public.daily_aggregates as
select
    account_id,
    date(date)   as day,
    sum(pnl_usd) as total_pnl
from public.trades
group by account_id, date(date);

-- ----------------------------------------------------------------------------
-- 6) Restore read grants for the API roles. Idempotent — safe to re-run.
-- ----------------------------------------------------------------------------
grant select on public.daily_aggregates to anon, authenticated;

commit;

-- ============================================================================
-- 7) POST-COMMIT SANITY READBACK
--    These run AFTER commit so you can see the final state in the SQL editor.
--    They never modify anything.
-- ============================================================================

-- 7a) Confirm exactly one daily_aggregates exists, and it is a view (relkind 'v')
select n.nspname as schema_name,
       c.relname as rel_name,
       c.relkind as rel_kind,
       case c.relkind
         when 'v' then 'view'
         when 'm' then 'materialized view'
         when 'r' then 'table'
         when 'f' then 'foreign table'
         else c.relkind::text
       end as kind_label
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where c.relname = 'daily_aggregates'
   and n.nspname = 'public';

-- 7b) Confirm trades schema reflects the renames/type changes
select column_name, data_type
  from information_schema.columns
 where table_schema = 'public'
   and table_name   = 'trades'
   and column_name in ('date', 'side', 'direction')
 order by column_name;

-- 7c) Confirm view columns are exactly (account_id, day, total_pnl)
select column_name, data_type, ordinal_position
  from information_schema.columns
 where table_schema = 'public'
   and table_name   = 'daily_aggregates'
 order by ordinal_position;
