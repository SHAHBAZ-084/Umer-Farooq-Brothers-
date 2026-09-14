# Umer Farooq & Brothers POS

Offline desktop point-of-sale for Umer Farooq & Brothers (grain market).

## Stack

- **Desktop:** Electron
- **Frontend:** React + TypeScript + Vite + Tailwind CSS
- **Backend:** Node.js + Express + TypeScript (local, inside Electron)
- **Database:** SQLite via Prisma ORM
- **Auth:** Single local login with session cookies (no JWT, no roles)

## Getting started

```bash
npm install
npm run db:migrate -w backend
npm run db:seed -w backend
npm run dev
```

Default login (change after first use — also set `DEFAULT_ADMIN_USERNAME` / `DEFAULT_ADMIN_PASSWORD` before going live):

- Username: `admin`
- Password: `admin123`

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start backend, Vite frontend, and Electron |
| `npm run electron:build` | Build backend, frontend, and Electron main process |
| `npm start` | Run packaged Electron app (after build) |
| `npm run db:migrate -w backend` | Run Prisma migrations |
| `npm run db:seed -w backend` | Seed default admin user |

## Architecture

- Express API runs on `http://127.0.0.1:3847`
- In development, Vite serves the UI on port `5173` and proxies `/api` to the backend
- In production, Express serves the built frontend and Electron loads `http://127.0.0.1:3847`
- SQLite database file: `backend/prisma/data/grain-pos.db`

## Accounting

Core double-entry accounting is wired up under `/api/accounting/*`:

- Chart of accounts, vouchers, ledger, trial balance, financial years
- Single-shop schema (no `branchId`)
- Default categories and system accounts seeded on first run (no client-specific opening balances)
