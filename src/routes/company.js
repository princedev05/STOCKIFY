const express = require("express");
const router = express.Router();
const db = require("../db");
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "devsecret";

// Middleware to verify JWT token
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) {
    return res.status(401).json({ error: "No token provided" });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: "Invalid token" });
  }
};

// Get company info for logged-in user
router.get("/info", verifyToken, async (req, res) => {
  try {
    const { user_id } = req.user;
    const rows = await db.query(
      "SELECT u.user_id, u.username, c.* FROM users u LEFT JOIN companies c ON u.company_id = c.company_id WHERE u.user_id = ?",
      [user_id]
    );
    if (!rows.length) {
      return res.status(404).json({ error: "User not found" });
    }
    const company = rows[0];
    if (!company.company_id) {
      return res.status(403).json({ error: "User is not associated with a company" });
    }
    res.json(company);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Company lists new stock
router.post("/listStock", verifyToken, async (req, res) => {
  try {
    const { user_id } = req.user;
    const { lot_size, current_price, total_shares, available_shares } = req.body;
    
    // Get company_id for the user
    const userRows = await db.query(
      "SELECT company_id, role FROM users WHERE user_id = ?",
      [user_id]
    );
    
    if (!userRows.length || userRows[0].role !== 'company') {
      return res.status(403).json({ error: "Only companies can list stocks" });
    }
    
    const company_id = userRows[0].company_id;
    if (!company_id) {
      return res.status(403).json({ error: "User is not associated with a company" });
    }
    
    // Validate required fields
    if (current_price === undefined || total_shares === undefined || available_shares === undefined) {
      return res.status(400).json({ error: "Missing required fields: current_price, total_shares, available_shares" });
    }
    
    // Create stock row
    const stockRes = await db.query(
      "INSERT INTO stocks (company_id, listing_date, lot_size, current_price, total_shares, available_shares) VALUES (?, CURDATE(), ?, ?, ?, ?)",
      [company_id, lot_size || 1, current_price, total_shares, available_shares]
    );
    const stock_id = stockRes.insertId;

      // stock_listings table removed from schema; we keep listing in `stocks` only

    // Create a corresponding SELL limit order for the company using stored procedure so DB logic (locking) runs
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      let orderId = null;
      try {
        // Try stored procedure first
        await conn.query("CALL sp_place_order(?,?,?,?,?,?)", [user_id, stock_id, 'SELL', 'LIMIT', available_shares, current_price]);
        const [orderRows] = await conn.query(
          "SELECT order_id FROM orders WHERE user_id = ? AND stock_id = ? AND side = 'SELL' ORDER BY placed_at DESC LIMIT 1",
          [user_id, stock_id]
        );
        orderId = orderRows && orderRows.length ? orderRows[0].order_id : null;
      } catch (procErr) {
        // Fallback: procedure missing or failed — insert order directly
        console.warn('sp_place_order failed, falling back to direct insert:', procErr.message || procErr);
        const [r] = await conn.query(
          "INSERT INTO orders (user_id, stock_id, side, order_type, quantity, limit_price) VALUES (?, ?, 'SELL', 'LIMIT', ?, ?)",
          [user_id, stock_id, available_shares, current_price]
        );
        orderId = r.insertId;
        try {
          // immediate settlement for fallback: credit company and insert completed txn
          await conn.query("UPDATE wallets SET available_balance = available_balance + ? WHERE user_id = ?", [current_price * available_shares, user_id]);
          await conn.query(
            "INSERT INTO transactions (user_id, stock_id, txn_type, quantity, price, amount, reference, txn_status) VALUES (?, ?, 'SELL', ?, ?, ?, ?, 'COMPLETED')",
            [user_id, stock_id, available_shares, current_price, current_price * available_shares, `order:${orderId}`]
          );
          await conn.query("UPDATE orders SET settled = 1 WHERE order_id = ?", [orderId]);
        } catch (txErr) {
          console.warn('Failed to credit company or insert completed SELL transaction for company listing:', txErr.message || txErr);
        }
      }

      await conn.commit();
      res.json({
        success: true,
        stock_id: stock_id,
        company_id: company_id,
        orderId: orderId,
        message: "Stock listed successfully and sell order created"
      });
    } catch (err) {
      await conn.rollback().catch(() => {});
      console.error('Failed to create company sell order', err);
      res.json({ success: true, stock_id: stock_id, company_id: company_id, message: 'Stock listed but failed to create sell order' });
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Get all stocks for a company
router.get("/stocks", verifyToken, async (req, res) => {
  try {
    const { user_id } = req.user;
    
    const userRows = await db.query(
      "SELECT company_id FROM users WHERE user_id = ?",
      [user_id]
    );
    
    if (!userRows.length || !userRows[0].company_id) {
      return res.status(403).json({ error: "User is not associated with a company" });
    }
    
    const company_id = userRows[0].company_id;
    const stocks = await db.query(
      "SELECT * FROM stocks WHERE company_id = ?",
      [company_id]
    );
    
    res.json(stocks);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Admin approve company
router.post("/approveCompany", async (req, res) => {
  try {
    const { company_id } = req.body;
    if (!company_id)
      return res.status(400).json({ error: "company_id required" });
    await db.query("UPDATE companies SET approved = 1 WHERE company_id = ?", [
      company_id,
    ]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

// Create company (public endpoint used by company signup page)
router.post('/create', async (req, res) => {
  try {
    const { company_name, sector, website, description } = req.body;
    if (!company_name) return res.status(400).json({ error: 'company_name required' });
    const r = await db.query(
      'INSERT INTO companies (company_name, sector, website, description) VALUES (?, ?, ?, ?)',
      [company_name, sector || null, website || null, description || null]
    );
    res.json({ company_id: r.insertId });
  } catch (err) {
    console.error('company.create failed', err);
    res.status(500).json({ error: err.message });
  }
});
