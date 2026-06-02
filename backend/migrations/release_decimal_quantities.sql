-- =========================================================================
-- Release migration - allow fractional product and sale quantities
-- Run this on existing databases created before decimal quantity support.
-- =========================================================================

USE sales_analysis_db;

ALTER TABLE products
  MODIFY quantity DECIMAL(10,2) NOT NULL DEFAULT 0,
  MODIFY low_stock_threshold DECIMAL(10,2) NOT NULL DEFAULT 5;

ALTER TABLE sale_items
  MODIFY quantity DECIMAL(10,2) NOT NULL;
