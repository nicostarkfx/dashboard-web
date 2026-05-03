-- ============================================================
-- Seed real funded accounts (verified data).
-- Safe to run multiple times: WHERE NOT EXISTS guards prevent
-- duplicate inserts on account_number.
-- ============================================================

with seed (account_number, account_size, ui_type, owner_name, company, balance) as (
  values
    ('822557', '3K',         'FT Instant',     'Nico', 'For Traders',    3000),
    ('733573', '6K',         'FT Instant',     'Nico', 'For Traders',    6000),
    ('961532', '15K',        'FT Instant',     'Nico', 'For Traders',   15000),
    ('702111', '25K PRO',    'Elevate Pro',    'Nico', 'Elevate',       25000),
    ('806625', '25K PRO',    'Elevate Pro',    'Fola', 'Elevate',       25000),
    ('823747', '25K PRO',    'Elevate Pro',    'Fola', 'Elevate',       25000),
    ('702888', '25K FUND',   'Elevate Fund',   'Nico', 'Elevate',       25000),
    ('776241', '100K FUND',  'Elevate Fund',   'Nico', 'Elevate',      100000)
)
insert into public.accounts (
    account_number,
    account_size,
    account_type,
    owner_name,
    company,
    name,             -- legacy mirror of account_size
    owner,            -- legacy mirror of owner_name
    initial_balance
)
select
    s.account_number,
    s.account_size,
    case s.ui_type
        when 'FT Instant'   then 'FT_INSTANT'
        when 'Elevate Pro'  then 'ELEVATE_INSTANT_PRO'
        when 'Elevate Fund' then 'ELEVATE_INSTANT_FUND'
    end                                    as account_type,
    s.owner_name,
    s.company,
    s.account_size                         as name,
    s.owner_name                           as owner,
    s.balance                              as initial_balance
from seed s
where not exists (
    select 1
      from public.accounts a
     where a.account_number = s.account_number
);

-- Make sure every account has an active cycle so the dashboard can render
-- straight away. The function is idempotent — it only opens a cycle when
-- none is currently active for the account.
select public.ensure_active_cycle(id) from public.accounts;

-- Quick visual confirmation when run from the SQL editor.
select account_number, account_size, account_type, owner_name, company, initial_balance
  from public.accounts
 order by created_at;
