-- Combined Schema + Routines for project-tt
-- This file contains the complete (cleaned) schema, triggers and stored procedures
-- for the project. Deprecated tables (stock_listings, daily_prices,
-- market_price_updates, shareholders, dividends, dividend_payouts) were
-- intentionally removed — the application derives shareholder data from
-- `holdings` and does not use synthetic price-update events.

-- Usage: open in MySQL Workbench and execute, or run from CLI:
--   mysql -u <user> -p < combined_schema.sql

CREATE DATABASE IF NOT EXISTS stock_market
  DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE stock_market;

SET FOREIGN_KEY_CHECKS = 0;

-- ------------------------------------------------------------------
-- COMPANIES
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS companies (
  company_id INT AUTO_INCREMENT PRIMARY KEY,
  company_name VARCHAR(255) NOT NULL,
  sector VARCHAR(100),
  description TEXT,
  website VARCHAR(255),
  approved TINYINT(1) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------
-- USERS
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  user_id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(100) UNIQUE NOT NULL,
  name VARCHAR(255),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('investor','company') DEFAULT 'investor',
  company_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  status ENUM('active', 'inactive', 'suspended') DEFAULT 'active',
  last_login TIMESTAMP NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_user_company FOREIGN KEY (company_id) REFERENCES companies(company_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------
-- WALLETS
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS wallets (
  wallet_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL UNIQUE,
  currency CHAR(3) DEFAULT 'INR',
  available_balance DECIMAL(18,4) DEFAULT 100000.0000,
  locked_balance DECIMAL(18,4) DEFAULT 0.0000,
  wallet_type ENUM('real', 'virtual') DEFAULT 'real',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_wallet_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------
-- STOCKS
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stocks (
  stock_id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  listing_date DATE,
  lot_size INT DEFAULT 1,
  current_price DECIMAL(18,4) DEFAULT 0.0000,
  total_shares BIGINT DEFAULT 0,
  available_shares BIGINT DEFAULT 0,
  CONSTRAINT fk_stocks_company FOREIGN KEY (company_id) REFERENCES companies(company_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------
-- ORDERS (orderbook)
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orders (
  order_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  stock_id INT NOT NULL,
  side ENUM('BUY','SELL') NOT NULL,
  order_type ENUM('MARKET','LIMIT') DEFAULT 'LIMIT',
  quantity INT NOT NULL,
  limit_price DECIMAL(18,4),
  status ENUM('OPEN','PARTIAL','FILLED','CANCELLED','REJECTED') DEFAULT 'OPEN',
  settled TINYINT(1) DEFAULT 0,
  placed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  executed_at TIMESTAMP NULL,
  CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  CONSTRAINT fk_orders_stock FOREIGN KEY (stock_id) REFERENCES stocks(stock_id) ON DELETE CASCADE,
  CHECK (quantity > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------
-- TRADES
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS trades (
  trade_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  buy_order_id BIGINT,
  sell_order_id BIGINT,
  stock_id INT NOT NULL,
  buyer_id INT NOT NULL,
  seller_id INT NOT NULL,
  quantity INT NOT NULL,
  price DECIMAL(18,4) NOT NULL,
  trade_type ENUM('intraday', 'delivery') DEFAULT 'delivery',
  trade_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_trades_buy_order FOREIGN KEY (buy_order_id) REFERENCES orders(order_id),
  CONSTRAINT fk_trades_sell_order FOREIGN KEY (sell_order_id) REFERENCES orders(order_id),
  CONSTRAINT fk_trades_stock FOREIGN KEY (stock_id) REFERENCES stocks(stock_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------
-- HOLDINGS (per-user positions)
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS holdings (
  holding_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  stock_id INT NOT NULL,
  total_quantity BIGINT DEFAULT 0,
  avg_buy_price DECIMAL(18,4) DEFAULT 0.0000,
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE (user_id, stock_id),
  CONSTRAINT fk_holdings_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  CONSTRAINT fk_holdings_stock FOREIGN KEY (stock_id) REFERENCES stocks(stock_id) ON DELETE CASCADE,
  CHECK (total_quantity >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------
-- TRANSACTIONS (ledger)
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS transactions (
  txn_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  stock_id INT,
  txn_type ENUM('DEPOSIT','WITHDRAWAL','BUY','SELL','FEE','DIVIDEND') NOT NULL,
  quantity BIGINT DEFAULT NULL,
  price DECIMAL(18,4) DEFAULT NULL,
  amount DECIMAL(18,4) NOT NULL,
  txn_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  reference VARCHAR(255),
  txn_status ENUM('PENDING', 'COMPLETED', 'FAILED') DEFAULT 'COMPLETED',
  CONSTRAINT fk_transactions_user FOREIGN KEY (user_id) REFERENCES users(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------
-- COMPANY NEWS
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS company_news (
  news_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  news_type ENUM('announcement', 'financial', 'dividend', 'event', 'other') DEFAULT 'announcement',
  published_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by INT NULL,
  status ENUM('draft', 'published', 'archived') DEFAULT 'published',
  CONSTRAINT fk_news_company FOREIGN KEY (company_id) REFERENCES companies(company_id) ON DELETE CASCADE,
  CONSTRAINT fk_news_user FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE SET NULL,
  INDEX idx_company_news (company_id, published_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------
-- COMPANY FINANCIALS (analytics)
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS company_financials (
  financial_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL UNIQUE,
  total_shares_issued BIGINT DEFAULT 0,
  total_funds_raised DECIMAL(18,4) DEFAULT 0.0000,
  market_cap DECIMAL(18,4) DEFAULT 0.0000,
  avg_share_price DECIMAL(18,4) DEFAULT 0.0000,
  total_investors INT DEFAULT 0,
  total_trades BIGINT DEFAULT 0,
  trading_volume BIGINT DEFAULT 0,
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_financials_company FOREIGN KEY (company_id) REFERENCES companies(company_id) ON DELETE CASCADE,
  INDEX idx_company_financials (company_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------
-- INDEXES
-- ------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_trades_stock_time ON trades(stock_id, trade_timestamp);
CREATE INDEX IF NOT EXISTS idx_orders_user_status ON orders(user_id, status);
CREATE INDEX IF NOT EXISTS idx_holdings_user_stock ON holdings(user_id, stock_id);
CREATE INDEX IF NOT EXISTS idx_transactions_user_time ON transactions(user_id, txn_time);
CREATE INDEX IF NOT EXISTS idx_orders_stock_status ON orders(stock_id, status);

-- ------------------------------------------------------------------
-- TRIGGERS & STORED PROCEDURES
-- Use DELIMITER blocks for multi-statement objects
-- ------------------------------------------------------------------
DELIMITER $$

-- Trigger: BEFORE INSERT ON orders
DROP TRIGGER IF EXISTS trg_before_order_insert$$
CREATE TRIGGER trg_before_order_insert
BEFORE INSERT ON orders
FOR EACH ROW
BEGIN
  DECLARE needed DECIMAL(18,4) DEFAULT 0;
  DECLARE available DECIMAL(18,4) DEFAULT 0;
  DECLARE user_role VARCHAR(20) DEFAULT 'investor';
  DECLARE holding_qty BIGINT DEFAULT 0;
  DECLARE company_available_shares BIGINT DEFAULT 0;

  SELECT role INTO user_role FROM users WHERE user_id = NEW.user_id;

  IF NEW.side = 'BUY' THEN
    IF NEW.order_type = 'MARKET' THEN
      SELECT IFNULL(current_price, NEW.limit_price) INTO needed FROM stocks WHERE stock_id = NEW.stock_id;
      SET needed = IFNULL(needed, 0) * NEW.quantity;
    ELSE
      SET needed = IFNULL(NEW.limit_price, 0) * NEW.quantity;
    END IF;

    SELECT available_balance INTO available FROM wallets WHERE user_id = NEW.user_id FOR UPDATE;

    IF available < needed THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Insufficient balance for BUY order';
    ELSE
      UPDATE wallets
      SET available_balance = available_balance - needed,
          locked_balance = locked_balance + needed
      WHERE user_id = NEW.user_id;
    END IF;

  ELSEIF NEW.side = 'SELL' THEN
    IF user_role = 'company' THEN
      SELECT IFNULL(available_shares, 0) INTO company_available_shares FROM stocks WHERE stock_id = NEW.stock_id FOR UPDATE;
      IF company_available_shares < NEW.quantity THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Company does not have enough shares to sell';
      ELSE
        UPDATE stocks
        SET available_shares = available_shares - NEW.quantity
        WHERE stock_id = NEW.stock_id;
      END IF;
    ELSE
      SELECT IFNULL(total_quantity, 0) INTO holding_qty FROM holdings WHERE user_id = NEW.user_id AND stock_id = NEW.stock_id FOR UPDATE;
      IF holding_qty < NEW.quantity THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Insufficient holdings for SELL order';
      ELSE
        UPDATE holdings
        SET total_quantity = total_quantity - NEW.quantity
        WHERE user_id = NEW.user_id AND stock_id = NEW.stock_id;
      END IF;
    END IF;
  END IF;
END$$

-- Procedure: finalize trade (used by matching engine)
DROP PROCEDURE IF EXISTS sp_finalize_trade$$
CREATE PROCEDURE sp_finalize_trade(
  IN p_buy_order_id BIGINT,
  IN p_sell_order_id BIGINT,
  IN p_stock_id INT,
  IN p_qty INT,
  IN p_price DECIMAL(18,4)
)
BEGIN
  DECLARE v_buyer INT;
  DECLARE v_seller INT;
  DECLARE v_trade_id BIGINT;

  SELECT user_id INTO v_buyer FROM orders WHERE order_id = p_buy_order_id;
  SELECT user_id INTO v_seller FROM orders WHERE order_id = p_sell_order_id;

  INSERT INTO trades (buy_order_id, sell_order_id, stock_id, buyer_id, seller_id, quantity, price)
  VALUES (p_buy_order_id, p_sell_order_id, p_stock_id, v_buyer, v_seller, p_qty, p_price);

  SET v_trade_id = LAST_INSERT_ID();

  INSERT INTO holdings (user_id, stock_id, total_quantity, avg_buy_price)
  VALUES (v_buyer, p_stock_id, p_qty, p_price)
  ON DUPLICATE KEY UPDATE
    avg_buy_price = ((avg_buy_price * total_quantity) + (p_price * p_qty)) / (total_quantity + p_qty),
    total_quantity = total_quantity + p_qty,
    last_updated = CURRENT_TIMESTAMP;

  -- Seller holdings were already reserved/updated when the SELL order was
  -- placed (trigger or procedure). Do not decrement seller holdings again here
  -- to avoid double-counting.

  UPDATE wallets
  SET locked_balance = locked_balance - (p_price * p_qty)
  WHERE user_id = v_buyer;
  -- Credit seller only if they were not already settled at order placement
  DECLARE v_seller_settled TINYINT DEFAULT 0;
  SELECT IFNULL(settled,0) INTO v_seller_settled FROM orders WHERE order_id = p_sell_order_id;
  IF v_seller_settled = 0 THEN
    UPDATE wallets
    SET available_balance = available_balance + (p_price * p_qty)
    WHERE user_id = v_seller;
  END IF;

  UPDATE orders SET status = 'FILLED', executed_at = CURRENT_TIMESTAMP WHERE order_id IN (p_buy_order_id, p_sell_order_id);

  -- Update any pending transaction created at order placement (reference = 'order:<orderId>')
  -- Buyer: try to update existing pending order transaction; if none, insert a new completed transaction
  UPDATE transactions
  SET quantity = p_qty,
      price = p_price,
      amount = -p_price * p_qty,
      reference = CONCAT('trade:', v_trade_id),
      txn_status = 'COMPLETED',
      txn_time = CURRENT_TIMESTAMP
  WHERE reference = CONCAT('order:', p_buy_order_id)
  LIMIT 1;
  IF ROW_COUNT() = 0 THEN
    INSERT INTO transactions (user_id, stock_id, txn_type, quantity, price, amount, reference)
    VALUES (v_buyer, p_stock_id, 'BUY', p_qty, p_price, -p_price * p_qty, CONCAT('trade:', v_trade_id));
  END IF;

  -- Seller: update pending sell transaction if exists, else insert
  UPDATE transactions
  SET quantity = p_qty,
      price = p_price,
      amount = p_price * p_qty,
      reference = CONCAT('trade:', v_trade_id),
      txn_status = 'COMPLETED',
      txn_time = CURRENT_TIMESTAMP
  WHERE reference = CONCAT('order:', p_sell_order_id)
  LIMIT 1;
  IF ROW_COUNT() = 0 THEN
    INSERT INTO transactions (user_id, stock_id, txn_type, quantity, price, amount, reference)
    VALUES (v_seller, p_stock_id, 'SELL', p_qty, p_price, p_price * p_qty, CONCAT('trade:', v_trade_id));
  END IF;
  SELECT v_trade_id AS trade_id;
END$$

-- Procedure: create user + wallet
DROP PROCEDURE IF EXISTS sp_create_user_with_wallet$$
CREATE PROCEDURE sp_create_user_with_wallet(
  IN p_username VARCHAR(100),
  IN p_name VARCHAR(255),
  IN p_email VARCHAR(255),
  IN p_password_hash VARCHAR(255),
  IN p_role ENUM('investor','company'),
  IN p_company_id INT
)
BEGIN
  DECLARE v_user_id INT;
  START TRANSACTION;
  INSERT INTO users (username, name, email, password_hash, role, company_id)
  VALUES (p_username, p_name, p_email, p_password_hash, p_role, p_company_id);
  SET v_user_id = LAST_INSERT_ID();
  INSERT INTO wallets (user_id, currency, available_balance, locked_balance, wallet_type)
  VALUES (v_user_id, 'INR', 100000.0000, 0.0000, 'real');
  COMMIT;
  SELECT v_user_id AS user_id;
END$$

-- Procedure: create company + stock (stock_listings deprecated)
DROP PROCEDURE IF EXISTS sp_create_company_with_stock$$
CREATE PROCEDURE sp_create_company_with_stock(
  IN p_company_name VARCHAR(255),
  IN p_sector VARCHAR(100),
  IN p_website VARCHAR(255),
  IN p_initial_shares BIGINT,
  IN p_price DECIMAL(18,4)
)
BEGIN
  DECLARE v_company_id INT;
  DECLARE v_stock_id INT;
  START TRANSACTION;
  INSERT INTO companies (company_name, sector, website, approved)
  VALUES (p_company_name, p_sector, p_website, 1);
  SET v_company_id = LAST_INSERT_ID();
  INSERT INTO stocks (company_id, listing_date, lot_size, current_price, total_shares, available_shares)
  VALUES (v_company_id, CURDATE(), 1, p_price, p_initial_shares, p_initial_shares);
  SET v_stock_id = LAST_INSERT_ID();
  -- Note: `stock_listings` is deprecated; listing recorded in `stocks` table
  COMMIT;
  SELECT v_company_id AS company_id, v_stock_id AS stock_id;
END$$

-- Procedure: place order (locks funds/holdings and inserts order)
DROP PROCEDURE IF EXISTS sp_place_order$$
CREATE PROCEDURE sp_place_order(
  IN p_user_id INT,
  IN p_stock_id INT,
  IN p_side ENUM('BUY','SELL'),
  IN p_order_type ENUM('MARKET','LIMIT'),
  IN p_quantity INT,
  IN p_limit_price DECIMAL(18,4)
)
BEGIN
  DECLARE v_needed DECIMAL(18,4) DEFAULT 0;
  DECLARE v_available DECIMAL(18,4) DEFAULT 0;
  DECLARE v_holding_qty BIGINT DEFAULT 0;
  DECLARE v_order_id BIGINT DEFAULT 0;
  START TRANSACTION;
  IF p_side = 'BUY' THEN
    IF p_order_type = 'MARKET' THEN
      SELECT IFNULL(current_price, p_limit_price) INTO v_needed FROM stocks WHERE stock_id = p_stock_id FOR UPDATE;
      SET v_needed = IFNULL(v_needed, 0) * p_quantity;
    ELSE
      SET v_needed = IFNULL(p_limit_price, 0) * p_quantity;
    END IF;
    SELECT available_balance INTO v_available FROM wallets WHERE user_id = p_user_id FOR UPDATE;
    IF v_available < v_needed THEN
      ROLLBACK;
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Insufficient balance for BUY order (procedure)';
    END IF;
    -- Insert order; the BEFORE INSERT trigger `trg_before_order_insert`
    -- will perform the necessary wallet locking (available -> locked).
    INSERT INTO orders (user_id, stock_id, side, order_type, quantity, limit_price)
    VALUES (p_user_id, p_stock_id, p_side, p_order_type, p_quantity, p_limit_price);
    SET v_order_id = LAST_INSERT_ID();
    -- Create a pending transaction row tied to this order so the order shows in
    -- transaction history (status=PENDING). It will be updated to COMPLETED by
    -- sp_finalize_trade when the trade executes.
    INSERT INTO transactions (user_id, stock_id, txn_type, quantity, price, amount, reference, txn_status)
    VALUES (p_user_id, p_stock_id, 'BUY', p_quantity, p_limit_price, 0.0000, CONCAT('order:', v_order_id), 'PENDING');
  ELSE
    -- SELL: check holdings
    SELECT IFNULL(total_quantity,0) INTO v_holding_qty FROM holdings WHERE user_id = p_user_id AND stock_id = p_stock_id FOR UPDATE;
    IF v_holding_qty < p_quantity THEN
      ROLLBACK;
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Insufficient holdings for SELL order (procedure)';
    END IF;
    -- Insert order; the BEFORE INSERT trigger `trg_before_order_insert`
    -- will decrement holdings (reserve shares) or reduce company available_shares.
    INSERT INTO orders (user_id, stock_id, side, order_type, quantity, limit_price)
    VALUES (p_user_id, p_stock_id, p_side, p_order_type, p_quantity, p_limit_price);
    SET v_order_id = LAST_INSERT_ID();
    -- Determine price for immediate settlement: prefer provided limit_price, else current_price
    DECLARE v_price DECIMAL(18,4) DEFAULT 0;
    IF p_order_type = 'MARKET' THEN
      SELECT IFNULL(current_price, 0) INTO v_price FROM stocks WHERE stock_id = p_stock_id FOR UPDATE;
    ELSE
      SET v_price = IFNULL(p_limit_price, 0);
    END IF;
    -- Immediately credit seller's available balance for the sell amount
    UPDATE wallets SET available_balance = available_balance + (v_price * p_quantity) WHERE user_id = p_user_id;
    -- Insert a completed SELL transaction tied to this order so it appears in history
    INSERT INTO transactions (user_id, stock_id, txn_type, quantity, price, amount, reference, txn_status)
    VALUES (p_user_id, p_stock_id, 'SELL', p_quantity, v_price, v_price * p_quantity, CONCAT('order:', v_order_id), 'COMPLETED');
    -- Mark order as settled (seller already received funds)
    UPDATE orders SET settled = 1 WHERE order_id = v_order_id;
  END IF;
  COMMIT;
  SELECT v_order_id AS order_id;
END$$

-- Procedure: cancel order (releases funds/shares)
DROP PROCEDURE IF EXISTS sp_cancel_order$$
CREATE PROCEDURE sp_cancel_order(
  IN p_order_id BIGINT
)
BEGIN
  DECLARE v_user INT;
  DECLARE v_side ENUM('BUY','SELL');
  DECLARE v_qty INT;
  DECLARE v_price DECIMAL(18,4);
  DECLARE v_locked DECIMAL(18,4);
  DECLARE v_settled TINYINT DEFAULT 0;
  START TRANSACTION;
  SELECT user_id, side, quantity, IFNULL(limit_price,0), IFNULL(settled,0) INTO v_user, v_side, v_qty, v_price, v_settled FROM orders WHERE order_id = p_order_id FOR UPDATE;
  IF v_side = 'BUY' THEN
    SET v_locked = v_price * v_qty;
    UPDATE wallets SET locked_balance = locked_balance - v_locked, available_balance = available_balance + v_locked WHERE user_id = v_user;
  ELSE
    -- SELL: return shares to holdings
    UPDATE holdings SET total_quantity = total_quantity + v_qty WHERE user_id = v_user AND stock_id = (SELECT stock_id FROM orders WHERE order_id = p_order_id);
    -- If seller was already credited at order placement, deduct the credited amount when cancelling
    IF v_settled = 1 THEN
      UPDATE wallets SET available_balance = available_balance - (v_price * v_qty) WHERE user_id = v_user;
      -- mark related transaction as cancelled
      UPDATE transactions SET txn_status = 'CANCELLED', txn_time = CURRENT_TIMESTAMP WHERE reference = CONCAT('order:', p_order_id) LIMIT 1;
    END IF;
  END IF;
  UPDATE orders SET status = 'CANCELLED', executed_at = CURRENT_TIMESTAMP WHERE order_id = p_order_id;
  COMMIT;
END$$

-- Procedure: delete user (cascades)
DROP PROCEDURE IF EXISTS sp_delete_user$$
CREATE PROCEDURE sp_delete_user(
  IN p_user_id INT
)
BEGIN
  START TRANSACTION;
  DELETE FROM users WHERE user_id = p_user_id;
  COMMIT;
END$$

-- Procedure: update wallet balance (and insert transaction)
DROP PROCEDURE IF EXISTS sp_update_wallet_balance$$
CREATE PROCEDURE sp_update_wallet_balance(
  IN p_user_id INT,
  IN p_amount DECIMAL(18,4),
  IN p_txn_type ENUM('DEPOSIT','WITHDRAWAL')
)
BEGIN
  START TRANSACTION;
  IF p_txn_type = 'DEPOSIT' THEN
    UPDATE wallets SET available_balance = available_balance + p_amount WHERE user_id = p_user_id;
  ELSE
    UPDATE wallets SET available_balance = available_balance - p_amount WHERE user_id = p_user_id;
  END IF;
  INSERT INTO transactions (user_id, txn_type, amount, reference) VALUES (p_user_id, p_txn_type, p_amount, CONCAT('proc:', UUID()));
  COMMIT;
END$$

DELIMITER ;

SET FOREIGN_KEY_CHECKS = 1;

-- End of combined schema

-- ------------------------------------------------------------------
-- OPTIONAL: Seed data and test flow (examples)
-- The following section includes sample seeds and a test flow that
-- exercises the stored procedures. These statements are optional and
-- can be executed after importing the schema above.
-- ------------------------------------------------------------------

-- Seed demo users (idempotent)
-- Inserts 10 demo users and creates wallets for them
START TRANSACTION;
INSERT INTO users (username, name, email, password_hash, role, company_id)
VALUES
('user1', 'User One', 'user1@example.test', 'hash_pwd_1', 'investor', NULL),
('user2', 'User Two', 'user2@example.test', 'hash_pwd_2', 'investor', NULL),
('user3', 'User Three', 'user3@example.test', 'hash_pwd_3', 'investor', NULL),
('user4', 'User Four', 'user4@example.test', 'hash_pwd_4', 'investor', NULL),
('user5', 'User Five', 'user5@example.test', 'hash_pwd_5', 'investor', NULL),
('user6', 'User Six', 'user6@example.test', 'hash_pwd_6', 'investor', NULL),
('user7', 'User Seven', 'user7@example.test', 'hash_pwd_7', 'investor', NULL),
('user8', 'User Eight', 'user8@example.test', 'hash_pwd_8', 'investor', NULL),
('user9', 'User Nine', 'user9@example.test', 'investor', NULL),
('user10', 'User Ten', 'user10@example.test', 'hash_pwd_10', 'investor', NULL)
ON DUPLICATE KEY UPDATE username=VALUES(username);

INSERT INTO wallets (user_id, currency, available_balance, locked_balance, wallet_type)
SELECT u.user_id, 'INR', 100000.0000, 0.0000, 'real'
FROM users u
WHERE u.username IN ('user1','user2','user3','user4','user5','user6','user7','user8','user9','user10')
  AND NOT EXISTS (SELECT 1 FROM wallets w WHERE w.user_id = u.user_id);
COMMIT;

-- Sample test flow (uncomment or execute manually):
-- CALL sp_create_company_with_stock('Acme Test Co', 'Technology', 'https://acme.test', 1000000, 100.00);
-- CALL sp_create_user_with_wallet('alice', 'Alice Doe', 'alice@example.test', 'hash_abc', 'investor', NULL);
-- CALL sp_create_user_with_wallet('bob', 'Bob Co', 'bob@example.test', 'hash_def', 'company', 1);
-- CALL sp_update_wallet_balance(1, 50000.00, 'DEPOSIT');
-- CALL sp_place_order(1, 1, 'BUY', 'LIMIT', 10, 100.00);
-- INSERT INTO holdings (user_id, stock_id, total_quantity, avg_buy_price) VALUES (2, 1, 100, 90.00)
--   ON DUPLICATE KEY UPDATE total_quantity = VALUES(total_quantity), avg_buy_price = VALUES(avg_buy_price);
-- CALL sp_place_order(2, 1, 'SELL', 'LIMIT', 10, 100.00);
-- CALL sp_cancel_order(1);
-- CALL sp_update_wallet_balance(1, 1000.00, 'WITHDRAWAL');
-- CALL sp_delete_user(2);

-- End of optional seeds/test flow
