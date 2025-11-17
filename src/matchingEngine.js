const db = require("./db");

const POLL_INTERVAL_MS = parseInt(process.env.MATCH_INTERVAL_MS || "3000", 10);

async function matchMarketOrders() {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // Find buy MARKET orders
    const [buyOrders] = await conn.query(
      "SELECT * FROM orders WHERE side='BUY' AND order_type='MARKET' AND status='OPEN' ORDER BY placed_at ASC LIMIT 50"
    );
    for (const buy of buyOrders) {
      // find best sell: lowest price limit or market; prefer limit <= current_price or any OPEN sell
      const [sells] = await conn.query(
        "SELECT * FROM orders WHERE side='SELL' AND status='OPEN' AND stock_id = ? ORDER BY (limit_price IS NULL) ASC, limit_price ASC, placed_at ASC LIMIT 50",
        [buy.stock_id]
      );
      if (!sells || sells.length === 0) continue;
      const sell = sells[0];
      const qty = Math.min(buy.quantity, sell.quantity);
      // use current stock price for market
      const [stocks] = await conn.query(
        "SELECT current_price FROM stocks WHERE stock_id = ? FOR UPDATE",
        [buy.stock_id]
      );
      const price =
        stocks[0] && stocks[0].current_price
          ? stocks[0].current_price
          : sell.limit_price || buy.limit_price || 0;
      // finalize trade via stored procedure inside transaction
      await conn.query("CALL sp_finalize_trade(?,?,?,?,?)", [
        buy.order_id,
        sell.order_id,
        buy.stock_id,
        qty,
        price,
      ]);
    }

    // now try matching LIMIT buy vs LIMIT sell for same stock by price-time priority
    const [limitBuys] = await conn.query(
      "SELECT * FROM orders WHERE side='BUY' AND order_type='LIMIT' AND status='OPEN' ORDER BY limit_price DESC, placed_at ASC LIMIT 50"
    );
    for (const buy of limitBuys) {
      const [candidates] = await conn.query(
        "SELECT * FROM orders WHERE side='SELL' AND order_type='LIMIT' AND status='OPEN' AND stock_id = ? AND limit_price <= ? ORDER BY limit_price ASC, placed_at ASC LIMIT 50",
        [buy.stock_id, buy.limit_price]
      );
      if (!candidates || candidates.length === 0) continue;
      for (const sell of candidates) {
        if (buy.status !== "OPEN") break;
        const qty = Math.min(buy.quantity, sell.quantity);
        await conn.query("CALL sp_finalize_trade(?,?,?,?,?)", [
          buy.order_id,
          sell.order_id,
          buy.stock_id,
          qty,
          sell.limit_price,
        ]);
      }
    }

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    console.error("Matching error", err);
  } finally {
    conn.release();
  }
}

function start() {
  setInterval(() => {
    matchMarketOrders().catch((err) =>
      console.error("matchMarketOrders failed", err)
    );
  }, POLL_INTERVAL_MS);
}

module.exports = { start, matchMarketOrders };
