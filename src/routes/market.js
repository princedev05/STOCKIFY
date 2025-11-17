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

module.exports = router;
