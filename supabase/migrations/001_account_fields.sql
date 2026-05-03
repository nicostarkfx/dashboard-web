-- Add structured columns for trading logic.
-- Safe to re-run: every statement is guarded with IF NOT EXISTS.

alter table public.accounts
  add column if not exists account_size text,
  add column if not exists owner_name   text,
  add column if not exists company      text;

-- Backfill the new columns from the legacy ones so existing rows keep
-- rendering correctly. Owner is split on " · " (the separator used by the
-- previous concatenation pass). If you never used the concatenation it just
-- copies owner -> owner_name and leaves company NULL.
update public.accounts
   set account_size = coalesce(account_size, name),
       owner_name   = coalesce(owner_name,
                               case when position(' · ' in owner) > 0
                                    then split_part(owner, ' · ', 1)
                                    else owner end),
       company      = coalesce(company,
                               case when position(' · ' in owner) > 0
                                    then split_part(owner, ' · ', 2)
                                    else null end)
 where account_size is null
    or owner_name   is null;

-- Useful index for filtering by company in future trading logic.
create index if not exists idx_accounts_company on public.accounts(company);
