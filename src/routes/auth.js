const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const router = express.Router();
const db = require("../db");

const JWT_SECRET = process.env.JWT_SECRET || "devsecret";

// simple token verifier for endpoints that need current user
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "No token provided" });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid token" });
  }
};

// GET current user info from token
router.get("/me", verifyToken, async (req, res) => {
  try {
    const { user_id } = req.user;
    const rows = await db.query("SELECT user_id, name, username, email FROM users WHERE user_id = ?", [user_id]);
    if (!rows.length) return res.status(404).json({ error: "User not found" });
    const u = rows[0];
    res.json({ user_id: u.user_id, name: u.name, username: u.username, email: u.email });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

router.post("/register", async (req, res) => {
  try {
    const { username, name, email, password, role, company_name, sector, website, description } = req.body;
    if (!username || !email || !password)
      return res.status(400).json({ error: "Missing fields" });
    
    const hash = await bcrypt.hash(password, 10);
    
    // Determine role server-side to prevent tampering.
    // If a valid company_id is provided and exists, assign 'company' role; otherwise always 'investor'.
    let company_id = null;
    let assignedRole = 'investor';
    if (req.body.company_id) {
      const maybeId = parseInt(req.body.company_id);
      if (!isNaN(maybeId)) {
        const crows = await db.query("SELECT company_id FROM companies WHERE company_id = ?", [maybeId]);
        if (crows.length) {
          company_id = maybeId;
          assignedRole = 'company';
        } else {
          return res.status(400).json({ error: 'Invalid company_id' });
        }
      } else {
        return res.status(400).json({ error: 'Invalid company_id' });
      }
    }
    
    const result = await db.query(
      "INSERT INTO users (username, name, email, password_hash, role, company_id) VALUES (?, ?, ?, ?, ?, ?)",
      [username, name, email, hash, assignedRole, company_id]
    );
    const userId = result.insertId;
    
    // create wallet
    await db.query("INSERT INTO wallets (user_id) VALUES (?)", [userId]);
    
    res.json({ user_id: userId, company_id: company_id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ error: "Missing fields" });
    const rows = await db.query(
      "SELECT user_id, password_hash, role, name, company_id FROM users WHERE username = ? OR email = ?",
      [username, username]
    );
    const user = rows[0];
    if (!user) return res.status(401).json({ error: "Invalid credentials" });
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });
    const token = jwt.sign({ user_id: user.user_id, role: user.role }, JWT_SECRET, {
      expiresIn: "8h",
    });
    await db.query("UPDATE users SET last_login = NOW() WHERE user_id = ?", [
      user.user_id,
    ]);
    // Return token and basic user info so frontend can store/display username
    res.json({ token, user_id: user.user_id, name: user.name, role: user.role, company_id: user.company_id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
