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

    // Add to stock_listings
    await db.query(
      "INSERT INTO stock_listings (company_id, stock_id, quantity, price) VALUES (?, ?, ?, ?)",
      [company_id, stock_id, available_shares, current_price]
    );

    res.json({ 
      success: true, 
      stock_id: stock_id, 
      company_id: company_id,
      message: "Stock listed successfully"
    });
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
