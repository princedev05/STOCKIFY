# SQL Reference — project-tt

This document documents the SQL used across the project-tt application. It groups the SQL into sections so developers and DBAs can quickly find the definitions, the embedded SQL queries used by the Node server, and the stored procedures & triggers that implement the trading logic.

Files to inspect for full SQL bodies:
- `db/combined_schema.sql` — authoritative combined DDL, triggers and stored procedures (recommended source).
- `db/migrations/002_routines.sql` — legacy migration copy of routines (may overlap with `combined_schema.sql`).

Usage notes
- The application code calls stored procedures (e.g. `sp_place_order`, `sp_finalize_trade`) and also runs parametrized SQL statements from `src/routes` and `src/matchingEngine.js`.
- Many SQL operations are executed inside transactions and use `FOR UPDATE` to lock rows during matching/settlement.

---

## 1) DDL queries (schema)
The main tables created (summarized). See `db/combined_schema.sql` for full CREATE statements.

- `companies` — company metadata (company_id, company_name, sector, website, approved).
- `users` — application users (user_id, username, name, email, password_hash, role, company_id).
- `wallets` — per-user currency balances: `available_balance` and `locked_balance`.
- `stocks` — stock listings (stock_id, company_id, current_price, total_shares, available_shares).
- `orders` — orderbook entries (order_id, user_id, stock_id, side BUY/SELL, order_type LIMIT/MARKET, quantity, limit_price, status, placed_at, executed_at)
- `trades` — executed trades (trade_id, buy_order_id, sell_order_id, stock_id, buyer_id, seller_id, quantity, price, trade_timestamp).
- `holdings` — per-user holdings (user_id, stock_id, total_quantity, avg_buy_price).
- `transactions` — ledger entries (txn_id, user_id, stock_id, txn_type BUY/SELL/DEPOSIT/..., amount, price, txn_status).
- `company_news`, `company_financials` — company-facing data and analytics.

DDL example (short snippet):
```sql
CREATE TABLE IF NOT EXISTS orders (
  order_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  stock_id INT NOT NULL,
  side ENUM('BUY','SELL') NOT NULL,
  order_type ENUM('MARKET','LIMIT') DEFAULT 'LIMIT',
  quantity INT NOT NULL,
  limit_price DECIMAL(18,4),
  status ENUM('OPEN','PARTIAL','FILLED','CANCELLED','REJECTED') DEFAULT 'OPEN',
  placed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  executed_at TIMESTAMP NULL
);
```

---

## 2) DML queries (insert/update/delete examples used at runtime)
These are the typical data-manipulation statements used by the app and by procedures.

- Insert a new order (fallback path from server code):
```sql
INSERT INTO orders (user_id, stock_id, side, order_type, quantity, limit_price)
VALUES (?, ?, ?, ?, ?, ?);
```

- Insert transaction (pending or completed):
```sql
INSERT INTO transactions (user_id, stock_id, txn_type, quantity, price, amount, reference, txn_status)
VALUES (?, ?, 'SELL'|'BUY'|..., ?, ?, ?, 'order:<id>'|'trade:<id>', 'PENDING'|'COMPLETED');
```

- Update wallet balances:
```sql
UPDATE wallets
SET available_balance = available_balance + ?, locked_balance = locked_balance - ?
WHERE user_id = ?;
```

- Update holdings (on buy):
```sql
INSERT INTO holdings (user_id, stock_id, total_quantity, avg_buy_price)
VALUES (?, ?, p_qty, p_price)
ON DUPLICATE KEY UPDATE
  avg_buy_price = ((avg_buy_price * total_quantity) + (p_price * p_qty)) / (total_quantity + p_qty),
  total_quantity = total_quantity + p_qty;
```

---

## 3) Advanced SQL queries (aggregations, ownership, cross-joins)
These queries are used for dashboards and analytics (company shareholder reports, top holders, market lists):

- Shareholders (aggregate holdings per user for a company, compute ownership %):
```sql
SELECT h.user_id,
       u.username,
       u.email,
       SUM(h.total_quantity) AS total_shares,
       ROUND(AVG(h.avg_buy_price),2) AS avg_buy_price,
       CASE WHEN tot.total_company_shares > 0
            THEN ROUND(SUM(h.total_quantity) / tot.total_company_shares * 100,4)
            ELSE 0 END AS ownership_percentage
FROM holdings h
JOIN stocks s ON h.stock_id = s.stock_id
LEFT JOIN users u ON h.user_id = u.user_id
CROSS JOIN (SELECT COALESCE(SUM(total_shares),0) AS total_company_shares FROM stocks WHERE company_id = ?) tot
WHERE s.company_id = ? AND h.total_quantity > 0
GROUP BY h.user_id, u.username, u.email, tot.total_company_shares
ORDER BY total_shares DESC;
```

