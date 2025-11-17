const express = require("express");
const router = express.Router();
const db = require("../db");

// create BUY / SELL order
router.post("/buyStock", async (req, res) => {
  try {
    const { user_id, stock_id, order_type, quantity, limit_price } = req.body;
    if (!user_id || !stock_id || !quantity)
      return res.status(400).json({ error: "Missing fields" });
    const params = [
      user_id,
      stock_id,
      "BUY",
      order_type || "MARKET",
      quantity,
      limit_price || null,
    ];
    const r = await db.query(
      "INSERT INTO orders (user_id, stock_id, side, order_type, quantity, limit_price) VALUES (?, ?, ?, ?, ?, ?)",
      params
    );
    res.json({ order_id: r.insertId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

router.post("/sellStock", async (req, res) => {
  try {
    const { user_id, stock_id, order_type, quantity, limit_price } = req.body;
    if (!user_id || !stock_id || !quantity)
      return res.status(400).json({ error: "Missing fields" });
    const params = [
      user_id,
      stock_id,
      "SELL",
      order_type || "MARKET",
      quantity,
      limit_price || null,
    ];
    const r = await db.query(
      "INSERT INTO orders (user_id, stock_id, side, order_type, quantity, limit_price) VALUES (?, ?, ?, ?, ?, ?)",
      params
    );
    res.json({ order_id: r.insertId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// view holdings
router.get("/portfolio/:user_id", async (req, res) => {
  try {
    const { user_id } = req.params;
    const holdings = await db.query(
      "SELECT h.*, s.current_price FROM holdings h JOIN stocks s ON h.stock_id = s.stock_id WHERE h.user_id = ?",
      [user_id]
    );
    res.json({ holdings });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// user history
router.get("/history/:user_id", async (req, res) => {
  try {
    const { user_id } = req.params;
    const tx = await db.query(
      "SELECT * FROM transactions WHERE user_id = ? ORDER BY txn_time DESC LIMIT 200",
      [user_id]
    );
    res.json({ transactions: tx });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
