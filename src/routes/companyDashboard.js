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
    
    // Get shareholder count from current holdings (distinct users holding company stocks)
    const shareholderRows = await db.query(
      `SELECT COUNT(DISTINCT h.user_id) AS count
       FROM holdings h
       JOIN stocks s ON h.stock_id = s.stock_id
       WHERE s.company_id = ? AND h.total_quantity > 0`,
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
    
    // Compute current shareholders from holdings for all stocks of this company
    const shareholders = await db.query(
      `SELECT h.user_id,
              u.username,
              u.email,
              SUM(h.total_quantity) AS total_shares,
              ROUND(AVG(h.avg_buy_price),2) AS avg_buy_price,
              -- ownership percentage relative to total company shares
              CASE WHEN tot.total_company_shares > 0 THEN ROUND(SUM(h.total_quantity) / tot.total_company_shares * 100,4) ELSE 0 END AS ownership_percentage
       FROM holdings h
       JOIN stocks s ON h.stock_id = s.stock_id
       LEFT JOIN users u ON h.user_id = u.user_id
       CROSS JOIN (SELECT COALESCE(SUM(total_shares),0) AS total_company_shares FROM stocks WHERE company_id = ?) tot
       WHERE s.company_id = ? AND h.total_quantity > 0
       GROUP BY h.user_id, u.username, u.email, tot.total_company_shares
       ORDER BY total_shares DESC`,
      [company_id, company_id]
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
    
    // Compute shareholder statistics from holdings
    const statsRows = await db.query(
      `SELECT
         COUNT(DISTINCT h.user_id) AS total_shareholders,
         COALESCE(SUM(h.total_quantity),0) AS total_shares_held
       FROM holdings h
       JOIN stocks s ON h.stock_id = s.stock_id
       WHERE s.company_id = ? AND h.total_quantity > 0`,
      [company_id]
    );

    const totalCompanySharesRow = await db.query(
      "SELECT COALESCE(SUM(total_shares),0) as total_company_shares FROM stocks WHERE company_id = ?",
      [company_id]
    );
    const totalCompanyShares = totalCompanySharesRow[0].total_company_shares || 0;

    // Top shareholders by aggregated holdings
    const topShareholders = await db.query(
      `SELECT h.user_id, u.username, SUM(h.total_quantity) AS total_shares,
              CASE WHEN ? > 0 THEN ROUND(SUM(h.total_quantity)/? * 100,4) ELSE 0 END AS ownership_percentage
       FROM holdings h
       JOIN stocks s ON h.stock_id = s.stock_id
       LEFT JOIN users u ON h.user_id = u.user_id
       WHERE s.company_id = ? AND h.total_quantity > 0
       GROUP BY h.user_id, u.username
       ORDER BY total_shares DESC LIMIT 10`,
      [totalCompanyShares, totalCompanyShares, company_id]
    );

    res.json({
      statistics: statsRows[0],
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
    
    // shareholderId here refers to user_id in holdings-derived view
    const rows = await db.query(
      `SELECT h.user_id, u.username, u.email, SUM(h.total_quantity) AS total_shares, ROUND(AVG(h.avg_buy_price),2) AS avg_buy_price
       FROM holdings h
       JOIN stocks s ON h.stock_id = s.stock_id
       LEFT JOIN users u ON h.user_id = u.user_id
       WHERE s.company_id = ? AND h.user_id = ?
       GROUP BY h.user_id, u.username, u.email`,
      [company_id, shareholderId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Shareholder not found for this company' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Dividends feature removed from company dashboard routes

module.exports = router;
