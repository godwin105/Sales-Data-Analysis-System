-- Migration: add email verification support
-- Run this ONCE against sales_analysis_db before restarting the backend.

-- Step 1: Add is_email_verified flag to users
ALTER TABLE users
  ADD COLUMN is_email_verified TINYINT(1) NOT NULL DEFAULT 0;

-- Step 2: Mark all existing users as already verified so they are not locked out
UPDATE users SET is_email_verified = 1;

-- Step 3: Create the email_verifications table
CREATE TABLE IF NOT EXISTS email_verifications (
  verification_id INT          AUTO_INCREMENT PRIMARY KEY,
  user_id         INT          NOT NULL,
  token_hash      VARCHAR(255) NOT NULL,
  expires_at      DATETIME     NOT NULL,
  verified_at     DATETIME     NULL,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_ev_user
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,

  INDEX idx_ev_user_id   (user_id),
  INDEX idx_ev_token_hash (token_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
