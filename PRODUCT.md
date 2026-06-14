# Product Definition: MessSync

MessSync is an offline-first, full-stack meal management and transactional auditing system designed for shared residences, flatshares, and mess halls.

## Surface Classification
- **Classification**: Product Surface (Utility dashboard, transaction tables, database grid)
- **Primary Goal**: Facilitate high-speed daily updates of meal counts, audit incoming member deposits, track bazar expenditures, and maintain monthly balance rollbacks.

## Target Audience
- **Mess Managers**: Power users performing CRUD operations, updating meal counts, entering expenditures, and closing monthly cycles.
- **Mess Members (Viewers)**: View-only users checking their meal rate efficiency, checking balance dues, and validating schedule roster dates.

## Key Workflows
1. **Daily Meals Grid**: Multi-column tabular interface where meal counts (increments of 0.5) are logged for both members and guest accounts.
2. **Shopping Audit**: Logging bazaar descriptions, date of purchase, shopper ID, and total spent.
3. **Rollover Process**: Captures month-end totals, calculates closing balances, archives month metadata, and rolls balances over into the new month.
