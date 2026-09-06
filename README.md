# Outlay — Smarter Spending Insights

A full-stack finance dashboard that categorizes spending, tracks multiple
wallets/accounts, detects recurring expenses automatically, and alerts you
when you're approaching a budget limit.

**Stack:** React + Tailwind (frontend) · Node/Express + PostgreSQL (backend) · JWT auth · Recharts

## What's built (Phase 1–3)

- ✅ JWT auth (signup/login/refresh/logout) with hashed passwords & hashed refresh tokens
- ✅ **Multiple wallets/accounts** (cash, bank, credit, savings) with computed balances
- ✅ Category and transaction CRUD, with **edit support** from the transaction list
- ✅ **Transfers between wallets** — kept separate from income/expense so they never skew analytics
- ✅ CSV import for bulk transaction entry
- ✅ Category-based analytics (monthly summary, 6-month trend) via SQL aggregation
- ✅ Recurring expense detection algorithm (merchant + amount clustering + interval matching)
- ✅ **Budget goals with a full add/delete UI**, usage %, over-budget and alert-threshold flags
- ✅ Dark mode that actually themes native controls correctly (`color-scheme` synced to the
  active theme, not just Tailwind classes) — dropdowns, date pickers, etc. all match
- ✅ Responsive dashboard with Recharts (line + pie charts)
- ✅ Rate limiting on auth routes, centralized error handling, input validation

## Not yet built (see Roadmap below)

- OAuth (Google login)
- Cloudinary receipt uploads
- Tests (Jest/Supertest)
- Deployment configs for Vercel/Render
- Per-wallet filtering on analytics charts (backend already accepts a `walletId` filter on
  the transaction list endpoint; the dashboard charts don't use it yet)

## Project structure

```
outlay/
├── backend/
│   ├── src/
│   │   ├── routes/          # auth, categories, transactions, budgets, wallets, transfers
│   │   ├── middleware/      # requireAuth, errorHandler
│   │   ├── utils/           # tokens, recurringDetection (the "smart" algorithm)
│   │   ├── db/              # pool.js, schema.sql, migrate.js
│   │   ├── app.js
│   │   └── server.js
│   ├── .env.example
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── pages/           # Login, Signup, Dashboard
│   │   ├── context/         # AuthContext, ThemeContext (dark mode)
│   │   ├── components/      # TransactionModal, TransactionList, BudgetModal,
│   │   │                    # WalletManagerModal, ProtectedRoute, StatCard
│   │   └── api/client.js    # axios instance with auto token refresh
│   ├── .env.example
│   └── package.json
└── docker-compose.yml        # local Postgres
```

## Local setup

**1. Start Postgres**
```bash
docker compose up -d
```

**2. Backend**
```bash
cd backend
cp .env.example .env      # fill in JWT secrets (any random string for local dev)
npm install
npm run migrate           # applies schema.sql
npm run dev                # http://localhost:5000
```

**3. Frontend**
```bash
cd frontend
cp .env.example .env
npm install
npm run dev                # http://localhost:5173
```

Sign up for an account in the UI — you'll get a default "Cash" wallet and a
default set of categories (Groceries, Rent, Transport, etc.) automatically.

> **Upgrading from an earlier copy of this project?** The schema now includes
> `wallets` and `transfers` tables and a `wallet_id` column on `transactions`.
> Re-run `npm run migrate` after pulling the new `schema.sql` (it's idempotent —
> safe to run again on an existing database, since every statement uses
> `CREATE TABLE IF NOT EXISTS`). Existing rows will just have a `null` wallet_id
> until you edit them to assign a wallet.

## Trying out the features

- **Wallets**: click the wallet button in the header (shows wallet count + total
  balance) to add a new wallet (bank, credit card, etc.) or delete one.
- **Transactions**: "+ Add transaction" opens a modal with three modes —
  Expense, Income, Transfer — each with different fields. Hover a row in
  "Recent transactions" to Edit or Delete it.
- **Recurring detection**: import a CSV with the same merchant/amount
  appearing 3+ times at roughly monthly intervals (`POST /api/transactions/import`,
  multipart field name `file`), or add transactions manually — then call
  `POST /api/transactions/detect-recurring`. Matches show a "Recurring" badge.
- **Budgets**: "+ Add budget" on the Budgets card — pick a category, a
  monthly limit, and an alert threshold. The dashboard shows a progress bar
  and banner once you cross that threshold.

## API overview

| Method | Route | Description |
|---|---|---|
| POST | `/api/auth/signup` | Create account, seeds default categories + a "Cash" wallet |
| POST | `/api/auth/login` | Get access + refresh token |
| POST | `/api/auth/refresh` | Exchange refresh token for new access token |
| POST | `/api/auth/logout` | Revoke a refresh token |
| GET/POST | `/api/categories` | List / create categories |
| GET/POST | `/api/wallets` | List (with computed balances) / create wallets |
| DELETE | `/api/wallets/:id` | Delete a wallet (blocked if it's your last one) |
| GET/POST | `/api/transfers` | List / create a transfer between two wallets |
| DELETE | `/api/transfers/:id` | Delete a transfer |
| GET/POST | `/api/transactions` | List (filterable by category/wallet/type/date) / create |
| PUT/DELETE | `/api/transactions/:id` | Update / delete a transaction |
| POST | `/api/transactions/import` | CSV bulk import |
| POST | `/api/transactions/detect-recurring` | Re-run recurring detection |
| GET | `/api/transactions/analytics/summary?month=&year=` | Monthly totals + category breakdown |
| GET | `/api/transactions/analytics/trend?months=6` | Income/expense trend |
| GET/POST/DELETE | `/api/budgets` | Manage monthly budgets |

## Roadmap (Phase 4 — production hardening)

- [ ] Google OAuth login
- [ ] Cloudinary receipt image upload on transactions
- [ ] Jest + Supertest test suite for routes and recurring-detection logic
- [ ] Dockerfile for backend, deploy to Render/Railway
- [ ] Deploy frontend to Vercel, wire `VITE_API_URL` to production backend
- [ ] Scheduled job (cron) to re-run recurring detection nightly instead of only on import
- [ ] Per-wallet analytics filtering on the dashboard
- [ ] Export monthly report as PDF/CSV

## Resume bullet ideas (once deployed)

- Built a full-stack multi-account expense tracker with PostgreSQL aggregation
  queries powering category analytics and a custom algorithm to auto-detect
  recurring transactions from spending patterns.
- Implemented JWT-based auth with hashed refresh-token rotation, rate-limited
  endpoints, and centralized error handling; deployed on Render + Vercel.
