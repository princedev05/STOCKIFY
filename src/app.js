const express = require("express");
const path = require("path");
const authRoutes = require("./routes/auth");
const companyRoutes = require("./routes/company");
const companyDashboardRoutes = require("./routes/companyDashboard");
const userRoutes = require("./routes/user");
const marketRoutes = require("./routes/market");

const app = express();
app.use(express.json());

// Serve beautiful homepage on root (before static files)
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index-new.html"));
});

// Serve static files from public directory
app.use(express.static(path.join(__dirname, "../public")));

// API Routes
app.use("/auth", authRoutes);
app.use("/company", companyRoutes);
app.use("/company-dashboard", companyDashboardRoutes);
app.use("/user", userRoutes);
app.use("/market", marketRoutes);

app.get("/api", (req, res) =>
  res.json({ ok: true, message: "Stock Market Simulation API" })
);

module.exports = app;
