-- Migration: split full_name into first_name + last_name
-- Run this ONCE against sales_analysis_db before restarting the backend.

-- Step 1: Add new columns (nullable so existing rows don't fail)
ALTER TABLE users
  ADD COLUMN first_name VARCHAR(50) NOT NULL DEFAULT '',
  ADD COLUMN last_name  VARCHAR(50) NOT NULL DEFAULT '';

-- Step 2: Populate from existing full_name
--   first_name = everything before the first space
--   last_name  = everything after the first space (handles multi-word last names)
UPDATE users SET
  first_name = TRIM(SUBSTRING_INDEX(full_name, ' ', 1)),
  last_name  = TRIM(SUBSTRING(full_name FROM LENGTH(SUBSTRING_INDEX(full_name, ' ', 1)) + 2));

-- Step 3: Remove the old column
ALTER TABLE users DROP COLUMN full_name;
