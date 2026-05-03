# Trading Dashboard

Dark-neon HUD dashboard for managing multiple funded trading accounts (For Traders, Elevate). Built with Next.js (App Router), Tailwind CSS and Supabase.

## Quick start

```bash
# 1. install
npm install

# 2. configure
cp .env.local.example .env.local
# fill in your Supabase URL + keys

# 3. database
# In the Supabase SQL editor, run, in order:
#   supabase/schema.sql
#   supabase/seed.sql   (optional sample data)

# 4. run
npm run dev
# open http://localhost:3000/account/300001
```

## Account types

| Code                  | Payout | Consistency | min_days | min_daily_% |
|-----------------------|--------|-------------|----------|-------------|
| FT_INSTANT            | 15 d   | daily 15%   | 7        | 0.50%       |
| ELEVATE_INSTANT_FUND  | 21 d   | trade 35%   | 10       | 0.30%       |
| ELEVATE_INSTANT_PRO   | 21 d   | trade 50%   | 5        | 0.30%       |

## Routes

- `/`                              — index of all accounts
- `/account/[account_number]`      — full HUD dashboard for one account
- `POST /api/payout/[account_number]` — closes the active cycle and opens a new one
- `GET  /api/export/[account_number]` — CSV export of the active cycle

## Stack

- Next.js 14 App Router (Server Components + Server Actions)
- Tailwind CSS (custom HUD theme in `tailwind.config.ts`)
- Recharts for the equity curve
- Supabase (Postgres + RLS + RPC functions)
