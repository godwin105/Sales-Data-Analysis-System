-- =========================================================================
-- Release 2 migration — adds soft-delete support to products
-- Run this ONLY if you already created the database using the Release 1 schema.
-- If you're setting up fresh, just use schema.sql — it already includes this.
--
-- Open phpMyAdmin → pick `sales_analysis_db` → SQL tab → paste → Go.
-- =========================================================================

USE sales_analysis_db;

ALTER TABLE products
  ADD COLUMN is_deleted BOOLEAN NOT NULL DEFAULT FALSE AFTER low_stock_threshold;

CREATE INDEX idx_products_active ON products(user_id, is_deleted);
