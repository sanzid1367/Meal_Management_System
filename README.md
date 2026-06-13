# Local Mess Meal Manager

Offline-first mess/meal management app for monthly member meals, deposits, expenses, balances, rollover, roster, and CSV export.

## Run Locally

Double-click `start-local.bat`, or run:

```powershell
.\start-local.bat
```

Then open:

```text
http://127.0.0.1:8000
```

The SQLite database is stored at:

```text
backend\data\meal_manager.db
```

## Development

Backend:

```powershell
.\.venv\Scripts\python.exe -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
```

Frontend dev server:

```powershell
cd frontend
npm.cmd run dev -- --port 5173
```

The Vite dev server proxies `/api` requests to FastAPI.

## Included Features

- Member add/drop/restore with inactive historical records
- Deposit ledger with edit support
- Expense ledger with edit support and optional shopper
- Daily lunch/dinner meal grid with half meals and guest meals
- Dashboard totals, meal rate, cash-in-hand, book balance, and person-wise balances
- Bazar roster
- Close month with rollover opening balances
- CSV export for monthly summary
