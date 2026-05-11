-- =========================================================================
-- UAT migration — adds is_active column to users table
-- Needed so we can "soft-delete" cashiers who have sales history
-- (hard-deleting them would violate the fk_sales_recorded_by FK).
--
-- Open phpMyAdmin → pick `sales_analysis_db` → SQL tab → paste → Go.
-- =========================================================================

USE sales_analysis_db;

ALTER TABLE users
  ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE;

-- All existing users should be active
UPDATE users SET is_active = TRUE;
