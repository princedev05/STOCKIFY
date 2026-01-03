-- Migration: 002_routines.sql
-- Adds stored procedures for common multi-statement operations (insert/update/delete)
-- Import with mysql CLI (supports DELIMITER changes):
--   mysql -u user -p < db/migrations/002_routines.sql

USE stock_market;

DELIMITER $$

-- Create user + wallet (INSERT + INSERT)
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

-- Create company + stock + initial listing (INSERT x3)
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
  -- stock_listings table is deprecated; initial listing is recorded in `stocks` only
  COMMIT;
  SELECT v_company_id AS company_id, v_stock_id AS stock_id;
END$$

-- Place order (INSERT) and lock funds/holdings (UPDATE)
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
    INSERT INTO orders (user_id, stock_id, side, order_type, quantity, limit_price)
    VALUES (p_user_id, p_stock_id, p_side, p_order_type, p_quantity, p_limit_price);
    UPDATE wallets SET available_balance = available_balance - v_needed, locked_balance = locked_balance + v_needed WHERE user_id = p_user_id;
  ELSE
    -- SELL: check holdings
    SELECT IFNULL(total_quantity,0) INTO v_holding_qty FROM holdings WHERE user_id = p_user_id AND stock_id = p_stock_id FOR UPDATE;
    IF v_holding_qty < p_quantity THEN
      ROLLBACK;
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Insufficient holdings for SELL order (procedure)';
    END IF;
    INSERT INTO orders (user_id, stock_id, side, order_type, quantity, limit_price)
    VALUES (p_user_id, p_stock_id, p_side, p_order_type, p_quantity, p_limit_price);
    UPDATE holdings SET total_quantity = total_quantity - p_quantity WHERE user_id = p_user_id AND stock_id = p_stock_id;
  END IF;
  COMMIT;
  SELECT LAST_INSERT_ID() AS order_id;
END$$

-- Cancel order (UPDATE + UPDATE to release funds)
CREATE PROCEDURE sp_cancel_order(
  IN p_order_id BIGINT
)
BEGIN
  DECLARE v_user INT;
  DECLARE v_side ENUM('BUY','SELL');
  DECLARE v_qty INT;
  DECLARE v_price DECIMAL(18,4);
  DECLARE v_locked DECIMAL(18,4);
  START TRANSACTION;
  SELECT user_id, side, quantity, IFNULL(limit_price,0) INTO v_user, v_side, v_qty, v_price FROM orders WHERE order_id = p_order_id FOR UPDATE;
  IF v_side = 'BUY' THEN
    SET v_locked = v_price * v_qty;
    UPDATE wallets SET locked_balance = locked_balance - v_locked, available_balance = available_balance + v_locked WHERE user_id = v_user;
  ELSE
    -- SELL: return shares to holdings
    UPDATE holdings SET total_quantity = total_quantity + v_qty WHERE user_id = v_user AND stock_id = (SELECT stock_id FROM orders WHERE order_id = p_order_id);
  END IF;
  UPDATE orders SET status = 'CANCELLED', executed_at = CURRENT_TIMESTAMP WHERE order_id = p_order_id;
  COMMIT;
END$$

-- Delete user (DELETE) - dangerous: removes user and cascades
CREATE PROCEDURE sp_delete_user(
  IN p_user_id INT
)
BEGIN
  START TRANSACTION;
  DELETE FROM users WHERE user_id = p_user_id;
  COMMIT;
END$$

-- Update wallet balance (UPDATE + INSERT into transactions)
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
