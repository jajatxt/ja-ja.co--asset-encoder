-- Failed admin login attempts for app-level brute-force protection.
-- Keys are one-way hashes derived from the requester IP.

CREATE TABLE IF NOT EXISTS admin_login_attempts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  key          TEXT NOT NULL,
  attempted_at INTEGER NOT NULL,
  success      INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_admin_login_attempts_key_time ON admin_login_attempts(key, attempted_at DESC);
