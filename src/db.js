const mysql = require("mysql2/promise");
const dotenv = require("dotenv");
dotenv.config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "stock_market",
  // allow multi-statement execution for migrations (use carefully)
  multipleStatements: true,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  decimalNumbers: true,
});

async function query(sql, params) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

async function getConnection() {
  return pool.getConnection();
}

module.exports = {
  pool,
  query,
  getConnection,
};
