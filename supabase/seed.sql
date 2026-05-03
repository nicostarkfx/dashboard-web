-- Optional sample data so the dashboard renders something useful out of the box.
-- Run AFTER schema.sql in the Supabase SQL editor.

-- 1) Two accounts, one of each major type
insert into public.accounts (name, account_number, owner, account_type, initial_balance) values
  ('3K',  '300001', 'Nico', 'FT_INSTANT',           3000),
  ('25K', '250025', 'Nico', 'ELEVATE_INSTANT_PRO', 25000)
on conflict (account_number) do nothing;

-- 2) Make sure each has an active cycle
select public.ensure_active_cycle(id) from public.accounts;

-- 3) A few trades for the 3K account
with acct as (
  select a.id as account_id, c.id as cycle_id, a.initial_balance
  from public.accounts a
  join public.cycles c on c.account_id = a.id and c.status = 'active'
  where a.account_number = '300001'
)
insert into public.trades (account_id, cycle_id, date, pair, direction, result, pnl_usd, pnl_percent)
select
  acct.account_id, acct.cycle_id, d::date, pair, dir::trade_direction, res::trade_result, pnl,
  round((pnl / acct.initial_balance) * 100, 4)
from acct,
(values
  (current_date - 6, 'EURUSD', 'long',  'win',       45.0),
  (current_date - 6, 'GBPUSD', 'short', 'loss',     -22.0),
  (current_date - 5, 'XAUUSD', 'long',  'win',       60.0),
  (current_date - 4, 'NAS100', 'long',  'win',       80.0),
  (current_date - 4, 'EURUSD', 'short', 'breakeven',  0.0),
  (current_date - 3, 'XAUUSD', 'short', 'loss',     -35.0),
  (current_date - 2, 'GBPUSD', 'long',  'win',       28.0),
  (current_date - 1, 'NAS100', 'long',  'win',       55.0)
) as v(d, pair, dir, res, pnl);
