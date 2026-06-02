-- =========================================================================
-- Web-Based Sales Data Analysis System
-- Database Schema (MySQL)
-- Based on ERD in FYP End-of-Semester Report (Chapter 4)
-- =========================================================================

CREATE DATABASE IF NOT EXISTS sales_analysis_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE sales_analysis_db;

-- -------------------------------------------------------------------------
-- 1. USERS TABLE
-- Stores both Business Owners (role='admin') and Cashiers (role='cashier').
-- parent_user_id links a cashier to their business owner (supports FR-04).
-- failed_login_attempts + locked_until support FR-05 (5-strike lockout).
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  user_id               INT             AUTO_INCREMENT PRIMARY KEY,
  business_name         VARCHAR(100)    NOT NULL,
  full_name             VARCHAR(100)    NOT NULL,
  email                 VARCHAR(100)    NOT NULL UNIQUE,
  password_hash         VARCHAR(255)    NOT NULL,
  role                  ENUM('admin','cashier') NOT NULL DEFAULT 'admin',
  parent_user_id        INT             NULL,
  failed_login_attempts INT             NOT NULL DEFAULT 0,
  locked_until          DATETIME        NULL,
  is_active             BOOLEAN         NOT NULL DEFAULT TRUE,
  created_at            DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_users_parent
    FOREIGN KEY (parent_user_id) REFERENCES users(user_id)
    ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE INDEX idx_users_email  ON users(email);
CREATE INDEX idx_users_parent ON users(parent_user_id);

-- -------------------------------------------------------------------------
-- 2. PRODUCTS TABLE (Release 2)
-- user_id points to the business owner who owns the catalogue entry.
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
  product_id          INT             AUTO_INCREMENT PRIMARY KEY,
  user_id             INT             NOT NULL,
  name                VARCHAR(100)    NOT NULL,
  category            VARCHAR(50)     NULL,
  purchase_price      DECIMAL(10,2)   NOT NULL,
  selling_price       DECIMAL(10,2)   NOT NULL,
  quantity            DECIMAL(10,2)   NOT NULL DEFAULT 0,
  low_stock_threshold DECIMAL(10,2)   NOT NULL DEFAULT 5,
  is_deleted          BOOLEAN         NOT NULL DEFAULT FALSE, -- Release 2: soft-delete (UC-02)
  created_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_products_user
    FOREIGN KEY (user_id) REFERENCES users(user_id)
    ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE INDEX idx_products_user     ON products(user_id);
CREATE INDEX idx_products_category ON products(category);

-- -------------------------------------------------------------------------
-- 3. SALES TABLE (Release 3)
-- user_id = the business owner (for data isolation).
-- recorded_by = who actually entered the sale (owner or cashier).
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sales (
  sale_id       INT             AUTO_INCREMENT PRIMARY KEY,
  user_id       INT             NOT NULL,
  recorded_by   INT             NOT NULL,
  total_amount  DECIMAL(10,2)   NOT NULL,
  sale_date     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  notes         TEXT            NULL,

  CONSTRAINT fk_sales_user
    FOREIGN KEY (user_id) REFERENCES users(user_id)
    ON DELETE CASCADE,
  CONSTRAINT fk_sales_recorded_by
    FOREIGN KEY (recorded_by) REFERENCES users(user_id)
    ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE INDEX idx_sales_user ON sales(user_id);
CREATE INDEX idx_sales_date ON sales(sale_date);

-- -------------------------------------------------------------------------
-- 4. SALE_ITEMS TABLE (Release 3) - junction table
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sale_items (
  item_id     INT             AUTO_INCREMENT PRIMARY KEY,
  sale_id     INT             NOT NULL,
  product_id  INT             NOT NULL,
  quantity    DECIMAL(10,2)   NOT NULL,
  unit_price  DECIMAL(10,2)   NOT NULL,
  subtotal    DECIMAL(10,2)   NOT NULL,

  CONSTRAINT fk_sale_items_sale
    FOREIGN KEY (sale_id) REFERENCES sales(sale_id)
    ON DELETE CASCADE,
  CONSTRAINT fk_sale_items_product
    FOREIGN KEY (product_id) REFERENCES products(product_id)
    ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE INDEX idx_sale_items_sale    ON sale_items(sale_id);
CREATE INDEX idx_sale_items_product ON sale_items(product_id);

-- -------------------------------------------------------------------------
-- 5. EXPENSES TABLE (Release 4)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS expenses (
  expense_id   INT             AUTO_INCREMENT PRIMARY KEY,
  user_id      INT             NOT NULL,
  category     VARCHAR(50)     NOT NULL,
  description  VARCHAR(255)    NULL,
  amount       DECIMAL(10,2)   NOT NULL,
  expense_date DATE            NOT NULL,
  created_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_expenses_user
    FOREIGN KEY (user_id) REFERENCES users(user_id)
    ON DELETE CASCADE
) ENGINE=InnoDB;

-- -------------------------------------------------------------------------
-- 6. PASSWORD_RESETS TABLE (UAT addition)
-- Stores hashed reset tokens with expiry. Token is hashed so even if this
-- table is compromised, attackers can't use the stored value to reset.
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS password_resets (
  reset_id     INT             AUTO_INCREMENT PRIMARY KEY,
  user_id      INT             NOT NULL,
  token_hash   VARCHAR(255)    NOT NULL,
  expires_at   DATETIME        NOT NULL,
  used_at      DATETIME        NULL,
  created_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_password_resets_user
    FOREIGN KEY (user_id) REFERENCES users(user_id)
    ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE INDEX idx_password_resets_user  ON password_resets(user_id);
CREATE INDEX idx_password_resets_token ON password_resets(token_hash);
