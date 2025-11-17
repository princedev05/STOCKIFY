const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const router = express.Router();
const db = require("../db");

const JWT_SECRET = process.env.JWT_SECRET || "devsecret";

router.post("/register", async (req, res) => {
  try {
    const { username, name, email, password, role, company_name, sector, website, description } = req.body;
    if (!username || !email || !password)
      return res.status(400).json({ error: "Missing fields" });
    
    const hash = await bcrypt.hash(password, 10);
    
    // If registering as company, create company profile first
    let company_id = null;
    if (role === 'company') {
      if (!company_name) {
        return res.status(400).json({ error: "company_name required for company registration" });
      }
      const companyRes = await db.query(
        "INSERT INTO companies (company_name, sector, website, description) VALUES (?, ?, ?, ?)",
        [company_name, sector || null, website || null, description || null]
      );
      company_id = companyRes.insertId;
    }
    
    const result = await db.query(
      "INSERT INTO users (username, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)",
      [username, name, email, hash, role || "investor"]
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
      "SELECT user_id, password_hash, role FROM users WHERE username = ? OR email = ?",
      [username, username]
    );
    const user = rows[0];
    if (!user) return res.status(401).json({ error: "Invalid credentials" });
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });
    const token = jwt.sign(
      { user_id: user.user_id, role: user.role },
      JWT_SECRET,
      { expiresIn: "8h" }
    );
    await db.query("UPDATE users SET last_login = NOW() WHERE user_id = ?", [
      user.user_id,
    ]);
    res.json({ token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
