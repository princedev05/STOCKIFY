const express = require("express");
const router = express.Router();
const db = require("../db");
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "devsecret";

// Middleware to verify JWT token (used for protected actions like deleting a transaction)
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

// create BUY / SELL order
router.post("/buyStock", async (req, res) => {
  const conn = await db.getConnection();
  try {
    const { user_id, stock_id, order_type, quantity, limit_price } = req.body;
    if (!user_id || !stock_id || !quantity)
      return res.status(400).json({ error: "Missing fields" });

    await conn.beginTransaction();

    // Try using stored procedure to place order (handles locking/validation); fallback to direct INSERT
    let buyOrderId = null;
    try {
      await conn.query("CALL sp_place_order(?,?,?,?,?,?)", [
        user_id,
        stock_id,
        "BUY",
        order_type || "MARKET",
        quantity,
        limit_price || null,
      ]);
      const [orderRows] = await conn.query(
        "SELECT order_id FROM orders WHERE user_id = ? AND stock_id = ? AND side = 'BUY' ORDER BY placed_at DESC LIMIT 1",
        [user_id, stock_id]
      );
      buyOrderId = orderRows && orderRows.length ? orderRows[0].order_id : null;
    } catch (procErr) {
      console.warn('sp_place_order not available, inserting order directly:', procErr.message || procErr);
      const orderParams = [user_id, stock_id, "BUY", order_type || "MARKET", quantity, limit_price || null];
      const [r] = await conn.query(
        "INSERT INTO orders (user_id, stock_id, side, order_type, quantity, limit_price) VALUES (?, ?, ?, ?, ?, ?)",
        orderParams
      );
      buyOrderId = r.insertId;
      // Create a pending transaction record so the order appears in history
      try {
        await conn.query(
          "INSERT INTO transactions (user_id, stock_id, txn_type, quantity, price, amount, reference, txn_status) VALUES (?, ?, 'BUY', ?, ?, 0.00, ?, 'PENDING')",
          [user_id, stock_id, quantity, limit_price || null, `order:${buyOrderId}`]
        );
      } catch (txErr) {
        console.warn('Failed to insert pending BUY transaction:', txErr.message || txErr);
      }
    }

    // Try to find an open sell order to match immediately
    const [sells] = await conn.query(
      "SELECT * FROM orders WHERE side='SELL' AND status='OPEN' AND stock_id = ? AND order_id != ? ORDER BY placed_at ASC LIMIT 1 FOR UPDATE",
      [stock_id, buyOrderId]
    );
    let matched = false;
    let tradeId = null;
    if (sells && sells.length > 0) {
      const sell = sells[0];
      // determine price
      let price = null;
      if ((order_type || 'MARKET') === 'MARKET') {
        const [stocks] = await conn.query("SELECT current_price FROM stocks WHERE stock_id = ? FOR UPDATE", [stock_id]);
        price = stocks[0] ? stocks[0].current_price : sell.limit_price || limit_price || 0;
      } else {
        price = sell.limit_price || limit_price || 0;
      }
      const qty = Math.min(quantity, sell.quantity);
      // call finalize and capture trade id returned by the procedure
      const [spRes] = await conn.query("CALL sp_finalize_trade(?,?,?,?,?)", [buyOrderId, sell.order_id, stock_id, qty, price]);
      if (Array.isArray(spRes) && spRes[0] && spRes[0].trade_id) tradeId = spRes[0].trade_id;
      matched = true;
    } else {
      // No existing sell order: try to create a company sell order from stock listing
            const [stocks] = await conn.query("SELECT company_id, available_shares, current_price FROM stocks WHERE stock_id = ? FOR UPDATE", [stock_id]);
      if (stocks && stocks.length > 0) {
        const stock = stocks[0];
        if (stock.available_shares && stock.available_shares > 0) {
          // find a user associated with company to act as seller
          const [users] = await conn.query("SELECT user_id FROM users WHERE company_id = ? LIMIT 1", [stock.company_id]);
          if (users && users.length > 0) {
            const companyUserId = users[0].user_id;
                    // create sell order via stored procedure, then finalize
                    let sellOrderId = null;
                    try {
                      await conn.query("CALL sp_place_order(?,?,?,?,?,?)", [companyUserId, stock_id, 'SELL', 'LIMIT', Math.min(quantity, stock.available_shares), limit_price || stock.current_price]);
                      const [sellRows] = await conn.query("SELECT order_id FROM orders WHERE user_id = ? AND stock_id = ? AND side = 'SELL' ORDER BY placed_at DESC LIMIT 1", [companyUserId, stock_id]);
                      sellOrderId = sellRows && sellRows.length ? sellRows[0].order_id : null;
                    } catch (procErr) {
                      console.warn('sp_place_order missing for company sell; inserting directly:', procErr.message || procErr);
                      const [sellRes] = await conn.query(
                        "INSERT INTO orders (user_id, stock_id, side, order_type, quantity, limit_price) VALUES (?, ?, 'SELL', 'LIMIT', ?, ?)",
                        [companyUserId, stock_id, Math.min(quantity, stock.available_shares), limit_price || stock.current_price]
                      );
                      sellOrderId = sellRes.insertId;
                                    try {
                                      // immediate credit for fallback path: compute price and credit seller
                                      const vPrice = limit_price || stock.current_price || 0;
                                      await conn.query("UPDATE wallets SET available_balance = available_balance + ? WHERE user_id = ?", [vPrice * Math.min(quantity, stock.available_shares), companyUserId]);
                                      await conn.query(
                                        "INSERT INTO transactions (user_id, stock_id, txn_type, quantity, price, amount, reference, txn_status) VALUES (?, ?, 'SELL', ?, ?, ?, ?, 'COMPLETED')",
                                        [companyUserId, stock_id, Math.min(quantity, stock.available_shares), vPrice, vPrice * Math.min(quantity, stock.available_shares), `order:${sellOrderId}`]
                                      );
                                      await conn.query("UPDATE orders SET settled = 1 WHERE order_id = ?", [sellOrderId]);
                                    } catch (txErr) {
                                      console.warn('Failed to credit company seller or insert transaction for company listing:', txErr.message || txErr);
                                    }
                    }
                    const price = limit_price || stock.current_price || 0;
                    const qty = Math.min(quantity, stock.available_shares);
                    if (sellOrderId) {
                      const [spRes2] = await conn.query("CALL sp_finalize_trade(?,?,?,?,?)", [buyOrderId, sellOrderId, stock_id, qty, price]);
                      if (Array.isArray(spRes2) && spRes2[0] && spRes2[0].trade_id) tradeId = spRes2[0].trade_id;
                    }
            matched = true;
          }
        }
      }
    }

    await conn.commit();
    conn.release();

    const resp = { orderId: buyOrderId, matched };
    if (tradeId) resp.tradeId = tradeId;
    res.json(resp);
  } catch (err) {
    await conn.rollback().catch(() => {});
    conn.release();
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

router.post("/sellStock", async (req, res) => {
  const conn = await db.getConnection();
  try {
    const { user_id, stock_id, order_type, quantity, limit_price } = req.body;
    if (!user_id || !stock_id || !quantity)
      return res.status(400).json({ error: "Missing fields" });

    // Start a transaction and lock the holdings row to avoid races.
    await conn.beginTransaction();
    const [holdRows] = await conn.query(
      "SELECT IFNULL(total_quantity,0) AS qty FROM holdings WHERE user_id = ? AND stock_id = ? FOR UPDATE",
      [user_id, stock_id]
    );
    const availableHoldings = holdRows && holdRows.length ? parseInt(holdRows[0].qty, 10) : 0;
    if (availableHoldings < quantity) {
      await conn.rollback().catch(() => {});
      conn.release();
      return res.status(400).json({ error: 'Insufficient holdings to place SELL order' });
    }

    // Place order using stored procedure with a fallback to direct INSERT
    let sellOrderId = null;
    try {
      await conn.query("CALL sp_place_order(?,?,?,?,?,?)", [
        user_id,
        stock_id,
        "SELL",
        order_type || "MARKET",
        quantity,
        limit_price || null,
      ]);
      const [sellOrderRows] = await conn.query(
        "SELECT order_id FROM orders WHERE user_id = ? AND stock_id = ? AND side = 'SELL' ORDER BY placed_at DESC LIMIT 1",
        [user_id, stock_id]
      );
      sellOrderId = sellOrderRows && sellOrderRows.length ? sellOrderRows[0].order_id : null;
    } catch (procErr) {
      // If the procedure signaled insufficient holdings, return a clear client error.
      const procMsg = (procErr && procErr.message) ? String(procErr.message) : '';
      if (procMsg.includes('Insufficient holdings')) {
        await conn.rollback().catch(() => {});
        conn.release();
        return res.status(400).json({ error: 'Insufficient holdings to place SELL order' });
      }
      console.warn('sp_place_order not available for SELL, inserting order directly:', procErr.message || procErr);
      const [r] = await conn.query(
        "INSERT INTO orders (user_id, stock_id, side, order_type, quantity, limit_price) VALUES (?, ?, 'SELL', ?, ?, ?)",
        [user_id, stock_id, order_type || 'MARKET', quantity, limit_price || null]
      );
      sellOrderId = r.insertId;
      // Fallback path: immediately credit seller and insert completed transaction
      try {
        let vPrice = limit_price || null;
        if (!vPrice) {
          const [stockRows] = await conn.query("SELECT current_price FROM stocks WHERE stock_id = ?", [stock_id]);
          vPrice = stockRows && stockRows.length ? stockRows[0].current_price : 0;
        }
        await conn.query("UPDATE wallets SET available_balance = available_balance + ? WHERE user_id = ?", [vPrice * quantity, user_id]);
        await conn.query(
          "INSERT INTO transactions (user_id, stock_id, txn_type, quantity, price, amount, reference, txn_status) VALUES (?, ?, 'SELL', ?, ?, ?, ?, 'COMPLETED')",
          [user_id, stock_id, quantity, vPrice, vPrice * quantity, `order:${sellOrderId}`]
        );
        await conn.query("UPDATE orders SET settled = 1 WHERE order_id = ?", [sellOrderId]);
      } catch (txErr) {
        console.warn('Failed to credit seller or insert completed SELL transaction in fallback path:', txErr.message || txErr);
      }
    }

    // Try to find matching buy order
    const [buys] = await conn.query(
      "SELECT * FROM orders WHERE side='BUY' AND status='OPEN' AND stock_id = ? AND order_id != ? ORDER BY placed_at ASC LIMIT 1 FOR UPDATE",
      [stock_id, sellOrderId]
    );
    let matched = false;
    let tradeId = null;
    if (buys && buys.length > 0) {
      const buy = buys[0];
      let price = null;
      if ((buy.order_type || 'MARKET') === 'MARKET') {
        const [stocks] = await conn.query("SELECT current_price FROM stocks WHERE stock_id = ? FOR UPDATE", [stock_id]);
        price = stocks[0] ? stocks[0].current_price : buy.limit_price || limit_price || 0;
      } else {
        price = buy.limit_price || limit_price || 0;
      }
      const qty = Math.min(quantity, buy.quantity);
      const [spRes] = await conn.query("CALL sp_finalize_trade(?,?,?,?,?)", [buy.order_id, sellOrderId, stock_id, qty, price]);
      if (Array.isArray(spRes) && spRes[0] && spRes[0].trade_id) tradeId = spRes[0].trade_id;
      matched = true;
    }

    await conn.commit();
    conn.release();
    const resp = { orderId: sellOrderId, matched };
    if (tradeId) resp.tradeId = tradeId;
    res.json(resp);
  } catch (err) {
    await conn.rollback().catch(() => {});
    conn.release();
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// view holdings
router.get("/portfolio/:user_id", async (req, res) => {
  try {
    const { user_id } = req.params;
    // Return holdings shaped for frontend consumption (quantity, average_price, company_name)
    const holdings = await db.query(
      `SELECT h.stock_id,
              h.total_quantity AS quantity,
              h.avg_buy_price AS average_price,
              s.current_price,
              c.company_name
       FROM holdings h
       JOIN stocks s ON h.stock_id = s.stock_id
       LEFT JOIN companies c ON s.company_id = c.company_id
       WHERE h.user_id = ?`,
      [user_id]
    );
    // fetch wallet and user info to present a complete portfolio
    const walletRows = await db.query("SELECT available_balance, locked_balance FROM wallets WHERE user_id = ?", [user_id]);
    const userRows = await db.query("SELECT user_id, name, username, email FROM users WHERE user_id = ?", [user_id]);
    const wallet = walletRows[0]
      ? { balance: parseFloat(walletRows[0].available_balance), reserved_amount: parseFloat(walletRows[0].locked_balance) }
      : null;
    const user = userRows[0] ? { user_id: userRows[0].user_id, name: userRows[0].name, username: userRows[0].username } : null;

    res.json({ holdings, wallet, user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// user history
router.get("/history/:user_id", async (req, res) => {
  try {
    const { user_id } = req.params;
    // Alias columns to frontend-friendly names: transaction_date, transaction_type, status
    const tx = await db.query(
      `SELECT txn_id,
              stock_id,
              quantity,
              price,
              amount,
              reference,
              txn_time AS transaction_date,
              txn_type AS transaction_type,
              txn_status AS status
       FROM transactions
       WHERE user_id = ?
       ORDER BY txn_time DESC
       LIMIT 200`,
      [user_id]
    );
    res.json({ transactions: tx });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a transaction (only the owner can delete their transaction)
router.delete("/transactions/:txnId", verifyToken, async (req, res) => {
  try {
    const { user_id } = req.user; // from token
    const { txnId } = req.params;

    // Verify transaction exists and belongs to the requester
    const rows = await db.query("SELECT user_id FROM transactions WHERE txn_id = ?", [txnId]);
    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: "Transaction not found" });
    }
    if (rows[0].user_id !== user_id) {
      return res.status(403).json({ error: "Not authorized to delete this transaction" });
    }

    // Perform delete
    await db.query("DELETE FROM transactions WHERE txn_id = ?", [txnId]);
    res.json({ success: true, message: "Transaction deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
