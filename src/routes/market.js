const express = require("express");
const router = express.Router();
const db = require("../db");

router.get("/orderbook/:stock_id", async (req, res) => {
  try {
    const { stock_id } = req.params;
    const buys = await db.query(
      "SELECT * FROM orders WHERE stock_id = ? AND side='BUY' AND status='OPEN' ORDER BY (limit_price IS NULL) ASC, limit_price DESC, placed_at ASC",
      [stock_id]
    );
    const sells = await db.query(
      "SELECT * FROM orders WHERE stock_id = ? AND side='SELL' AND status='OPEN' ORDER BY (limit_price IS NULL) ASC, limit_price ASC, placed_at ASC",
      [stock_id]
    );
    res.json({ buys, sells });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/trades/:stock_id", async (req, res) => {
  try {
    const { stock_id } = req.params;
    const trades = await db.query(
      "SELECT * FROM trades WHERE stock_id = ? ORDER BY trade_timestamp DESC LIMIT 500",
      [stock_id]
    );
    res.json({ trades });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// List available stocks with optional filters: min_price, max_price, q (company name), limit, offset
router.get("/stocks", async (req, res) => {
  try {
    const { min_price, max_price, q, limit, offset } = req.query;
    let sql = `SELECT s.stock_id, s.company_id, c.company_name, s.current_price, s.available_shares, s.total_shares, s.listing_date
               FROM stocks s
               LEFT JOIN companies c ON s.company_id = c.company_id
               WHERE 1=1`;
    const params = [];

    if (min_price !== undefined) {
      sql += " AND s.current_price >= ?";
      params.push(parseFloat(min_price));
    }
    if (max_price !== undefined) {
      sql += " AND s.current_price <= ?";
      params.push(parseFloat(max_price));
    }
    if (q) {
      sql += " AND (c.company_name LIKE ? OR s.stock_id = ?)";
      params.push(`%${q}%`);
      // allow searching by numeric stock_id as exact match
      const maybeId = parseInt(q);
      params.push(isNaN(maybeId) ? -1 : maybeId);
    }

    sql += " ORDER BY s.current_price ASC";
    if (limit) {
      sql += " LIMIT ?";
      params.push(parseInt(limit));
      if (offset) {
        sql += " OFFSET ?";
        params.push(parseInt(offset));
      }
    }

    const rows = await db.query(sql, params);
    res.json({ stocks: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
