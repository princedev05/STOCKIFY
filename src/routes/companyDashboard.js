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

// ===== FINANCIAL DASHBOARD =====

// Get company financial dashboard
router.get("/financials", verifyToken, async (req, res) => {
  try {
    const { user_id } = req.user;
    
    // Get company_id for user
    const userRows = await db.query(
      "SELECT company_id FROM users WHERE user_id = ?",
      [user_id]
    );
    
    if (!userRows.length || !userRows[0].company_id) {
      return res.status(403).json({ error: "User is not associated with a company" });
    }
    
    const company_id = userRows[0].company_id;
    
    // Get or create company financials
    let financials = await db.query(
      "SELECT * FROM company_financials WHERE company_id = ?",
      [company_id]
    );
    
    if (!financials.length) {
      // Create initial record
      await db.query(
        "INSERT INTO company_financials (company_id) VALUES (?)",
        [company_id]
      );
      financials = await db.query(
        "SELECT * FROM company_financials WHERE company_id = ?",
        [company_id]
      );
    }
    
    // Get stock info
    const stocks = await db.query(
      "SELECT * FROM stocks WHERE company_id = ?",
      [company_id]
    );
    
    // Get shareholder count
    const shareholderRows = await db.query(
      "SELECT COUNT(*) as count FROM shareholders WHERE company_id = ? AND status = 'active'",
      [company_id]
    );
    
    // Calculate market cap
    let marketCap = 0;
    if (stocks.length > 0) {
      const stock = stocks[0];
      marketCap = stock.current_price * stock.total_shares;
    }
    
    res.json({
      ...financials[0],
      stocks: stocks,
      shareholder_count: shareholderRows[0].count,
      market_cap: marketCap
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ===== COMPANY NEWS =====

// Get all company news
router.get("/news", verifyToken, async (req, res) => {
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
    
    const news = await db.query(
      "SELECT cn.*, u.username as author FROM company_news cn LEFT JOIN users u ON cn.created_by = u.user_id WHERE cn.company_id = ? AND cn.status = 'published' ORDER BY cn.published_at DESC LIMIT 50",
      [company_id]
    );
    
    res.json(news);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Create company news
router.post("/news", verifyToken, async (req, res) => {
  try {
    const { user_id } = req.user;
    const { title, content, news_type } = req.body;
    
    if (!title || !content) {
      return res.status(400).json({ error: "Title and content are required" });
    }
    
    const userRows = await db.query(
      "SELECT company_id FROM users WHERE user_id = ?",
      [user_id]
    );
    
    if (!userRows.length || !userRows[0].company_id) {
      return res.status(403).json({ error: "User is not associated with a company" });
    }
    
    const company_id = userRows[0].company_id;
    
    const result = await db.query(
      "INSERT INTO company_news (company_id, title, content, news_type, created_by) VALUES (?, ?, ?, ?, ?)",
      [company_id, title, content, news_type || 'announcement', user_id]
    );
    
    res.json({
      success: true,
      news_id: result.insertId,
      message: "News published successfully"
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Delete/Archive news
router.delete("/news/:newsId", verifyToken, async (req, res) => {
  try {
    const { user_id } = req.user;
    const { newsId } = req.params;
    
    const userRows = await db.query(
      "SELECT company_id FROM users WHERE user_id = ?",
      [user_id]
    );
    
    if (!userRows.length || !userRows[0].company_id) {
      return res.status(403).json({ error: "User is not associated with a company" });
    }
    
    const company_id = userRows[0].company_id;
    
    // Verify news belongs to this company
    const newsRows = await db.query(
      "SELECT * FROM company_news WHERE news_id = ? AND company_id = ?",
      [newsId, company_id]
    );
    
    if (!newsRows.length) {
      return res.status(404).json({ error: "News not found" });
    }
    
    await db.query(
      "UPDATE company_news SET status = 'archived' WHERE news_id = ?",
      [newsId]
    );
    
    res.json({ success: true, message: "News archived" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ===== SHAREHOLDER MANAGEMENT =====

// Get all shareholders
router.get("/shareholders", verifyToken, async (req, res) => {
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
    
    const shareholders = await db.query(
      "SELECT s.*, u.username, u.email FROM shareholders s LEFT JOIN users u ON s.user_id = u.user_id WHERE s.company_id = ? AND s.status = 'active' ORDER BY s.total_shares DESC",
      [company_id]
    );
    
    res.json(shareholders);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Get shareholder statistics
router.get("/shareholders/stats", verifyToken, async (req, res) => {
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
    
    // Get shareholder statistics
    const stats = await db.query(
      `SELECT 
        COUNT(*) as total_shareholders,
        SUM(total_shares) as total_shares_held,
        AVG(ownership_percentage) as avg_ownership,
        MAX(ownership_percentage) as max_ownership,
        MIN(ownership_percentage) as min_ownership
      FROM shareholders WHERE company_id = ? AND status = 'active'`,
      [company_id]
    );
    
    // Get top shareholders
    const topShareholders = await db.query(
      "SELECT s.*, u.username FROM shareholders s LEFT JOIN users u ON s.user_id = u.user_id WHERE s.company_id = ? AND s.status = 'active' ORDER BY s.total_shares DESC LIMIT 10",
      [company_id]
    );
    
    res.json({
      statistics: stats[0],
      top_shareholders: topShareholders
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Get single shareholder details
router.get("/shareholders/:shareholderId", verifyToken, async (req, res) => {
  try {
    const { user_id } = req.user;
    const { shareholderId } = req.params;
    
    const userRows = await db.query(
      "SELECT company_id FROM users WHERE user_id = ?",
      [user_id]
    );
    
    if (!userRows.length || !userRows[0].company_id) {
      return res.status(403).json({ error: "User is not associated with a company" });
    }
    
    const company_id = userRows[0].company_id;
    
    const shareholder = await db.query(
      "SELECT s.*, u.username, u.email FROM shareholders s LEFT JOIN users u ON s.user_id = u.user_id WHERE s.shareholder_id = ? AND s.company_id = ?",
      [shareholderId, company_id]
    );
    
    if (!shareholder.length) {
      return res.status(404).json({ error: "Shareholder not found" });
    }
    
    res.json(shareholder[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ===== DIVIDEND MANAGEMENT =====

// Create dividend
router.post("/dividends", verifyToken, async (req, res) => {
  try {
    const { user_id } = req.user;
    const { dividend_amount, dividend_date, record_date, payment_date } = req.body;
    
    if (!dividend_amount || !dividend_date || !record_date || !payment_date) {
      return res.status(400).json({ error: "All dividend fields are required" });
    }
    
    const userRows = await db.query(
      "SELECT company_id FROM users WHERE user_id = ?",
      [user_id]
    );
    
    if (!userRows.length || !userRows[0].company_id) {
      return res.status(403).json({ error: "User is not associated with a company" });
    }
    
    const company_id = userRows[0].company_id;
    
    const result = await db.query(
      "INSERT INTO dividends (company_id, dividend_amount, dividend_date, record_date, payment_date) VALUES (?, ?, ?, ?, ?)",
      [company_id, dividend_amount, dividend_date, record_date, payment_date]
    );
    
    res.json({
      success: true,
      dividend_id: result.insertId,
      message: "Dividend created successfully"
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Get dividends
router.get("/dividends", verifyToken, async (req, res) => {
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
    
    const dividends = await db.query(
      "SELECT * FROM dividends WHERE company_id = ? ORDER BY dividend_date DESC",
      [company_id]
    );
    
    res.json(dividends);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
