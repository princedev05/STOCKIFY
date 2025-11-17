-- Stock Market Simulation DB Schema
CREATE DATABASE IF NOT EXISTS stock_market
 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE stock_market;

-- USERS
CREATE TABLE IF NOT EXISTS users (
  user_id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(100) UNIQUE NOT NULL,
  name VARCHAR(255),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('investor','company') DEFAULT 'investor',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  status ENUM('active', 'inactive', 'suspended') DEFAULT 'active',
  last_login TIMESTAMP NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_user_company FOREIGN KEY (company_id) REFERENCES companies(company_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- WALLETS
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

-- COMPANIES
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

-- STOCKS
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

-- STOCK LISTINGS
CREATE TABLE IF NOT EXISTS stock_listings (
  listing_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  stock_id INT NOT NULL,
  quantity BIGINT NOT NULL,
  price DECIMAL(18,4) NOT NULL,
  listed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_listing_company FOREIGN KEY (company_id) REFERENCES companies(company_id),
  CONSTRAINT fk_listing_stock FOREIGN KEY (stock_id) REFERENCES stocks(stock_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- DAILY PRICES
CREATE TABLE IF NOT EXISTS daily_prices (
  stock_id INT NOT NULL,
  price_date DATE NOT NULL,
  open_price DECIMAL(18,4) NOT NULL,
  close_price DECIMAL(18,4) NOT NULL,
  high_price DECIMAL(18,4) NOT NULL,
  low_price DECIMAL(18,4) NOT NULL,
  volume BIGINT DEFAULT 0,
  PRIMARY KEY (stock_id, price_date),
  CONSTRAINT fk_dailyprices_stock FOREIGN KEY (stock_id) REFERENCES stocks(stock_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- MARKET PRICE UPDATES
CREATE TABLE IF NOT EXISTS market_price_updates (
  update_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  stock_id INT NOT NULL,
  old_price DECIMAL(18,4),
  new_price DECIMAL(18,4),
  change_amount DECIMAL(18,4),
  change_percent DECIMAL(6,3),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_priceupdate_stock FOREIGN KEY (stock_id) REFERENCES stocks(stock_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ORDERS
CREATE TABLE IF NOT EXISTS orders (
  order_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  stock_id INT NOT NULL,
  side ENUM('BUY','SELL') NOT NULL,
  order_type ENUM('MARKET','LIMIT') DEFAULT 'LIMIT',
  quantity INT NOT NULL,
  limit_price DECIMAL(18,4),
  status ENUM('OPEN','PARTIAL','FILLED','CANCELLED','REJECTED') DEFAULT 'OPEN',
  placed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  executed_at TIMESTAMP NULL,
  CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  CONSTRAINT fk_orders_stock FOREIGN KEY (stock_id) REFERENCES stocks(stock_id) ON DELETE CASCADE,
  CHECK (quantity > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- TRADES
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

-- HOLDINGS
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

-- TRANSACTIONS (LEDGER)
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

-- INDEXES
CREATE INDEX idx_daily_prices_date ON daily_prices(stock_id, price_date);
CREATE INDEX idx_trades_stock_time ON trades(stock_id, trade_timestamp);
CREATE INDEX idx_orders_user_status ON orders(user_id, status);
CREATE INDEX idx_holdings_user_stock ON holdings(user_id, stock_id);
CREATE INDEX idx_transactions_user_time ON transactions(user_id, txn_time);
CREATE INDEX idx_orders_stock_status ON orders(stock_id, status);$$

-- TRIGGER: after market_price_updates -> update stocks.current_price
CREATE TRIGGER trg_price_update
AFTER INSERT ON market_price_updates
FOR EACH ROW
BEGIN
    UPDATE stocks
    SET current_price = NEW.new_price
    WHERE stock_id = NEW.stock_id;
END;$$

-- TRIGGER: before inserting BUY/SELL order
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
END;$$

-- PROCEDURE: finalize_trade
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

  UPDATE holdings
  SET total_quantity = total_quantity - p_qty,
      last_updated = CURRENT_TIMESTAMP
  WHERE user_id = v_seller AND stock_id = p_stock_id;

  UPDATE wallets
  SET locked_balance = locked_balance - (p_price * p_qty)
  WHERE user_id = v_buyer;

  UPDATE wallets
  SET available_balance = available_balance + (p_price * p_qty)
  WHERE user_id = v_seller;

  UPDATE orders SET status = 'FILLED', executed_at = CURRENT_TIMESTAMP WHERE order_id IN (p_buy_order_id, p_sell_order_id);

  INSERT INTO transactions (user_id, stock_id, txn_type, quantity, price, amount, reference)
  VALUES (v_buyer, p_stock_id, 'BUY', p_qty, p_price, -p_price * p_qty, CONCAT('trade:', v_trade_id));

  INSERT INTO transactions (user_id, stock_id, txn_type, quantity, price, amount, reference)
  VALUES (v_seller, p_stock_id, 'SELL', p_qty, p_price, p_price * p_qty, CONCAT('trade:', v_trade_id));
END;$$

-- COMPANY NEWS AND ANNOUNCEMENTS
CREATE TABLE IF NOT EXISTS company_news (
  news_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  news_type ENUM('announcement', 'financial', 'dividend', 'event', 'other') DEFAULT 'announcement',
  published_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by INT NOT NULL,
  status ENUM('draft', 'published', 'archived') DEFAULT 'published',
  CONSTRAINT fk_news_company FOREIGN KEY (company_id) REFERENCES companies(company_id) ON DELETE CASCADE,
  CONSTRAINT fk_news_user FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE SET NULL,
  INDEX idx_company_news (company_id, published_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- COMPANY FINANCIAL DATA (Financial Metrics)
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

-- SHAREHOLDER INFORMATION
CREATE TABLE IF NOT EXISTS shareholders (
  shareholder_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  user_id INT NOT NULL,
  total_shares BIGINT DEFAULT 0,
  ownership_percentage DECIMAL(10,4) DEFAULT 0.0000,
  avg_buy_price DECIMAL(18,4) DEFAULT 0.0000,
  current_value DECIMAL(18,4) DEFAULT 0.0000,
  investment_gain_loss DECIMAL(18,4) DEFAULT 0.0000,
  first_purchase_date TIMESTAMP NULL,
  last_purchase_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  status ENUM('active', 'inactive') DEFAULT 'active',
  CONSTRAINT fk_shareholder_company FOREIGN KEY (company_id) REFERENCES companies(company_id) ON DELETE CASCADE,
  CONSTRAINT fk_shareholder_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  UNIQUE (company_id, user_id),
  INDEX idx_company_shareholders (company_id),
  INDEX idx_user_shareholders (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- DIVIDEND MANAGEMENT
CREATE TABLE IF NOT EXISTS dividends (
  dividend_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  dividend_amount DECIMAL(18,4) NOT NULL,
  dividend_date DATE NOT NULL,
  record_date DATE NOT NULL,
  payment_date DATE NOT NULL,
  status ENUM('announced', 'recorded', 'paid', 'cancelled') DEFAULT 'announced',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_dividend_company FOREIGN KEY (company_id) REFERENCES companies(company_id) ON DELETE CASCADE,
  INDEX idx_company_dividends (company_id, dividend_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- DIVIDEND PAYOUTS (Track individual shareholder dividend payments)
CREATE TABLE IF NOT EXISTS dividend_payouts (
  payout_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  dividend_id BIGINT NOT NULL,
  shareholder_id BIGINT NOT NULL,
  amount DECIMAL(18,4) NOT NULL,
  paid_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  status ENUM('pending', 'paid', 'cancelled') DEFAULT 'pending',
  CONSTRAINT fk_payout_dividend FOREIGN KEY (dividend_id) REFERENCES dividends(dividend_id) ON DELETE CASCADE,
  CONSTRAINT fk_payout_shareholder FOREIGN KEY (shareholder_id) REFERENCES shareholders(shareholder_id) ON DELETE CASCADE,
  INDEX idx_shareholder_payouts (shareholder_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- EVENT for periodic price changes
SET GLOBAL event_scheduler = ON;
CREATE EVENT ev_update_stock_prices
ON SCHEDULE EVERY 40 SECOND
DO
BEGIN
    INSERT INTO market_price_updates (stock_id, old_price, new_price, change_amount, change_percent, updated_at)
    SELECT 
        s.stock_id,
        s.current_price AS old_price,
        s.current_price * (1 + ((RAND() * 4 - 2) / 100)) AS new_price,
        (s.current_price * (1 + ((RAND() * 4 - 2) / 100))) - s.current_price AS change_amount,
        ((RAND() * 4 - 2)) AS change_percent,
        NOW()
    FROM stocks s;
END;$$