- Market stock listing with filters (dynamic SQL built in `market.js`):
```sql
SELECT s.stock_id, s.company_id, c.company_name, s.current_price, s.available_shares, s.total_shares, s.listing_date
FROM stocks s
LEFT JOIN companies c ON s.company_id = c.company_id
WHERE 1=1
  [AND s.current_price >= ?]
  [AND s.current_price <= ?]
  [AND (c.company_name LIKE ? OR s.stock_id = ?)]
ORDER BY s.current_price ASC
[LIMIT ? [OFFSET ?]]
```

Explanation: query parameters are appended conditionally by application code.

---

## 4) Embedded SQL queries (all queries present in server code)
The server uses parameterized queries (placeholders `?`) throughout. The most important embedded SQL calls are listed here grouped by file. These strings are executed by the Node app.

- `src/routes/auth.js`
  - `SELECT user_id, name, username, email FROM users WHERE user_id = ?`
  - `SELECT company_id FROM companies WHERE company_id = ?`
  - `INSERT INTO users (username, name, email, password_hash, role, company_id) VALUES (?, ?, ?, ?, ?, ?)`
  - `INSERT INTO wallets (user_id) VALUES (?)`
  - `SELECT user_id, password_hash, role, name, company_id FROM users WHERE username = ? OR email = ?`
  - `UPDATE users SET last_login = NOW() WHERE user_id = ?`

- `src/routes/user.js` (buy/sell, holdings, transactions)
  - `CALL sp_place_order(?,?,?,?,?,?)`
  - `SELECT order_id FROM orders WHERE user_id = ? AND stock_id = ? AND side = 'BUY' ORDER BY placed_at DESC LIMIT 1`
  - `INSERT INTO orders (...) VALUES (...)` (fallback)
  - `INSERT INTO transactions (...) VALUES (...)` (pending/COMPLETED)
  - `SELECT * FROM orders WHERE side='SELL' AND status='OPEN' ... FOR UPDATE`
  - `SELECT current_price FROM stocks WHERE stock_id = ? FOR UPDATE`
  - `CALL sp_finalize_trade(?,?,?,?,?)`
  - `SELECT company_id, available_shares, current_price FROM stocks WHERE stock_id = ? FOR UPDATE`
  - `SELECT user_id FROM users WHERE company_id = ? LIMIT 1`
  - `UPDATE wallets SET available_balance = available_balance + ? WHERE user_id = ?`
  - `UPDATE orders SET settled = 1 WHERE order_id = ?`
  - `SELECT IFNULL(total_quantity,0) AS qty FROM holdings WHERE user_id = ? AND stock_id = ? FOR UPDATE`
  - `SELECT * FROM orders WHERE side='BUY' AND status='OPEN' ... FOR UPDATE`
  - `SELECT ... FROM holdings h JOIN stocks s ... WHERE h.user_id = ?` (portfolio query)
  - `SELECT available_balance, locked_balance FROM wallets WHERE user_id = ?`
  - `SELECT txn_id, stock_id, quantity, price, amount, reference, txn_time AS transaction_date, txn_type AS transaction_type, txn_status AS status FROM transactions WHERE user_id = ? ORDER BY txn_time DESC LIMIT 200`

- `src/routes/market.js`
  - `SELECT * FROM orders WHERE stock_id = ? AND side='BUY' AND status='OPEN' ORDER BY ...`
  - `SELECT * FROM orders WHERE stock_id = ? AND side='SELL' AND status='OPEN' ORDER BY ...`
  - `SELECT * FROM trades WHERE stock_id = ? ORDER BY trade_timestamp DESC LIMIT 500`
  - dynamic `SELECT ... FROM stocks s LEFT JOIN companies c ...` (see section 3)

- `src/routes/company.js` and `companyDashboard.js`
  - `INSERT INTO stocks ... VALUES (...)`
  - `CALL sp_place_order(...)` (company sell orders)
  - `SELECT order_id FROM orders WHERE user_id = ? AND stock_id = ? AND side = 'SELL' ORDER BY placed_at DESC LIMIT 1`
  - `UPDATE wallets SET available_balance = available_balance + ? WHERE user_id = ?` (credit company on listing fallback)
  - `INSERT INTO company_news (...) VALUES (...)` and `SELECT ... FROM company_news ...`
  - company shareholder aggregations (see advanced queries)

- `src/matchingEngine.js`
  - `SELECT * FROM orders WHERE side='BUY' AND order_type='MARKET' AND status='OPEN' ORDER BY placed_at ASC LIMIT 50`
  - `SELECT * FROM orders WHERE side='SELL' AND status='OPEN' AND stock_id = ? ORDER BY (limit_price IS NULL) ASC, limit_price ASC, placed_at ASC LIMIT 50`
  - `SELECT current_price FROM stocks WHERE stock_id = ? FOR UPDATE`
  - `CALL sp_finalize_trade(?,?,?,?,?)`
  - matching for LIMIT orders uses similar SELECTs with price constraints

---

## 5) Stored Procedures and Triggers (high level)
The trading behavior is implemented in the database using procedures and a trigger. See `db/combined_schema.sql` for the complete code. Below are summaries and important notes.

