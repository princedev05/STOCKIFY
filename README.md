# Stock Market Simulation (MySQL + Node)

This repo provides a MySQL schema and a Node.js backend (Express) implementing a simplified stock market simulation with ACID-safe transactions, triggers, stored procedure and a basic matching engine.

Quick start

1. Copy `.env.example` to `.env` and set DB credentials.

2. Install dependencies:

```powershell
npm install
```

3. Run migrations and start in dev (nodemon is used in `dev`):

```powershell
npm run dev
```

Important notes

- The `db/init.sql` contains schema, triggers, `sp_finalize_trade` and an event to adjust prices every 40s.
- `src/migrate.js` runs the SQL file; it attempts to split compound statements by `$$` and execute them.
- The matching engine (`src/matchingEngine.js`) is a simplified implementation.
- Use realistic precautions (secure JWT secret, strong DB user permissions) in production.
