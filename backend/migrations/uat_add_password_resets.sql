-- =========================================================================
-- UAT migration — adds password_resets table for email-based password reset
-- Run this ONLY if you already have the database set up.
-- If setting up fresh, schema.sql already includes it.
--
-- Open phpMyAdmin → pick `sales_analysis_db` → SQL tab → paste → Go.
-- =========================================================================

USE sales_analysis_db;

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