### Trigger: `trg_before_order_insert` (BEFORE INSERT ON `orders`)
- Purpose: Validate and reserve resources when an order is inserted (used for both `sp_place_order` and direct INSERT fallback path).
- Behavior:
  - For BUY orders: computes required amount (limit or current price x quantity), locks the user's `wallets` row (`FOR UPDATE`) and moves `available_balance -> locked_balance`.
  - For SELL orders:
    - If the user has role `company`, it locks `stocks` row and decrements `available_shares`.
    - Otherwise (investor): locks the user's `holdings` row (`FOR UPDATE`) and decrements `total_quantity` to reserve shares.
  - If funds/holdings are insufficient, the trigger signals an error (`SIGNAL SQLSTATE '45000'`).

Important: The trigger performs the reservation step; matching/final settlement is handled in `sp_finalize_trade` which consumes the reserved funds/shares.

### Procedure: `sp_place_order(p_user_id, p_stock_id, p_side, p_order_type, p_quantity, p_limit_price)`
- Purpose: Server-side entry point to place an order in a transaction-safe way.
- Behavior:
  - Validates buyer funds or seller holdings with `FOR UPDATE` locks.
  - Inserts into `orders` (the `BEFORE INSERT` trigger reserves funds/shares).
  - Creates a pending transaction record (`transactions` with `reference='order:<orderId>'`, `txn_status='PENDING'`).
  - Returns the `order_id`.

### Procedure: `sp_finalize_trade(p_buy_order_id, p_sell_order_id, p_stock_id, p_qty, p_price)`
- Purpose: Finalize a matched trade — insert `trades` row, update holdings, update wallets, update orders and transactions.
- Behavior:
  - Inserts `trades` record and captures `LAST_INSERT_ID()` as `trade_id`.
  - Updates buyer `holdings` using `INSERT ... ON DUPLICATE KEY UPDATE` (increase quantity and recompute avg_buy_price).
  - Optionally handles seller settlement depending on whether the seller had been already settled (checks `orders.settled` internally).
  - Updates wallets: deducts buyer `locked_balance` and credits seller `available_balance`.
  - Updates `orders` set `status='FILLED'` and `executed_at=NOW()`.
  - Updates any pending `transactions` whose `reference = 'order:<orderId>'` to `reference = 'trade:<tradeId>'` and `txn_status='COMPLETED'`. If no pending transaction exists, inserts a completed transaction for buyer and seller.
  - Returns `trade_id` to caller.

### Procedure: `sp_cancel_order(p_order_id)`
- Purpose: Cancel an open order and release reserved funds/shares.
- Behavior:
  - Locks the order row, and depending on side BUY/SELL, moves locked funds back to `available_balance` or restores reserved holdings back to `holdings.total_quantity`.
  - Updates order status to `CANCELLED` and updates any pending transaction to `txn_status='CANCELLED'`.

### Other utility procedures
- `sp_create_user_with_wallet(...)` — creates a user + wallet inside a transaction.
- `sp_create_company_with_stock(...)` — creates company and initial stock listing.
- `sp_update_wallet_balance(p_user_id,p_amount,p_txn_type)` — updates wallet balances and inserts a transaction record.

---

## 6) Concurrency and transactional safeguards (notes)
- Important SQL patterns used:
  - `SELECT ... FOR UPDATE` to lock rows (wallets, holdings, stocks) during checks and reservation.
  - `START TRANSACTION` / `COMMIT` / `ROLLBACK` in stored procedures and in Node server when multiple statements must be atomic.
  - `INSERT ... ON DUPLICATE KEY UPDATE` to update holdings atomically.
  - Use of `transactions` table as a ledger; pending order entries use `reference='order:<id>'` and are updated to `trade:<id>'` on settlement.

## 7) Example usage (quick)
- Place an order using the stored procedure:
```sql
CALL sp_place_order(1, 1, 'BUY', 'LIMIT', 10, 100.00);
```

- Finalize a trade (usually called by matching engine or server when matching buy/sell):
```sql
CALL sp_finalize_trade(101, 202, 1, 5, 100.00);
-- returns trade_id
```

- Cancel an order:
```sql
CALL sp_cancel_order(123);
```

---

## 8) Where to modify / extend
- Update `db/combined_schema.sql` when changing schema, triggers, or procedures. Re-run it in MySQL Workbench or use an improved `migrate.js` that runs `combined_schema.sql`.
- Server-side SQL strings are located in `src/routes/*.js` and `src/matchingEngine.js` — these are the embedded SQL queries used in runtime.

## 9) Short checklist before changing DB logic
- Add tests or use the `scripts/*_flow.js` scripts to perform smoke tests after any change.
- Always backup production data and export relevant tables before applying destructive changes.
- If you change procedures, update both `db/combined_schema.sql` and `db/migrations/002_routines.sql` (if you keep it) to keep history consistent.

---

If you want, I can:
- Add a generated file `dev/embedded-sql.txt` listing every embedded SQL string (exactly as executed).
- Update `src/migrate.js` to run `db/combined_schema.sql` automatically on server start (if you prefer automated migrations).
- Add example SQL to set `orders.settled = 1` where appropriate or modify `sp_finalize_trade` to set the `settled` flag (if you want explicit settlement tracking).

